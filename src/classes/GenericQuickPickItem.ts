import * as vscode from 'vscode'

export class GenericQuickPickItem<T extends object> implements vscode.QuickPickItem {
  data: T
  label: string
  description?: string
  detail?: string

  constructor(object: T, labelKey: keyof T, descriptionKey?: keyof T, detailKey?: keyof T) {
    this.data = object
    this.label = object[labelKey] as string
    this.description = descriptionKey ? object[descriptionKey] as string | undefined : undefined
    this.detail = detailKey ? object[detailKey] as string | undefined : undefined
  }
}