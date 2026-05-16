import * as vscode from 'vscode'
import { config, sessionManager } from '../extension'

export const magikNotebookController = vscode.notebooks.createNotebookController('magik-notebook-kernel', 'magik-notebook', "Magik Notebook Kernel")

magikNotebookController.executeHandler = async (cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, controller: vscode.NotebookController) => {
	// FIXME: temp
	const magikSession = sessionManager.sessions.find(session => session.notebook === notebook)
	if(!magikSession) {
		return
	}

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
