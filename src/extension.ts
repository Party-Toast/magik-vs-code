import * as vscode from 'vscode'
import { setContext } from './utils/state'
import { showGisAliasPicker, showGisVersionPicker, showLayeredProductPicker } from './ui/sessionUI'
import { MagikSession } from './classes/MagikSession'
import { MagikNotebookSerializer } from './classes/MagikNotebookSerializer'
import { magikNotebookController } from './classes/magikNotebookController'
import { MagikSessionManager } from './classes/MagikSessionManager'

export const config = vscode.workspace.getConfiguration('magik-vs-code')

export let sessionManager: MagikSessionManager

export function activate(context: vscode.ExtensionContext) {
	setContext(context)
    sessionManager = new MagikSessionManager()
	registerDisposables(context)
}

export function deactivate() {
    sessionManager.sessions.forEach(session => session.kill(true))
}

function registerDisposables(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('magik-notebook', new MagikNotebookSerializer()),
        magikNotebookController,
        vscode.commands.registerCommand('magik-vs-code.startSession', showGisVersionPicker),
        vscode.commands.registerCommand('magik-vs-code.selectLayeredProduct', showLayeredProductPicker),
        vscode.commands.registerCommand('magik-vs-code.selectGisAlias', showGisAliasPicker),
        vscode.window.registerTreeDataProvider('magik-vs-code.sessionManager', sessionManager),
    )
}

