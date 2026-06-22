import * as vscode from 'vscode'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { magikNotebookController } from './magikNotebookController'
import { Style } from '../enums/Style'
import { Regex } from '../enums/Regex'
import { createInterface, Interface } from 'readline'
import { EventEmitter } from 'stream'
import { once } from 'events'
import { sessionManager } from '../extension'

export class MagikSession {
    gisVersionPath: string
    gisAliasPath: string
    gisAliasName: string
    environmentPath?: string

    process!: ChildProcessWithoutNullStreams
    classBrowserInterface?: Interface
    notebook!: vscode.NotebookDocument
    lastExecutedCell?: vscode.NotebookCell
    cellExecution?: vscode.NotebookCellExecution
    currentOutput: string[]
    hideNextOutput: Boolean

    eventEmitter: EventEmitter

    constructor(gisVersionPath: string, gisAliasPath: string, gisAliasName: string, environmentPath?: string) {
        this.gisVersionPath = gisVersionPath
        this.gisAliasPath = gisAliasPath
        this.gisAliasName = gisAliasName
        this.environmentPath = environmentPath
        this.eventEmitter = new EventEmitter()
        this.currentOutput = []
        this.hideNextOutput = false
        this.startProcess()
        this.createNotebook()
    }

    isActive() {
        return this.process.exitCode === null && this.process.killed === false
    }

    private startProcess() {
        const runaliasPath = `${this.gisVersionPath}\\bin\\x86\\runalias.exe`
        const runaliasArgs = ['-a', this.gisAliasPath]
        if(this.environmentPath) {
            runaliasArgs.push('-e', this.environmentPath)
        }
        runaliasArgs.push(this.gisAliasName)

        const startSessionCommand = `${runaliasPath} ${runaliasArgs.join(' ')}`
        this.process = spawn(startSessionCommand, {
            shell: true
        })

        const lineReader = createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity
        })

        lineReader.on('line', this.processSessionLine.bind(this))
        this.process.stdout.on('data', this.processSessionData.bind(this))
        this.process.on('exit', this.processSessionExit.bind(this))
    }

    async startClassBrowser() {
        if(!this.isActive()) {
            vscode.window.showErrorMessage('Session no longer active.')
            return
        }

        if(this.classBrowserInterface) {
            return this.classBrowserInterface
        }

        await this.send('method_finder.lazy_start?', undefined, true)
        const lastOutput = await this.send('system.process_id', undefined, true)
        const processID = Number(lastOutput[0])
        if(isNaN(processID) || processID === 0) {
            vscode.window.showErrorMessage('Unable to start class browser, please try again.')
            return
        }

        const methodFinderPath = path.join(this.gisVersionPath, 'etc', 'x86', 'mf_connector.exe')
        const startCommand = `${methodFinderPath} -m //./pipe/method_finder/${processID}`
        const process = spawn(startCommand, {
            shell: true
        })

        this.classBrowserInterface = createInterface({
            input: process.stdout,
            output: process.stdin
        })

        return this.classBrowserInterface
    }

    async showKillPrompt() {
        if(!this.isActive()) {
            return vscode.window.showInformationMessage('Session has already been killed.')
        }

        const options = ['No', 'Yes', 'Yes (force)'] as const

        const selected = await vscode.window.showQuickPick(options, {
            title: 'Kill the Magik process?'
        }) as typeof options[number] | undefined

        switch(selected) {
            case 'Yes (force)': 
                this.kill(true)
                break
            case 'Yes':
                this.kill()
                break
        }
    }

    async kill(force?: Boolean) {
        if(this.isActive() && !force) {
            await this.send(`write("Session killed - ${Date()}")`)
            await this.send('quit()')
        }
        
        this.process.kill()
    }

    async restart() {
        this.startProcess()
        await this.showNotebook()
        await vscode.commands.executeCommand('notebook.focusBottom')
        await vscode.commands.executeCommand('notebook.cell.insertCodeCellBelow')
        const cellCount = this.notebook.cellCount
        await vscode.commands.executeCommand('notebook.cell.execute', {
            ranges: [new vscode.NotebookRange(cellCount - 1, cellCount)],
            document: this.notebook.uri
        })
    }

    private async createNotebook() {
        this.notebook = await vscode.workspace.openNotebookDocument(magikNotebookController.notebookType)

        await this.showNotebook()
        await vscode.commands.executeCommand('notebook.cell.execute', {
            ranges: [new vscode.NotebookRange(0, 1)],
            document: this.notebook.uri
        })
    }

    async showNotebook() {
        await vscode.window.showNotebookDocument(this.notebook)
        await vscode.commands.executeCommand('notebook.focusBottom')
        await vscode.commands.executeCommand('notebook.cell.edit')
    }

    private processSessionExit() {
        if(this.cellExecution) {
            this.cellExecution.end(undefined, Date.now())
        }
        this.eventEmitter.emit('magik-ready', this.currentOutput)
        this.classBrowserInterface = undefined

        sessionManager.refresh()
    }

    /**
     * Checks the Magik session for actionable data.
     * 
     * When a Magik prompt is detected, notifies the current @see cellExecution to end and updates the status bar appropriately. 
     * When a prompt to create a global is detected, it's creation is handled indirectly by a prompt in VSCode instead of in the notebook.
     * 
     * In contrast to @see processSessionLine, this does not append the data to the notebook.
     * 
     * @param buffer Session byte data
     */
    private async processSessionData(buffer: Buffer) {
        const lines = buffer.toString().split('\r\n')

        for (const line of lines) {
            if(line.startsWith('Magik>')) {
                this.eventEmitter.emit('magik-ready', this.currentOutput)
                this.currentOutput = []
                this.hideNextOutput = false
                this.appendOutput('\n')
                this.cellExecution?.end(true, Date.now())
                this.cellExecution = undefined
                break
            }

            const globalCreationMatch = line.match(Regex.Session.GlobalCreationPrompt)
            if(globalCreationMatch) {
                const options = ['Yes', 'No'] as const

                const selected = await vscode.window.showQuickPick(options, {
                    title: globalCreationMatch[1]
                }) as typeof options[number] | undefined

                this.process.stdin.write(`${selected === 'Yes' ? 'y' : 'n'}\r\n`)
                break
            }
        }
    }

    async sendSection(range: vscode.Range) {
        const editor = vscode.window.activeTextEditor
        if(!editor) {
            return
        }

        const text = editor.document.getText(range)
        const tempFilePath = path.join(os.tmpdir(), 'sessionBuffer.magik')
        fs.writeFileSync(tempFilePath, text, { encoding: 'utf8' })
        await this.send(`load_file("${tempFilePath}", _unset, "${editor.document.uri.path}")`)
    }


    /**
     * Sends a string to the Magik session.
     * 
     * @param text
     * @param cell Cell to which the session's response is to be written. If no cell is provided, @see lastExecutedCell is used instead.
     * @param hideOutput If true, the session's response is not displayed in the notebook.
     * @returns 
     */
    async send(text: string, cell?: vscode.NotebookCell, hideOutput = false): Promise<string[]> {
        if(!this.isActive()) {
            vscode.window.showErrorMessage('Session no longer active.')
            return Promise.reject()
        }
        
        this.hideNextOutput = hideOutput

        this.lastExecutedCell = cell ?? this.lastExecutedCell!
        this.cellExecution = magikNotebookController.createNotebookCellExecution(this.lastExecutedCell)
        this.cellExecution.token.onCancellationRequested(() => {
            this.process.stdin.write('$\r')
        })
        this.cellExecution.start(Date.now())
        this.process.stdin.write(text + '\r')

        return once(this.eventEmitter, 'magik-ready')
    }

    /**
     * Cleans up and applies styles to a Magik session output line.
     * Unless @see hideNextOutput is true, the line appended to the currently executing notebook.
     * 
     * @param line
     */    
    private async processSessionLine(line: string) {
        if(line.startsWith('Magik>')) {
            line = line.replace('Magik>', '').trimStart()
        }

        this.currentOutput.push(line)

        if(this.hideNextOutput) {
            return
        }

        const globalCreationMatch = line.match(Regex.Session.GlobalCreationPrompt)
        if(globalCreationMatch) {
            line = line.replace(globalCreationMatch[0], '').trimStart()
        }

        line = line
            .replaceAll(Regex.Session.Error, error => applyStyle(error, Style.White, Style.RedBackground))
            .replaceAll(Regex.Session.Traceback, traceback => applyStyle(traceback, Style.Red))
            .replaceAll(Regex.Session.Warning, warning => applyStyle(warning, Style.Black, Style.YellowBackground))
            .replaceAll(Regex.Session.Global, global => applyStyle(global, Style.Green))
            .replaceAll(Regex.Session.String, string => applyStyle(string, Style.Yellow))
            .replaceAll(Regex.Session.TracebackPath, tracebackPath => applyStyle(tracebackPath, Style.Grey))
            .replaceAll(Regex.Session.Todo, todo => applyStyle(todo, Style.Red))
            .replaceAll(Regex.Session.Apropos, (_, type: string, name: string, className: string) => {
                const styledName = name
                    .replace(/^[\w?!\[\]]*/g, name => applyStyle(name, Style.Yellow))
                    .replace(' optional ', applyStyle(' optional ', Style.Cyan))
                    .replace(' gather ', applyStyle(' gather ', Style.Cyan))

                return `${applyStyle(type, type === 'CORRUPT' ? Style.Red : Style.Blue)} ${styledName} ${applyStyle('in', Style.Grey)} ${applyStyle(className, Style.Green)}`
            })

        this.appendOutput(line === '' ? ' ' : line)
    }

    /**
     * Append a line to the current @see cellExecution. 
     * If no cell is currently executing, a temporary execution is created in the last executed cell.
     * 
     * @param line 
     */
    private appendOutput(line: string) {
        if(!this.cellExecution) {
            const tempExecution  = magikNotebookController.createNotebookCellExecution(this.lastExecutedCell!)
            tempExecution.start()
            tempExecution.appendOutput([
                new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stdout(line)])
            ])
            tempExecution.end(undefined)
        }
        else {
            this.cellExecution.appendOutput([
                new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stdout(line)])
            ])
        }
    }
}

export function applyStyle(text: string, ...styleCodes: number[]) {
	return `\x1b[${Style.Reset}m\x1b[${styleCodes.join(';')}m${text}\x1b[${Style.Reset}m`
}
