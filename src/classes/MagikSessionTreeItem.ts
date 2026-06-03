import * as vscode from 'vscode'
import { MagikSession } from './MagikSession'
import { sessionManager } from '../extension'

export class MagikSessionTreeItem extends vscode.TreeItem {
    session: MagikSession

    constructor(session: MagikSession, type: 'Session' | 'Prompt') {
        switch (type) {
            case 'Session':
                super(session.gisAliasName, vscode.TreeItemCollapsibleState.Expanded)
                this.session = session

                if(session.isActive()) {
                    this.contextValue = 'ActiveSession'
                }
                else {
                    this.contextValue = 'KilledSession'
                    this.description = 'Killed'
                }

                if(sessionManager.currentSession === this.session) {
                    this.iconPath = new vscode.ThemeIcon('debug-connected-compact')
                }
                break
            case 'Prompt':
                super(type)
                this.session = session

                this.command = {
                    title: `Magik: Show Prompt`,
                    command: `magik-vs-code.showPrompt`,
                    arguments: [session]
                }

                this.description = session.notebook.uri.path
                break
        }
    }
}