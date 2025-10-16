const vscode = acquireVsCodeApi()

const term = new window.Terminal({
    theme: { 
        background: "#1e1e1e", 
        foreground: "#ffffff" 
    },
    convertEol: true,
    cursorBlink: true
})

term.open(document.getElementById("terminal"))

// Send every keystroke to the extension
term.onData(data => {
    vscode.postMessage({ type: "input", data })
})

// When receiving output from the extension, write to terminal
window.addEventListener("message", event => {
    const { type, data } = event.data
    console.log(type, data)
    if (type === "output") {
        term.write(data)
    }
})
