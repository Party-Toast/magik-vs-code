import * as vscode from 'vscode'

let extensionContext: vscode.ExtensionContext | undefined

type ValidStates = "GIS_VERSION" | "LAYERED_PRODUCT" | "GIS_ALIAS" | "MAGIK_SESSION_PID"

export function setContext(context: vscode.ExtensionContext) {
    extensionContext = context
}

export function getContext(): vscode.ExtensionContext {
    if (!extensionContext) {
        throw new Error('Extension context not set yet!')
    }
    return extensionContext
}

export function setState(key: ValidStates, value: any) {
    getContext().workspaceState.update(key, value)
} 

export function getState<T>(key: ValidStates): T | undefined {
    return getContext().workspaceState.get(key)
}