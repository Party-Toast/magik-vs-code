import * as vscode from 'vscode'

import { setContext } from './state'
import { MagikCodeLensProvider } from './classes/MagikCodeLensProvider'
import { showGisAliasPicker, showGisVersionPicker, showLayeredProductPicker } from './user_interface'
import { sendSectionToSession } from './magik_session'

export function activate(context: vscode.ExtensionContext) {
	setContext(context)
	registerDisposables(context)
}

export function deactivate() {}

function registerDisposables(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('magik-vs-code.startSession', showGisVersionPicker),
		vscode.commands.registerCommand('magik-vs-code.selectLayeredProduct', showLayeredProductPicker),
		vscode.commands.registerCommand('magik-vs-code.selectGisAlias', showGisAliasPicker),
		// TODO: maybe use registerTextEditorCommand
		vscode.commands.registerCommand('magik-vs-code.sendSectionToSession', sendSectionToSession),
		vscode.languages.registerCodeLensProvider({
			scheme: 'file',
			language: 'magik'
		}, new MagikCodeLensProvider())
	)
}