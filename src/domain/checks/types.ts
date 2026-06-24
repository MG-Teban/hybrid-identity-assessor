import type { NormalisedExport } from '../parser/normalised-types'

export type CheckSeverity = 'blocker' | 'high' | 'medium' | 'low'

export type CheckCategory =
  | 'identity-hygiene'
  | 'sync-readiness'
  | 'auth-modernisation'
  | 'privileged-access'
  | 'group-rationalisation'
  | 'device-gpo-posture'

export interface SampleObject {
  id: string
  label: string
  details?: Record<string, string | number | boolean | null>
}

export interface CheckResult {
  id: string
  category: CheckCategory
  title: string
  severity: CheckSeverity
  affectedCount: number
  sampleObjects: SampleObject[]
  remediation: string
  effortEstimate: 'hours' | 'days' | 'weeks'
  docsUrl: string
  passed: boolean
}

export interface EntraSyncInfo {
  onPremisesSyncEnabled: boolean
  lastSyncDateTime: string | null
  provisioningErrors: number
  dirSyncEnabled: boolean
}

export interface CheckInput {
  normalised: NormalisedExport
  entraSync?: EntraSyncInfo
}

export type CheckRunner = (input: CheckInput) => CheckResult
