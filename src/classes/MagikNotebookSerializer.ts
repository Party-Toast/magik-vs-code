import * as vscode from 'vscode'

interface SerializedOutput {
    mime: string
    data: string
}

interface SerializedCell {
    kind: vscode.NotebookCellKind
    language: string
    value: string
    outputs: SerializedOutput[]
}

export class MagikNotebookSerializer implements vscode.NotebookSerializer {
    async deserializeNotebook(content: Uint8Array, token: vscode.CancellationToken): Promise<vscode.NotebookData> {
        const text = new TextDecoder().decode(content)
        
        let cells: SerializedCell[] = []
        if (text.trim().length > 0) {
            try {
                cells = JSON.parse(text) as SerializedCell[]
            } catch {
                cells = []
            }
        }
        
        const notebookCells = cells.map(cell => {
            const outputs = cell.outputs.map(output => {
                const data = new TextEncoder().encode(output.data)
                const item = new vscode.NotebookCellOutputItem(data, output.mime)
                return new vscode.NotebookCellOutput([item])
            })
            
            const notebookCell = new vscode.NotebookCellData(cell.kind, cell.value, cell.language)
            notebookCell.outputs = outputs
            return notebookCell
        })
        
        if (notebookCells.length === 0) {
            notebookCells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'magik'))
        }
        
        return new vscode.NotebookData(notebookCells)
    }
    
    async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
        const cells: SerializedCell[] = data.cells.map(cell => {
            const outputs = cell.outputs?.flatMap(output =>
                output.items.map(item => ({
                    mime: item.mime,
                    data: new TextDecoder().decode(item.data)
                }))
            )
            
            return {
                kind: cell.kind,
                language: cell.languageId,
                value: cell.value,
                outputs: outputs ?? []
            }
        })
        
        return new TextEncoder().encode(JSON.stringify(cells, null, 4))
    }
}