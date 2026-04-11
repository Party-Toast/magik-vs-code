import * as vscode from 'vscode'
import { setContext } from './utils/state'
import { showGisAliasPicker, showGisVersionPicker, showLayeredProductPicker } from './ui/sessionUI'
import { MagikSession } from './classes/MagikSession'
import { MagikNotebookSerializer } from './classes/MagikNotebookSerializer'
import { magikNotebookController } from './classes/MagikNotebookController'

export const config = vscode.workspace.getConfiguration('magik-vs-code')

export let magikSession: MagikSession
export function setMagikSession(session: MagikSession) {
	magikSession = session
}

export function activate(context: vscode.ExtensionContext) {
	setContext(context)
	registerDisposables(context)
}

export function deactivate() {
	magikSession?.kill(true)
}

function registerDisposables(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer('magik-notebook', new MagikNotebookSerializer()),
		magikNotebookController,
		vscode.commands.registerCommand('magik-vs-code.startSession', showGisVersionPicker),
		vscode.commands.registerCommand('magik-vs-code.selectLayeredProduct', showLayeredProductPicker),
		vscode.commands.registerCommand('magik-vs-code.selectGisAlias', showGisAliasPicker)
	)
}