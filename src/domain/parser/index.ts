import { ADExportSchema, type ADExport } from './ad-export.schema'

export interface ParseResult {
  success: true
  data: ADExport
  warnings: string[]
}

export interface ParseError {
  success: false
  errors: Array<{ path: string; message: string }>
}

export function parseADExport(raw: unknown): ParseResult | ParseError {
  const result = ADExportSchema.safeParse(raw)

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((e) => ({
        path: e.path.join('.') || 'root',
        message: e.message,
      })),
    }
  }

  const warnings: string[] = []
  const data = result.data

  if (data.users.length === 0) warnings.push('Export contains no users')
  if (data.groups.length === 0) warnings.push('Export contains no groups')
  if (data.gpos.length === 0) warnings.push('No GPO data — GPO posture checks will be skipped')
  if (!data.passwordPolicy) warnings.push('No password policy data — policy checks will be skipped')

  return { success: true, data, warnings }
}

export function parseADExportFromJson(json: string): ParseResult | ParseError {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return {
      success: false,
      errors: [{ path: 'root', message: 'Invalid JSON: failed to parse input' }],
    }
  }
  return parseADExport(raw)
}

export type { ADExport }
