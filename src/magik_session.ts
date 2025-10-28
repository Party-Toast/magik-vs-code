import * as vscode from 'vscode'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getState, setState } from './state'

export async function startMagikSession(gisVersionPath: string, gisAliasPath: string, gisAliasName: string, environmentPath?: string) {
	const runaliasPath = `${gisVersionPath}\\bin\\x86\\runalias.exe`
	const runaliasArgs = ['-a', `${gisAliasPath}`, `${gisAliasName}`]
	if(environmentPath) {
		runaliasArgs.push('-e', environmentPath)
	}

	const magikSessionTerminal = vscode.window.createTerminal({
		name: 'Magik Session',
		iconPath: new vscode.ThemeIcon('wand'),
		shellPath: runaliasPath,
		shellArgs: runaliasArgs
	})
	magikSessionTerminal.show()
	setState('MAGIK_SESSION_PID', await magikSessionTerminal.processId)
}

export function sendSectionToSession(range: vscode.Range) {
	if(range === undefined) {
		return
	}

	const editor = vscode.window.activeTextEditor
	if(!editor) {
		return 
	}

	const magikSessionPID = getState('MAGIK_SESSION_PID') as number | undefined
	if(!magikSessionPID) {
		vscode.window.showInformationMessage('No active Magik session.')
		return
	}

	const magikSessionTerminal = vscode.window.terminals.find(async terminal => await terminal.processId === magikSessionPID && terminal.name === 'Magik Session')
	if(!magikSessionTerminal) {
		vscode.window.showInformationMessage('Magik session no longer active, please start a new one.')
		return
	}

	const text = editor.document.getText(range)
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage('Unable to find workspace folder.')
		return
	}

	const tempFilePath = path.join(os.tmpdir(), 'sessionBuffer.magik')
	fs.writeFileSync(tempFilePath, text, { encoding: 'utf8' })
	magikSessionTerminal.sendText(`load_file("${tempFilePath}")`)
}