import * as vscode from 'vscode'
import { MagikSessionTreeItem } from './MagikSessionTreeItem'
import { MagikSession } from './MagikSession'
import { getContext } from '../utils/state'
import { MagikCodeLensProvider } from './MagikCodeLensProvider'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { MagikClassBrowser } from './MagikClassBrowser'

export class MagikSessionManager implements vscode.TreeDataProvider<MagikSessionTreeItem>{
    public sessions: MagikSession[] = []
    public currentSession: MagikSession | undefined
    public classBrowser: MagikClassBrowser
    public codeLensProvider: MagikCodeLensProvider
    
    private _onDidChangeTreeData = new vscode.EventEmitter<MagikSessionTreeItem | undefined | void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event    

    constructor() {
        this.classBrowser = new MagikClassBrowser()
        this.codeLensProvider = new MagikCodeLensProvider()
        this.registerCommands()
    }

    private registerCommands() {
        const context = getContext()
        context.subscriptions.push(
            vscode.commands.registerCommand('magik-vs-code.refreshSessionManager', this.refresh, this),
            vscode.commands.registerCommand('magik-vs-code.showPrompt', this.showPrompt, this),
            vscode.commands.registerCommand('magik-vs-code.showClassBrowser', this.showClassBrowser, this),
            vscode.commands.registerCommand('magik-vs-code.restartSession', this.restartSession, this),
            vscode.commands.registerCommand('magik-vs-code.killSession', this.killSession, this),
            vscode.commands.registerCommand('magik-vs-code.setCurrentSession', this.setCurrentSession, this),
            vscode.commands.registerCommand('magik-vs-code.removeSession', this.removeSession, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendSectionToSession', this.sendSection, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendFileToSession', this.sendSection, this),
            vscode.commands.registerTextEditorCommand('magik-vs-code.sendSectionAtCurrentPositionToSession', this.sendSectionAtCurrentPosition, this),
            vscode.commands.registerCommand('magik-vs-code.removeExemplar', this.removeExemplar, this),
            vscode.commands.registerCommand('magik-vs-code.configureGisVersions', this.configureGisVersions, this),
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
                new MagikSessionTreeItem(element.session, 'Prompt')
            ]
        }

        return this.sessions.map(session => {
            return new MagikSessionTreeItem(session, 'Session')
        })
    }

    refresh() {
        const activeSessions = this.sessions.filter(session => session.isActive())
        
        if(activeSessions.length === 0) {
            this.currentSession = undefined
        }
        else if(!this.currentSession || !activeSessions.includes(this.currentSession)) {
            this.currentSession = activeSessions[0]
        }

        this.classBrowser.setSession(this.currentSession)
        this._onDidChangeTreeData.fire()
    }
    
    addSession(session: MagikSession) {
        this.sessions.push(session)

        this.refresh()
    }

    async showPrompt(session: MagikSession | undefined) {
        (session ?? this.currentSession)?.showNotebook()
    }

    async showClassBrowser(session: MagikSession | undefined) {
        // (session ?? this.currentSession)?.showClassBrowser()
        this.classBrowser.setSession(session)
        this.classBrowser.show()
    }

    async restartSession(treeItem: MagikSessionTreeItem) {
        if(treeItem.session.isActive()) {
            vscode.window.showWarningMessage('Cannot restart an active session.')
            return
        }

        await treeItem.session.restart()

        // FIXME: session might not be considered active yet when refresh is called. Either fix await after restart, or check if process.on('ready') emits anything
        this.refresh()
    }
    
    async killSession(treeItem: MagikSessionTreeItem | undefined) {
        const session = treeItem?.session ?? this.currentSession

        if(!session) {
            vscode.window.showInformationMessage('No current session')
            return
        }

        const options = ['No', 'Yes', 'Yes (force)'] as const

        const selected = await vscode.window.showQuickPick(options, {
            title: 'Kill the current Magik session?'
        }) as typeof options[number] | undefined

        if(!selected || selected === 'No') {
            return
        }

        await session.kill(selected === 'Yes (force)')
        this.refresh()
    }

    setCurrentSession(treeItem: MagikSessionTreeItem) {
        this.currentSession = treeItem.session
        this.refresh()
    }

    async removeSession(treeItem: MagikSessionTreeItem) {
        if(treeItem.session.isActive()) {
            vscode.window.showWarningMessage('Cannot remove an active session. Kill it first.')
            return
        }

        this.sessions = this.sessions.filter(session => session !== treeItem.session)
        this.refresh()
    }

    async sendSection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, range: vscode.Range) {
        if(!this.currentSession) {
            vscode.window.showInformationMessage('No current session')
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