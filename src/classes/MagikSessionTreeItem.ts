import * as vscode from 'vscode'
import { MagikSession } from './MagikSession'

export class MagikSessionTreeItem extends vscode.TreeItem {
    session: MagikSession

    constructor(session: MagikSession, type: 'Session' | 'Prompt' | 'Class Browser') {
        if(type !== 'Session') {
            super(type)
            this.session = session
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
    }
}