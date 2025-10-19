import * as vscode from 'vscode'

export class MagikCodeLensProvider implements vscode.CodeLensProvider {
  onDidChangeCodeLenses?: vscode.Event<void> | undefined

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = []
    const regex = /^\s*_method\b(.*)/gm  // lines starting with "_method"

    const lines = document.getText().split("\n")

    lines.forEach((line, index) => {
        if(!line.startsWith("_method")) { 
            return 
        }

        const relativeEndIndex = lines.slice(index).findIndex(nextLine => nextLine.startsWith("_endmethod")) + 1
        if(!relativeEndIndex) { 
            return 
        }
        
        const endIndex = relativeEndIndex + index
        const startIndex = index !== 0 && lines[index - 1].startsWith("_pragma") ? index - 1 : index
        const range = new vscode.Range(new vscode.Position(startIndex, 0), new vscode.Position(endIndex, "_endmethod".length))

        lenses.push(
            new vscode.CodeLens(new vscode.Range(startIndex, 0, endIndex, 0), {
                    title: 'Send to session',
                    tooltip: 'Send this section to the Magik session',
                    command: 'magik-vs-code.sendToSession',
                    arguments: [range]
                })
        )
    })

    return lenses
  }
}