import type { ADOU, ADGPO, ADPasswordPolicy, ADTrust, ADDomainInfo } from './ad-export.schema'

// ─── User ─────────────────────────────────────────────────────────────────────

export interface NormalisedUser {
  sAMAccountName: string
  userPrincipalName: string
  displayName: string
  distinguishedName: string
  department: string | null
  title: string | null
  mail: string | null
  enabled: boolean
  memberOf: string[]
  proxyAddresses: string[]
  servicePrincipalNames: string[]
  adminCount: number | null

  // Parsed dates
  lastLogonDate: Date | null
  passwordLastSet: Date | null
  whenCreated: Date | null

  // Computed
  isStale: boolean
  daysInactive: number | null
  passwordNeverExpires: boolean
  passwordNotRequired: boolean
  hasNonRoutableUPN: boolean
  upnDomain: string
  isPrivileged: boolean
  isServiceAccount: boolean
  hasProxyCollision: boolean
  hasUPNSAMMismatch: boolean
}

// ─── Group ────────────────────────────────────────────────────────────────────

export interface NormalisedGroup {
  name: string
  sAMAccountName: string
  distinguishedName: string
  groupScope: string
  groupCategory: string
  members: string[]
  memberOf: string[]
  description: string | null

  // Computed
  isEmpty: boolean
  isSingleMember: boolean
  isPrivilegedGroup: boolean
  nestingDepth: number
}

// ─── Computer ─────────────────────────────────────────────────────────────────

export type OSCategory =
  | 'windows-11'
  | 'windows-10-current'
  | 'windows-10-eol'
  | 'windows-7-or-older'
  | 'server-2022'
  | 'server-2019'
  | 'server-2016'
  | 'server-eol'
  | 'unknown'

export interface NormalisedComputer {
  name: string
  sAMAccountName: string
  distinguishedName: string
  dnsHostName: string | null
  operatingSystem: string | null
  operatingSystemVersion: string | null
  enabled: boolean
  lastLogonDate: Date | null
  whenCreated: Date | null

  // Computed
  isStale: boolean
  daysInactive: number | null
  osCategory: OSCategory
  entraJoinSupported: boolean
  isServer: boolean
}

// ─── SPN ──────────────────────────────────────────────────────────────────────

export interface NormalisedSPN {
  spn: string
  serviceClass: string
  host: string
  port: number | null
  accountSAM: string
  accountDN: string
  accountType: 'user' | 'computer' | 'service-account'
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ExportStats {
  totalUsers: number
  enabledUsers: number
  staleUsers: number
  usersWithNonRoutableUPN: number
  usersPasswordNeverExpires: number
  usersWithSPNs: number
  serviceAccounts: number
  privilegedUsers: number
  usersWithProxyCollision: number

  totalGroups: number
  emptyGroups: number
  singleMemberGroups: number
  privilegedGroups: number

  totalComputers: number
  enabledComputers: number
  staleComputers: number
  eolComputers: number
  entraJoinCapableComputers: number

  totalSPNs: number
  totalGPOs: number
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface NormalisedExport {
  domainInfo: ADDomainInfo
  users: NormalisedUser[]
  groups: NormalisedGroup[]
  computers: NormalisedComputer[]
  ous: ADOU[]
  gpos: ADGPO[]
  spns: NormalisedSPN[]
  passwordPolicy: ADPasswordPolicy | undefined
  trusts: ADTrust[]
  stats: ExportStats
  exportedAt: string
  anonymised: boolean
}
