import type { NormalisedExport } from '../parser/normalised-types'

export interface WaveConfig {
  maxWaveSize: number
  pilotMaxSize: number
  pilotDepartmentKeywords: string[]
}

export const DEFAULT_WAVE_CONFIG: WaveConfig = {
  maxWaveSize: 200,
  pilotMaxSize: 25,
  pilotDepartmentKeywords: ['it', 'information technology', 'ict', 'technology', 'infrastructure', 'helpdesk', 'help desk'],
}

export type RiskFlag =
  | 'privileged'
  | 'service-account'
  | 'spn-linked'
  | 'stale'
  | 'non-routable-upn'
  | 'it-department'

export interface WaveMember {
  sAMAccountName: string
  displayName: string
  department: string | null
  upn: string
  enabled: boolean
  riskScore: number
  riskFlags: RiskFlag[]
  wave: number
}

export interface Wave {
  waveNumber: number
  name: string
  members: WaveMember[]
  criteria: string[]
}

export interface WavePlan {
  waves: Wave[]
  totalUsers: number
  config: WaveConfig
}

export type { NormalisedExport }
