import * as vscode from 'vscode'
import { getContext } from '../utils/state'
import { createInterface } from 'readline'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { config } from '../extension'
import path from 'path'
import { Regex } from '../enums/Regex'
import { MagikClassBrowserMethod } from './MagikClassBrowserMethod'
import { MagikSession } from './MagikSession'

export class MagikClassBrowser implements vscode.WebviewViewProvider {
    processID: number
    private process?: ChildProcessWithoutNullStreams
    context: vscode.ExtensionContext
    view?: vscode.WebviewView
    searchParameters = {
        class: '',
        method: '',
        local: false,
        args: false,
        comments: false,
        basic: true,
        advanced: true,
        restricted: true,
        deprecated: true,
        debug: true,
        maxResults: 200
    }
    methodBuffer: MagikClassBrowserMethod[] = []

    constructor(processID: number, magikSession: MagikSession) {
        this.context = getContext()
        this.processID = processID
        this.searchParameters.maxResults = config.get<number>('classBrowserMaxResults')!
        this.start(magikSession.gisVersionPath)
        this.enableCommands()
    }

    private enableCommands() {
        this.context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('magik-vs-code.classBrowser', this),
            vscode.commands.registerCommand('magik-vs-code.searchClassBrowser', this.search, this)
        )
        // Enables keybindings with 'magik-vs-code.classBrowserIsActive' when-clause
        vscode.commands.executeCommand('setContext', 'magik-vs-code.classBrowserIsActive', true)
    }

    private start(gisVersionPath: string) {
        const methodFinderPath = path.join(gisVersionPath, 'etc', 'x86', 'mf_connector.exe')
        // TODO: Use method_finder.socket_pathname instead of hardcoding pipe. This also returns the ID, making the original call obsolete
        const startCommand = `${methodFinderPath} -m //./pipe/method_finder/${this.processID}`
        this.process = spawn(startCommand, {
            shell: true
        })

        const lineReader = createInterface({
            input: this.process.stdout,
            output: this.process.stdin
        })

        lineReader.on('line', line => {
            this.processLine(line)
        })
    }

    private sendToProcess(line: string) {
        this.process!.stdin.write(line + '\n')
    }

    processLine(line: string) {
        // Remove ASCII escape ENQ char
        line = line.replace('\x05', '')

        if(line.startsWith('\x06')) {
            this.processMethodSourceFile(line.replace('\x06', ''))
            return
        }

        switch(true) {
            case Regex.ClassBrowser.Method.test(line):
                const method = new MagikClassBrowserMethod(line)
                this.methodBuffer.push(method)
                break
            case Regex.ClassBrowser.Comment.test(line):
                this.methodBuffer.at(-1)?.appendComment(line, this.searchParameters.args)
                break
            case Regex.ClassBrowser.Total.test(line):
                this.view?.webview.postMessage({
                    type: 'results',
                    results: this.methodBuffer,
                    total: line
                })
                break
            case Regex.ClassBrowser.Info.test(line):
                this.view?.webview.postMessage({
                    type: 'clear'
                })
                this.methodBuffer = []
                break
            case Regex.ClassBrowser.Topic.test(line):
                break
            case line.trim().length > 0:
                // If none of the above and not empty, must be args
                this.methodBuffer.at(-1)?.setArguments(line)
                break

        }
    }

    private processMethodSourceFile(line: string) {
        const parsedMethodResource = Regex.ClassBrowser.MethodResource.exec(line)?.groups
        if(!parsedMethodResource) {
            vscode.window.showErrorMessage(line)
        }
        const methodSourceUri = vscode.Uri.file(parsedMethodResource!.path)
        this.showMethodSource(methodSourceUri, parsedMethodResource!.class, parsedMethodResource!.method, parsedMethodResource!.package)
    }

    private async showMethodSource(uri: vscode.Uri, className: string, methodName: string, packageName: string) {
        const fullMethodName = this.methodString(className, methodName, packageName)
        try {
            await vscode.workspace.fs.stat(uri)
        }
        catch {
            vscode.window.showErrorMessage(`Unable to locate source file for ${fullMethodName}`)
            return
        }

        const document = await vscode.workspace.openTextDocument(uri)
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)
        const symbol = symbols.find(symbol => symbol.name === fullMethodName)

        if(!symbol) {
            vscode.window.showWarningMessage(`Source file found, but unable to locate ${fullMethodName}`)
            return
        }

        const editor = await vscode.window.showTextDocument(document)
        editor.revealRange(symbol.range, vscode.TextEditorRevealType.InCenter)
    }

    methodString(className: string, methodName: string, packageName: string) {
        let methodString = `${packageName ?? 'sw'}:`
        if(className !== '<global>') {
            methodString += className
            if(!methodName.startsWith('[')) {
                methodString += '.'
            }
        }
        methodString += methodName
        return methodString
    }

    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Thenable<void> | void {
        this.view = webviewView
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        }
        webviewView.webview.html = this.htmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage(message => {
            let name

            switch(message.type) {
                case 'ready':
                    this.toggleWebviewInputs()
                    this.focus()
                    break
                case 'textfield':
                    name = message.name as 'class' | 'method'
                    this.searchParameters[name] = message.value
                    break
                case 'button':
                    name = message.name as 'local' | 'args' | 'comments'
                    this.searchParameters[name] = !this.searchParameters[name]
                    break
                case 'goto':
                    const className = message.package ? `${message.package}:${message.class}` : message.class
                    this.sendToProcess(`pr_source_file ${message.method} ${className}`)
                    return
            }

            this.search()
            this.updateWebviewSearchParameters()
        })
    }

    show() {
        if(!this.view?.visible) {
            this.view?.show(false)
        }
        else {
            this.focus()
        }
    }

    focus(input?: 'class' | 'method') {
        this.view?.webview.postMessage({
            type: 'focus',
            input
        })
    }

    search() {
        const query = [
            'unadd class',
            `add class ${this.searchParameters.class}`,
            `method_name ${this.searchParameters.method}`,
            this.searchParameters.args ? 'show_args' : 'dont_show_args',
            this.searchParameters.comments ? 'show_comments' : 'dont_show_comments',
            'show_topics',
            'override_topics',
            this.searchParameters.local ? 'local_only' : 'inherit_all',
            // 'override_flags', // This overrides the search parameters below, but also shows methods without pragma/flags
            this.searchParameters.basic ? 'add basic' : 'unadd basic',
            this.searchParameters.advanced ? 'add advanced' : 'unadd advanced',
            this.searchParameters.restricted ? 'add restricted' : 'unadd restricted',
            this.searchParameters.deprecated ? 'add deprecated' : 'unadd deprecated',
            this.searchParameters.debug ? 'add debug' : 'unadd debug',
            `method_cut_off ${this.searchParameters.maxResults}`,
            'print_curr_methods'
        ];
        this.sendToProcess(query.join('\n'))
    }

    toggleWebviewInputs(enabled = true) {
        this.view?.webview.postMessage({
            type: 'enable',
            enabled
        })
    }

    updateWebviewSearchParameters() {
        this.view?.webview.postMessage({
            type: 'parameters',
            parameters: this.searchParameters
        })
    }

    private htmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src/webviews/class_browser/main.js'))
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src/webviews/class_browser/reset.css'))
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src/webviews/class_browser/vscode.css'))
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src/webviews/class_browser/main.css'))
        const iconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules/@vscode/codicons/dist/codicon.css'))
        const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules/@vscode/codicons/dist/codicon.ttf'))
        /*html*/
        return `
        <!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

                <meta font-src ${webview.cspSource} ${iconsUri}; style-src ${webview.cspSource} ${fontUri};>

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${styleResetUri}" rel="stylesheet"/>
				<link href="${styleVSCodeUri}" rel="stylesheet"/>
				<link href="${styleUri}" rel="stylesheet"/>

                <link href="${iconsUri}" rel="stylesheet"/>

				<title>Magik Class Browser</title>
			</head>
			<body>
				<div class="search-container">
                    <input id="classInput" name="class" class="search-input" placeholder="Class name" disabled/>
                    <input id="methodInput" name="method" class="search-input" placeholder="Method name" disabled/>
                    <button id="localButton" name="local" class="info-button" disabled>Local</button>
                    <button id="argsButton" name="args" class="info-button" disabled>Args</button>
                    <button id="commentsButton" name="comments" class="info-button" disabled>Comments</button>
                    <button id="basicButton" name="basic" class="info-button" disabled>Basic</button>
                    <button id="advancedButton" name="advanced" class="info-button" disabled>Advanced</button>
                    <button id="restrictedButton" name="restricted" class="info-button" disabled>Restricted</button>
                    <button id="deprecatedButton" name="deprecated" class="info-button" disabled>Deprecated</button>
                    <button id="debugButton" name="debug" class="info-button" disabled>Debug</button>
                </div>
                <div>
                    <span class="results-length"></span>
                </div>
				<ul class="results-list">
				</ul>
                <script src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
