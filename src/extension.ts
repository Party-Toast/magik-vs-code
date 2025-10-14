import * as vscode from 'vscode'
import * as fs from 'fs'
import { setContext, setState, getState, getContext } from './state'

const config = vscode.workspace.getConfiguration("magik-vs-code")

export function activate(context: vscode.ExtensionContext) {
	setContext(context)

	const disposable = vscode.commands.registerCommand("magik-vs-code.startSession", () => {
		showGisVersionPicker()
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}

function showGisVersionPicker() {
	const gisVersions = config.get('gisVersions') as any[]

	const gisVersionPicker = vscode.window.createQuickPick()
	gisVersionPicker.step = 1
	gisVersionPicker.totalSteps = 3
	gisVersionPicker.title = "Select GIS version"
	gisVersionPicker.placeholder = "Search"
	gisVersionPicker.matchOnDescription = true
	gisVersionPicker.items = gisVersions.map(gisVersion => ({
		["label"]: gisVersion.name,
		["description"]: gisVersion.version,
		["detail"]: gisVersion.directory
	}))

	gisVersionPicker.onDidChangeSelection(selectedGisVersions => {
		gisVersionPicker.enabled = false
		gisVersionPicker.busy = true
		showLayeredProductPicker(selectedGisVersions[0])
	})
	gisVersionPicker.onDidHide(() => {
		gisVersionPicker.dispose()
	})
	
	gisVersionPicker.show()
}

async function showLayeredProductPicker(gisVersion: vscode.QuickPickItem) {
	const layeredProducts = parseLayeredProducts(gisVersion)
	// TODO: For some reason, sw_core's config is one dir up, (in /core instead of /core/sw_core)
	//		 Check why this is and how this can be fixed
	const layeredProductsWithGisAliases = layeredProducts.filter(product => {
		const gisAliasesPath = `${product.path}\\config\\gis_aliases`
		return fs.existsSync(gisAliasesPath)
	})
	
	const layeredProductPicker = vscode.window.createQuickPick()
	layeredProductPicker.step = 2
	layeredProductPicker.totalSteps = 3
	layeredProductPicker.title = "Select a layered product with GIS aliases"
	layeredProductPicker.placeholder = "Search"
	layeredProductPicker.items = layeredProductsWithGisAliases.map(layeredProduct => ({
		["label"]: layeredProduct.name,
		["description"]: layeredProduct.version,
		["detail"]: layeredProduct.path
	}))

	layeredProductPicker.onDidChangeSelection(layeredProducts => {
		layeredProductPicker.enabled = false
		layeredProductPicker.busy = true
		showGisAliasPicker(layeredProducts[0], gisVersion)
	})
	layeredProductPicker.onDidHide(() => {
		layeredProductPicker.dispose()
	})

	layeredProductPicker.show()
}

function showGisAliasPicker(layeredProduct: vscode.QuickPickItem, gisVersion: vscode.QuickPickItem) {
	const gisAliases = parseGisAliases(layeredProduct, gisVersion)
	
	const gisAliasPicker = vscode.window.createQuickPick()
	gisAliasPicker.step = 3
	gisAliasPicker.totalSteps = 3
	gisAliasPicker.title = "Select a GIS alias"
	gisAliasPicker.placeholder = "Search"
	gisAliasPicker.matchOnDescription = true
	gisAliasPicker.items = gisAliases.map(gisAlias => ({
		["label"]: gisAlias.name,
		["description"]: gisAlias.title
	}))

	gisAliasPicker.onDidChangeSelection(gisAlias => {
		console.log(gisAlias)
	})
	gisAliasPicker.onDidHide(() => {
		gisAliasPicker.dispose()
	})

	gisAliasPicker.show()
}

function startSession(gisVersionPath: string, gisAliasPath: string, gisAlias: string, envPath?: string) {

}

const parseLayeredProducts = (gisVersion: vscode.QuickPickItem) => {
	const gisVersionPath = gisVersion.detail!
	const layeredProductsRaw = fs.readFileSync(`${gisVersionPath} \\..\\smallworld_registry\\LAYERED_PRODUCTS`, "utf-8")
	return layeredProductsRaw
    	.split(/\r?\n(?=\w+:)/)
		.map(productRaw => {
			const lines = productRaw.split("\n").map(line => line.trim())
			const name = lines.shift()?.slice(0, -1)
			// TODO: create interface for layered product
			const layeredProduct: any = {
				name
			}
			lines.forEach(line => {
				let [key, value] = line.split("=").map(s => s.trim())
				value = value.endsWith("\\") ? value.slice(0, -1) : value // Remove trailing \
				layeredProduct[key] = value.replace("%SMALLWORLD_GIS%", gisVersionPath)
			})
			return layeredProduct
		})
}

const parseGisAliases = (layeredProduct: vscode.QuickPickItem, gisVersion: vscode.QuickPickItem) => {
	const gisVersionPath = gisVersion.detail!
	
	const gisAliasesPath = `${layeredProduct.detail!}\\config\\gis_aliases`
	const gisAliasesRaw = fs.readFileSync(gisAliasesPath, "utf-8")
	const gisAliasesRawNoCommentsNoNewlines = gisAliasesRaw
		.split("\n")
		.filter(line => !line.trim().startsWith("#") && line.trim() !== "")
		.join("\n")

	return gisAliasesRawNoCommentsNoNewlines
		.split(/\r?\n(?=\w+:)/)
		.map(aliasRaw => {
			const lines = aliasRaw.split("\n").map(line => line.trim())
			const name = lines.shift()?.slice(0, -1)
			// TODO: create interface for layered product
			const gisAlias: any = {
				name
			}
			lines.forEach(line => {
				let [key, value] = line.split("=").map(s => s.trim())
				value = value.endsWith("\\") ? value.slice(0, -1) : value
				gisAlias[key] = value.replace("%SMALLWORLD_GIS%", gisVersionPath)
			})
			return gisAlias
		})
}

// TODO: when executing runalias.exe, remember to check if environment.bat exists and is added using the -e flag