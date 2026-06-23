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

export interface CheckInput {
  users: import('../parser/ad-export.schema').ADUser[]
  groups: import('../parser/ad-export.schema').ADGroup[]
  computers: import('../parser/ad-export.schema').ADComputer[]
  ous: import('../parser/ad-export.schema').ADOU[]
  gpos: import('../parser/ad-export.schema').ADGPO[]
  passwordPolicy?: import('../parser/ad-export.schema').ADPasswordPolicy
  trusts: import('../parser/ad-export.schema').ADTrust[]
  domainInfo: import('../parser/ad-export.schema').ADDomainInfo
  entraSync?: EntraSyncInfo
}

export interface EntraSyncInfo {
  onPremisesSyncEnabled: boolean
  lastSyncDateTime: string | null
  provisioningErrors: number
  dirSyncEnabled: boolean
}

export type CheckRunner = (input: CheckInput) => CheckResult
