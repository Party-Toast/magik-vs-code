import * as vscode from 'vscode'
import { setContext } from './utils/state'
import { showGisAliasPicker, showGisVersionPicker, showLayeredProductPicker } from './ui/sessionUI'
import { MagikSession } from './classes/MagikSession'

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

class MagikNotebookSerializer implements vscode.NotebookSerializer {
	async deserializeNotebook(
		content: Uint8Array,
		_token: vscode.CancellationToken
	): Promise<vscode.NotebookData> {
		return new vscode.NotebookData([
			new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'magik')
		]);
	}

	async serializeNotebook(
		data: vscode.NotebookData,
		_token: vscode.CancellationToken
	): Promise<Uint8Array> {
		return new TextEncoder().encode('');
	}
}

export const magikNotebookController = vscode.notebooks.createNotebookController('magik-notebook-kernel', 'magik-notebook', "Magik Notebook Kernel")
magikNotebookController.executeHandler = async (cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, controller: vscode.NotebookController) => {
	for(const cell of cells) {
		await magikSession.send(cell.document.getText(), cell)

		if(!config.get<Boolean>('createCellAfterExecution') || cell.index !== notebook.cellCount - 1) {
			continue
		}

		const newCellText = config.get<Boolean>('copyContentOnCellCreation') ? cell.document.getText() : ''
		const newCell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, newCellText, 'magik')
		const edit = new vscode.WorkspaceEdit()
		edit.set(notebook.uri, [
			vscode.NotebookEdit.insertCells(notebook.cellCount, [newCell])
		])
		await vscode.workspace.applyEdit(edit)
		await vscode.commands.executeCommand('notebook.focusBottom')
		await vscode.commands.executeCommand('notebook.cell.edit')
	}
}
