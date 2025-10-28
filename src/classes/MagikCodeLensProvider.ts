import * as vscode from 'vscode'

export class MagikCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = []

        const lines = document.getText().split('\n')
        lines.forEach((line, index) => {
            if(!isSectionStart(line)) {
                return
            }

            const relativeEndIndex = lines.slice(index).findIndex(nextLine => nextLine.trim() === '$')
            if(!relativeEndIndex) { 
                return 
            }
            
            const endIndex = relativeEndIndex + index
            const startIndex = index !== 0 && lines[index - 1].startsWith('_pragma') ? index - 1 : index
            const range = new vscode.Range(new vscode.Position(startIndex, 0), new vscode.Position(endIndex, 1))

            codeLenses.push(
                new vscode.CodeLens(new vscode.Range(startIndex, 0, startIndex, line.length), {
                        title: 'Send to session',
                        tooltip: 'Send this section to the Magik session',
                        command: 'magik-vs-code.sendSectionToSession',
                        arguments: [range]
                    })
            )
        })

        return codeLenses
    }
}

function isSectionStart(line: string) {
    return line.startsWith('_method') ||
    line.startsWith('_private _method') ||
    line.startsWith('def_slotted_exemplar(') ||
    (!line.startsWith('#') && line.includes('.define_shared_constant(')) ||
    (!line.startsWith('#') && line.includes('.define_shared_variable(')) ||
    line.startsWith('_global _constant') ||
    line.startsWith('_constant')
}