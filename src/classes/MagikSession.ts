import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { magikNotebookController, setMagikSession } from '../extension'
import * as vscode from 'vscode'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { Style } from '../enums/Style'
import { Regex } from '../enums/Regex'
import { getContext, getState } from '../utils/state'
import { MagikCodeLensProvider } from './MagikCodeLensProvider'
import { MagikClassBrowser } from './MagikClassBrowser'
import { createInterface } from 'readline'
import { EventEmitter } from 'stream'
import { once } from 'events'
import { GisVersion } from '../interfaces/GisVersion'
import { LayeredProduct } from '../interfaces/LayeredProduct'

export class MagikSession {
    gisVersionPath: string
    gisAliasPath: string
    gisAliasName: string
    environmentPath?: string

    process!: ChildProcessWithoutNullStreams
    notebook!: vscode.NotebookDocument
    lastExecutedCell?: vscode.NotebookCell
    cellExecution?: vscode.NotebookCellExecution
    currentOutput: string[]
    hideNextOutput: Boolean

    codeLensProvider!: MagikCodeLensProvider
    classBrowser?: MagikClassBrowser

    statusBarItem!: vscode.StatusBarItem

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
        this.createStatusBarItem()
        this.createNotebook()
        this.enableCommands()
    }

    isActive() {
        return !this.process.killed
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

        lineReader.on('line', line => {
            const lineWithoutPrompt = line.startsWith('Magik>') ? line.replace('Magik>', '').trimStart() : line
            this.currentOutput.push(lineWithoutPrompt)
            if(!this.hideNextOutput) {
                this.processLine(lineWithoutPrompt)
            }
        })

        this.process.stdout.on('data', async (chunk: Buffer) => {
            const lines = chunk.toString().split('\r\n')

            for (const line of lines) {
                if(line.startsWith('Magik>')) {
                    this.eventEmitter.emit('magik-ready', this.currentOutput)
                    this.currentOutput = []
                    this.hideNextOutput = false
                    this.appendOutput('\n')
                    this.cellExecution?.end(true, Date.now())
                    this.cellExecution = undefined
                    this.updateStatusBar(false)
                    break
                }

                const globalCreationMatch = line.match(Regex.Session.GlobalCreationPrompt)
                if(globalCreationMatch) {
                    const shouldCreateGlobal = await vscode.window.showQuickPick(['Yes', 'No'], {
                        title: globalCreationMatch[1]
                    })
                    this.process.stdin.write(`${shouldCreateGlobal === 'Yes' ? 'y' : 'n'}\r\n`)
                    break
                }
            }


        })
    }

    async showKillPrompt() {
        if(!this.isActive()) {
            return vscode.window.showInformationMessage('Session has already been killed.')
        }

        const shouldKillProcess = await vscode.window.showQuickPick(['Yes', 'No'], {
            title: 'Kill the Magik process?'
        })

        if(shouldKillProcess === 'Yes') {
            this.kill()
        }
    }

    private kill() {
        this.process.kill()
        this.classBrowser?.toggleWebviewInputs(false)
    }

    private async createNotebook() {
        this.notebook = await vscode.workspace.openNotebookDocument(magikNotebookController.notebookType)
        vscode.workspace.onDidCloseNotebookDocument(notebook => {
            if(notebook === this.notebook && this.isActive()) {
                this.showKillPrompt()
            }
        })

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

    private enableCommands() {
        this.codeLensProvider = new MagikCodeLensProvider()
        const context = getContext()
        context.subscriptions.push(
            vscode.commands.registerCommand('magik-vs-code.killSession', this.showKillPrompt, this),
            vscode.commands.registerCommand('magik-vs-code.sendSectionToSession', this.sendSection, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendSectionAtCurrentPositionToSession', this.sendSectionAtCurrentPosition, this),
            vscode.commands.registerCommand('magik-vs-code.sendFileToSession', this.sendSection, this),
            vscode.commands.registerCommand('magik-vs-code.removeExemplar', this.removeExemplar, this),
            vscode.commands.registerCommand('magik-vs-code.showSession', this.showNotebook, this),
            vscode.commands.registerCommand('magik-vs-code.showClassBrowser', this.showClassBrowser, this),
            vscode.languages.registerCodeLensProvider({
                scheme: 'file',
                language: 'magik'
            }, this.codeLensProvider)
        )
        // Enables keybindings with 'magik-vs-code.sessionIsActive' when-clause
        vscode.commands.executeCommand('setContext', 'magik-vs-code.sessionIsActive', true)
    }

    private createStatusBarItem() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100)
        const gisVersion = getState<GisVersion>('GIS_VERSION')
        const layeredProduct = getState<LayeredProduct>('LAYERED_PRODUCT')
        this.updateStatusBar(false)
        this.statusBarItem.tooltip = `${gisVersion?.name} | ${layeredProduct?.name} | ${this.gisAliasName}`
        this.statusBarItem.command = 'magik-vs-code.showSession'
        this.statusBarItem.show()
    }

    private updateStatusBar(loading: Boolean) {
        const icon = loading ? 'sync~spin' : 'wand'
        this.statusBarItem.text = `$(${icon}) Magik Session Active`
    }

    async sendSectionAtCurrentPosition(editor: vscode.TextEditor) {
        const index = editor.selection.active.line
        const codeLens = this.codeLensProvider.codeLenses.find(codeLens => {
            return codeLens.range.contains(new vscode.Position(index, 0))
        })

        if(!codeLens) {
            return vscode.window.showWarningMessage('Not within range of item to send.')
        }

        await vscode.commands.executeCommand('magik-vs-code.sendSectionToSession', ...codeLens.command!.arguments ?? [])

        // DEBUG: Highlight code lens range
        // editor.setDecorations(vscode.window.createTextEditorDecorationType({
        //     backgroundColor: '#ee3355ff'
        // }), [codeLens.range])
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

    async removeExemplar(exemplarName: string) {
        await this.send(`remex(${exemplarName})`)
    }

    async showClassBrowser() {
        if(!this.classBrowser) {
            await this.send('method_finder.lazy_start?', undefined, true)
            const lastOutput = await this.send('system.process_id', undefined, true)
            const processID = Number(lastOutput[0])
            if(isNaN(processID) || processID === 0) {
                vscode.window.showErrorMessage('Unable to start class browser, please try again.')
                return
            }
            this.classBrowser = new MagikClassBrowser(Number(processID))
        }
        this.classBrowser.show()
    }

    async send(text: string, cell?: vscode.NotebookCell, hideOutput = false): Promise<string[]> {
        if(!this.isActive()) {
            vscode.window.showErrorMessage('Session no longer active.')
            return Promise.reject()
        }
        this.updateStatusBar(true)
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

    private async processLine(line: string) {
        const globalCreationMatch = line.match(Regex.Session.GlobalCreationPrompt)
        if(globalCreationMatch) {
            line = line.replace(globalCreationMatch[0], '').trimStart()
        }

        line = line.replaceAll(Regex.Session.Error, error => applyStyle(error, Style.White, Style.RedBackground))

        line = line.replaceAll(Regex.Session.Traceback, traceback => applyStyle(traceback, Style.Red))

        line = line.replaceAll(Regex.Session.Warning, warning => applyStyle(warning, Style.Black, Style.YellowBackground))

        line = line.replaceAll(Regex.Session.Global, global => applyStyle(global, Style.Green))

        line = line.replaceAll(Regex.Session.String, string => applyStyle(string, Style.Yellow))

        line = line.replaceAll(Regex.Session.Apropos, (_, type: string, name: string, className: string) => {
            const styledName = name
                .replace(/^[\w?!\[\]]*/g, name => applyStyle(name, Style.Yellow))
                .replace(' optional ', applyStyle(' optional ', Style.Cyan))
                .replace(' gather ', applyStyle(' gather ', Style.Cyan))

            return `${applyStyle(type, type === 'CORRUPT' ? Style.Red : Style.Blue)} ${styledName} ${applyStyle('in', Style.Grey)} ${applyStyle(className, Style.Green)}`
        })

        line = line.replaceAll(Regex.Session.TracebackPath, tracebackPath => applyStyle(tracebackPath, Style.Grey))

        line = line.replaceAll(Regex.Session.Todo, todo => applyStyle(todo, Style.Red))

        this.appendOutput(line === '' ? ' ' : line)
    }

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
