import * as vscode from 'vscode'
import * as fs from 'fs'
import { setContext, setState, getState, getContext } from './state'
import { GenericQuickPickItem } from './classes/GenericQuickPickItem'
import { GisAlias, GisVersion, LayeredProduct } from './interface'

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
	const gisVersions = config.get('gisVersions') as GisVersion[]

	const gisVersionPicker = vscode.window.createQuickPick<GenericQuickPickItem<GisVersion>>()
	gisVersionPicker.step = 1
	gisVersionPicker.totalSteps = 3
	gisVersionPicker.title = "Select GIS version"
	gisVersionPicker.placeholder = "Search"
	gisVersionPicker.matchOnDescription = true
	gisVersionPicker.items = gisVersions.map(gisVersion => (
		new GenericQuickPickItem(gisVersion, "name", "version", "path")
	))

	gisVersionPicker.onDidChangeSelection(selectedQuickPickItems => {
		gisVersionPicker.enabled = false
		gisVersionPicker.busy = true

		const gisVersion = selectedQuickPickItems[0].data
		showLayeredProductPicker(gisVersion)
	})
	gisVersionPicker.onDidHide(() => {
		gisVersionPicker.dispose()
	})
	
	gisVersionPicker.show()
}

async function showLayeredProductPicker(gisVersion: GisVersion) {
	const layeredProducts = parseLayeredProducts(gisVersion)
	// TODO: For some reason, sw_core's config is one dir up, (in /core instead of /core/sw_core)
	//		 Check why this is and how this can be fixed
	const layeredProductsWithGisAliases = layeredProducts.filter(layeredProduct => {
		const gisAliasesPath = `${layeredProduct.path}\\config\\gis_aliases`
		return fs.existsSync(gisAliasesPath)
	})
	
	const layeredProductPicker = vscode.window.createQuickPick<GenericQuickPickItem<LayeredProduct>>()
	layeredProductPicker.step = 2
	layeredProductPicker.totalSteps = 3
	layeredProductPicker.title = "Select a layered product with GIS aliases"
	layeredProductPicker.placeholder = "Search"
	layeredProductPicker.items = layeredProductsWithGisAliases.map(layeredProduct => (
		new GenericQuickPickItem(layeredProduct, "name", "version", "path")
	))

	layeredProductPicker.onDidChangeSelection(selectedQuickPickItems => {
		layeredProductPicker.enabled = false
		layeredProductPicker.busy = true

		const layeredProduct = selectedQuickPickItems[0].data
		showGisAliasPicker(layeredProduct, gisVersion)
	})
	layeredProductPicker.onDidHide(() => {
		layeredProductPicker.dispose()
	})

	layeredProductPicker.show()
}

function showGisAliasPicker(layeredProduct: LayeredProduct, gisVersion: GisVersion) {
	const gisAliases = parseGisAliases(layeredProduct, gisVersion)
	
	const gisAliasPicker = vscode.window.createQuickPick<GenericQuickPickItem<GisAlias>>()
	gisAliasPicker.step = 3
	gisAliasPicker.totalSteps = 3
	gisAliasPicker.title = "Select a GIS alias"
	gisAliasPicker.placeholder = "Search"
	gisAliasPicker.matchOnDescription = true
	gisAliasPicker.items = gisAliases.map(gisAlias => (
		new GenericQuickPickItem(gisAlias, "name", "title")
	))

	gisAliasPicker.onDidChangeSelection(selectedQuickPickItems => {
		const selectedGisAlias = selectedQuickPickItems[0].data
		const environmentPath = `${layeredProduct.path}\\config\\environment.bat`
		const gisAliasPath = `${layeredProduct.path}\\config\\gis_aliases`
		if(fs.existsSync(environmentPath)) {
			startMagikSession(gisVersion.path, gisAliasPath, selectedGisAlias.name, environmentPath)
		}
		else {
			startMagikSession(gisVersion.path, gisAliasPath, selectedGisAlias.name)
		}
	})
	gisAliasPicker.onDidHide(() => {
		gisAliasPicker.dispose()
	})

	gisAliasPicker.show()
}

function startMagikSession(gisVersionPath: string, gisAliasPath: string, gisAliasName: string, environmentPath?: string) {
	// TODO: Check overloading createTerminal with options: vscode.ExtensionTerminalOptions
	// 		 This should allow for the extension to control the terminal
	// TODO: Check if "Magik Session" terminal already exists instead of always creating a new one
	const magikSessionTerminal = vscode.window.createTerminal("Magik Session")
	magikSessionTerminal.show()
	
	let startCommand = `${gisVersionPath}\\bin\\x86\\runalias.exe -a ${gisAliasPath} ${gisAliasName}`
	if(environmentPath) {
		startCommand = `${startCommand} -e ${environmentPath}`
	}
	magikSessionTerminal.sendText(startCommand.replaceAll("\\", "/"))
}

const parseLayeredProducts = (gisVersion: GisVersion): LayeredProduct[] => {
	const layeredProductsRaw = fs.readFileSync(`${gisVersion.path}\\..\\smallworld_registry\\LAYERED_PRODUCTS`, "utf-8")
	return layeredProductsRaw
    	.split(/\r?\n(?=\w+:)/)
		.map(productRaw => {
			const lines = productRaw.split("\n").map(line => line.trim())
			const name = lines.shift()?.slice(0, -1)
			const layeredProduct: any = {
				name
			}
			lines.forEach(line => {
				let [key, value] = line.split("=").map(s => s.trim())
				value = value.endsWith("\\") ? value.slice(0, -1) : value // Remove trailing \
				layeredProduct[key] = value.replace("%SMALLWORLD_GIS%", gisVersion.path)
			})
			return layeredProduct
		})
}

const parseGisAliases = (layeredProduct: LayeredProduct, gisVersion: GisVersion): GisAlias[] => {
	const gisAliasesPath = `${layeredProduct.path}\\config\\gis_aliases`
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
			const gisAlias: any = {
				name
			}
			lines.forEach(line => {
				let [key, value] = line.split("=").map(s => s.trim())
				value = value.endsWith("\\") ? value.slice(0, -1) : value
				gisAlias[key] = value.replace("%SMALLWORLD_GIS%", gisVersion.path)
			})
			return gisAlias
		})
}
