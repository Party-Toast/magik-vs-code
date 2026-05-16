import * as vscode from 'vscode'
import { MagikSessionTreeItem } from './MagikSessionTreeItem'
import { MagikSession } from './MagikSession'
import { getContext } from '../utils/state'
import { MagikCodeLensProvider } from './MagikCodeLensProvider'
import fs from 'fs'
import path from 'path'
import os from 'os'

export class MagikSessionManager implements vscode.TreeDataProvider<MagikSessionTreeItem>{
    public sessions: MagikSession[] = []
    public currentSession: MagikSession | undefined
    public codeLensProvider: MagikCodeLensProvider
    
    private _onDidChangeTreeData = new vscode.EventEmitter<MagikSessionTreeItem | undefined | void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event    

    constructor() {
        this.codeLensProvider = new MagikCodeLensProvider()
        this.registerCommands()
    }

    private registerCommands() {
        const context = getContext()
        context.subscriptions.push(
            vscode.commands.registerCommand('magik-vs-code.refreshSessionManager', this.refresh, this),
            vscode.commands.registerCommand('magik-vs-code.killSession', this.killSession, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendSectionToSession', this.sendSection, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendFileToSession', this.sendSection, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendSectionAtCurrentPositionToSession', this.sendSectionAtCurrentPosition, this),
            vscode.commands.registerCommand('magik-vs-code.removeExemplar', this.removeExemplar, this),
            vscode.commands.registerCommand('magik-vs-code.configureGisVersions', this.configureGisVersions, this),
            // TODO
            // vscode.commands.registerCommand('magik-vs-code.restartSession, this.restartSession, this),
            // vscode.commands.registerCommand('magik-vs-code.showSession', this.showNotebook, this),
            // vscode.commands.registerCommand('magik-vs-code.showClassBrowser', this.showClassBrowser, this),
            vscode.languages.registerCodeLensProvider({
                scheme: 'file',
                language: 'magik'
            }, this.codeLensProvider)
        )
    }
    
    getTreeItem(element: MagikSessionTreeItem): vscode.TreeItem {
        return element
    }
    
    getChildren(element?: MagikSessionTreeItem): MagikSessionTreeItem[] {
        if (element) {
            return [
                new MagikSessionTreeItem(element.session, 'Prompt'),
                new MagikSessionTreeItem(element.session, 'Class Browser')
            ]
        }

        return this.sessions.map(session => {
            return new MagikSessionTreeItem(session, 'Session')
        })
    }

    refresh() {
        this._onDidChangeTreeData.fire()
    }
    
    addSession(session: MagikSession) {
        if(this.sessions.length === 0) {
            this.currentSession = session
        }

        this.sessions.push(session)

        this.refresh()
    }
    
    async killSession(treeItem: MagikSessionTreeItem) {
        const options = ['No', 'Yes', 'Yes (force)'] as const

        const selected = await vscode.window.showQuickPick(options, {
            title: 'Kill the Magik process?'
        }) as typeof options[number] | undefined

        if(!selected || selected === 'No') {
            return
        }

        await treeItem.session.kill(selected === 'Yes (force)')
        this.refresh()
    }

    async sendSection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, range: vscode.Range) {
        if(!this.currentSession) {
            vscode.window.showInformationMessage("No current session")
            return
        }

        const text = editor.document.getText(range)
        const tempFilePath = path.join(os.tmpdir(), 'sessionBuffer.magik')
        fs.writeFileSync(tempFilePath, text, { encoding: 'utf8' })

        await this.currentSession.send(`load_file("${tempFilePath}", _unset, "${editor.document.uri.path}")`)
    }

    async sendSectionAtCurrentPosition(editor: vscode.TextEditor) {
        if(!this.currentSession) {
            vscode.window.showInformationMessage("No current session")
            return
        }

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

    async removeExemplar(exemplarName: string) {
        if(!this.currentSession) {
            vscode.window.showInformationMessage("No current session")
            return
        }

        await this.currentSession.send(`remex(${exemplarName})`)
    }

    configureGisVersions() {
        vscode.commands.executeCommand('workbench.action.openSettings', 'magik-vs-code.gisVersions')
    }
}