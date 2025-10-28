import * as vscode from 'vscode'
import * as fs from 'fs'
import { GisAlias, GisVersion, LayeredProduct } from './interfaces'
import { GenericQuickPickItem } from './classes/GenericQuickPickItem'
import { getState, setState } from './state'
import { parseGisAliases, parseLayeredProducts } from './parsers'
import { startMagikSession } from './magik_session'

const config = vscode.workspace.getConfiguration('magik-vs-code')

export function showGisVersionPicker() {
	const gisVersions = config.get('gisVersions') as GisVersion[]
	
	if(gisVersions.length === 0) {
		vscode.window.showWarningMessage('No GIS versions found', 'Open Settings').then(selection => {
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'magik-vs-code.gisVersions')
			}
		})
		return
	}
	
	const gisVersionPicker = vscode.window.createQuickPick<GenericQuickPickItem<GisVersion>>()
	gisVersionPicker.step = 1
	gisVersionPicker.totalSteps = 3
	gisVersionPicker.title = 'Select GIS version'
	gisVersionPicker.placeholder = 'Search'
	gisVersionPicker.matchOnDescription = true
	gisVersionPicker.items = gisVersions.map(gisVersion => (
		new GenericQuickPickItem(gisVersion, 'name', 'version', 'path')
	))
	
	gisVersionPicker.onDidChangeSelection(selectedQuickPickItems => {
		gisVersionPicker.enabled = false
		gisVersionPicker.busy = true
		
		const gisVersion = selectedQuickPickItems[0].data
		const runaliasPath = `${gisVersion.path}\\bin\\x86\\runalias.exe`
		
		if(!fs.existsSync(runaliasPath)) {
			vscode.window.showErrorMessage(`${runaliasPath} not found`, 'Open Settings').then(selection => {
				if (selection === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'magik-vs-code.gisVersions')
				}
			})
		}
		
		setState('GIS_VERSION', gisVersion)
		showLayeredProductPicker()
	})
	gisVersionPicker.onDidHide(() => {
		gisVersionPicker.dispose()
	})
	
	gisVersionPicker.show()
}

export async function showLayeredProductPicker() {
	const gisVersion = getState('GIS_VERSION') as GisVersion | undefined

	if(!gisVersion) {
		vscode.window.showErrorMessage('Unable to select a layered product, please select a GIS version first.', 'Select GIS version').then(selection => {
			if(selection === 'Select GIS version') {
				vscode.commands.executeCommand('magik-vs-code.startSession')
			}
		})
		return
	}

	const layeredProducts = parseLayeredProducts(gisVersion)
	const layeredProductsWithGisAliases = layeredProducts.filter(layeredProduct => {
		const gisAliasesPath = `${layeredProduct.path}\\config\\gis_aliases`
		return fs.existsSync(gisAliasesPath)
	})
	
	const layeredProductPicker = vscode.window.createQuickPick<GenericQuickPickItem<LayeredProduct>>()
	layeredProductPicker.step = 2
	layeredProductPicker.totalSteps = 3
	layeredProductPicker.title = 'Select a layered product with GIS aliases'
	layeredProductPicker.placeholder = 'Search'
	layeredProductPicker.items = layeredProductsWithGisAliases.map(layeredProduct => (
		new GenericQuickPickItem(layeredProduct, 'name', 'version', 'path')
	))
	
	layeredProductPicker.onDidChangeSelection(selectedQuickPickItems => {
		layeredProductPicker.enabled = false
		layeredProductPicker.busy = true
		
		const layeredProduct = selectedQuickPickItems[0].data
		setState('LAYERED_PRODUCT', layeredProduct)
		showGisAliasPicker()
	})
	layeredProductPicker.onDidHide(() => {
		layeredProductPicker.dispose()
	})
	
	layeredProductPicker.show()
}

export function showGisAliasPicker() {
	const gisVersion = getState('GIS_VERSION') as GisVersion | undefined
	if(!gisVersion) {
		vscode.window.showErrorMessage('Unable to select a GIS alias, please select a GIS version first.', 'Select GIS version').then(selection => {
			if(selection === 'Select GIS version') {
				vscode.commands.executeCommand('magik-vs-code.startSession')
			}
		})
		return
	}
	
	const layeredProduct = getState('LAYERED_PRODUCT') as LayeredProduct | undefined
	if(!layeredProduct) {
		vscode.window.showErrorMessage('Unable to select a GIS alias product, please select a layered product first.', 'Select layered product').then(selection => {
			if(selection === 'Select layered product') {
				vscode.commands.executeCommand('magik-vs-code.selectLayeredProduct')
			}
		})
		return
	}


	const gisAliases = parseGisAliases(layeredProduct, gisVersion)
	
	const gisAliasPicker = vscode.window.createQuickPick<GenericQuickPickItem<GisAlias>>()
	gisAliasPicker.step = 3
	gisAliasPicker.totalSteps = 3
	gisAliasPicker.title = 'Select a GIS alias'
	gisAliasPicker.placeholder = 'Search'
	gisAliasPicker.matchOnDescription = true
	gisAliasPicker.items = gisAliases.map(gisAlias => (
		new GenericQuickPickItem(gisAlias, 'name', 'title')
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