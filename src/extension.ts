import * as vscode from 'vscode'
import { setContext } from './utils/state'
import { showGisAliasPicker, showGisVersionPicker, showLayeredProductPicker } from './ui/sessionUI'
import { MagikSession } from './classes/MagikSession'
import { MagikNotebookSerializer } from './classes/MagikNotebookSerializer'
import { magikNotebookController } from './classes/magikNotebookController'

export const config = vscode.workspace.getConfiguration('magik-vs-code')

export let magikSession: MagikSession

export const magikSessions: MagikSession[] = []

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
		vscode.commands.registerCommand('magik-vs-code.selectGisAlias', showGisAliasPicker),
		vscode.window.registerTreeDataProvider('magik-vs-code.sessionManager', new MagikSessionTreeDataProvider()),
		vscode.commands.registerCommand('magik-vs-code.killSessionFromTree', (item: MagikSessionTreeItem) => {
			vscode.window.showInformationMessage(`Selected ${item.label}`)
		})
	)
}

class MagikSessionTreeItem extends vscode.TreeItem {
  constructor(label: string, collapsible: vscode.TreeItemCollapsibleState) {
    super(label, collapsible)
  }
}

class MagikSessionTreeDataProvider implements vscode.TreeDataProvider<MagikSessionTreeItem> {
  getTreeItem(element: MagikSessionTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: MagikSessionTreeItem): MagikSessionTreeItem[] {
    if (element) {
      return [
        new MagikSessionTreeItem('Prompt', vscode.TreeItemCollapsibleState.None),
        new MagikSessionTreeItem('Class Browser', vscode.TreeItemCollapsibleState.None)
      ]
    }
    return [
      new MagikSessionTreeItem('personal | sw_core | base', vscode.TreeItemCollapsibleState.Collapsed),
      new MagikSessionTreeItem('Cambridge DB open', vscode.TreeItemCollapsibleState.Collapsed)
    ]
  }
}