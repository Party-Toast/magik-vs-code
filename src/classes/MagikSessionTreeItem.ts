import * as vscode from 'vscode'
import { MagikSession } from './MagikSession'
import { sessionManager } from '../extension'

export class MagikSessionTreeItem extends vscode.TreeItem {
    session: MagikSession

    constructor(session: MagikSession, type: 'Session' | 'Prompt' | 'Class Browser') {
        if(type !== 'Session') {
            super(type)
            this.session = session

            this.command = {
                title: `Magik: Show ${type}`,
                command: `magik-vs-code.show${type.replaceAll(' ', '')}`,
                arguments: [session]
            }

            if(type === 'Prompt') {
                this.description = session.notebook.uri.path
            }
            return
        }

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
            this.iconPath = new vscode.ThemeIcon('debug-connected')
        }
    }
}