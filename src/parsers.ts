import * as vscode from 'vscode'
import * as fs from 'fs'
import { GisVersion, LayeredProduct, GisAlias } from './interfaces'

export function parseLayeredProducts(gisVersion: GisVersion): LayeredProduct[] {
	const layeredProductsRaw = fs.readFileSync(`${gisVersion.path}\\..\\smallworld_registry\\LAYERED_PRODUCTS`, 'utf-8')
	return layeredProductsRaw
	.split(/\r?\n(?=\w+:)/)
	.map(productRaw => {
		const lines = productRaw.split('\n').map(line => line.trim())
		const name = lines.shift()?.slice(0, -1)
		const layeredProduct: any = {
			name
		}
		lines.forEach(line => {
			let [key, value] = line.split('=').map(s => s.trim())
			value = value.endsWith('\\') ? value.slice(0, -1) : value // Remove trailing \
			layeredProduct[key] = value.replace('%SMALLWORLD_GIS%', gisVersion.path)
		})

		if(name === 'sw_core') {
			layeredProduct.path = layeredProduct.path.slice(0, -8)
		}

		return layeredProduct
	})
}

export function parseGisAliases(layeredProduct: LayeredProduct, gisVersion: GisVersion): GisAlias[] {
	const gisAliasesPath = `${layeredProduct.path}\\config\\gis_aliases`
	const gisAliasesRaw = fs.readFileSync(gisAliasesPath, 'utf-8')
	const gisAliasesRawNoCommentsNoNewlines = gisAliasesRaw
	.split('\n')
	.filter(line => !line.trim().startsWith('#') && line.trim() !== '')
	.join('\n')
	
	return gisAliasesRawNoCommentsNoNewlines
	.split(/\r?\n(?=\w+:)/)
	.map(aliasRaw => {
		const lines = aliasRaw.split('\n').map(line => line.trim())
		const name = lines.shift()?.slice(0, -1)
		const gisAlias: any = {
			name
		}
		lines.forEach(line => {
			let [key, value] = line.split('=').map(s => s.trim())
			value = value.endsWith('\\') ? value.slice(0, -1) : value
			gisAlias[key] = value.replace('%SMALLWORLD_GIS%', gisVersion.path)
		})
		return gisAlias
	})
}
