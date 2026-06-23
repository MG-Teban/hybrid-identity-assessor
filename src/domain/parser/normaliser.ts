import type { ADExport, ADUser, ADGroup, ADComputer } from './ad-export.schema'
import type {
  NormalisedExport, NormalisedUser, NormalisedGroup, NormalisedComputer,
  NormalisedSPN, OSCategory, ExportStats,
} from './normalised-types'

// ─── Constants ────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_DAYS = 90

const NON_ROUTABLE_TLDS = new Set(['.local', '.internal', '.lan', '.corp', '.home', '.localdomain'])

const PRIVILEGED_GROUP_NAMES = new Set([
  'domain admins', 'enterprise admins', 'schema admins',
  'administrators', 'account operators', 'backup operators',
  'print operators', 'server operators', 'group policy creator owners',
])

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function daysSince(date: Date | null): number | null {
  if (!date) return null
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

// ─── UPN helpers ──────────────────────────────────────────────────────────────

function extractUPNDomain(upn: string): string {
  const at = upn.lastIndexOf('@')
  return at >= 0 ? upn.slice(at + 1).toLowerCase() : ''
}

export function isNonRoutableUPN(upn: string): boolean {
  const domain = extractUPNDomain(upn)
  if (!domain) return true
  return NON_ROUTABLE_TLDS.has(`.${domain.split('.').pop()}`)
}

// ─── OS classification ────────────────────────────────────────────────────────

export function classifyOS(os: string | null | undefined, ver: string | null | undefined): OSCategory {
  if (!os) return 'unknown'
  const o = os.toLowerCase()

  if (o.includes('windows 11')) return 'windows-11'

  if (o.includes('windows 10') || o.includes('windows 10')) {
    // Build numbers: 22H2=19045, 21H2=19044, 21H1=19043; EOL threshold <19041
    const build = ver ? parseInt(ver.match(/\((\d+)\)/)?.[1] ?? '0') : 0
    return build >= 19041 ? 'windows-10-current' : 'windows-10-eol'
  }

  if (o.includes('windows 7') || o.includes('windows xp') || o.includes('windows vista') || o.includes('windows 8')) {
    return 'windows-7-or-older'
  }

  if (o.includes('server')) {
    if (o.includes('2022')) return 'server-2022'
    if (o.includes('2019')) return 'server-2019'
    if (o.includes('2016')) return 'server-2016'
    // 2012, 2008, 2003 = EOL
    return 'server-eol'
  }

  return 'unknown'
}

export function isEntraJoinSupported(category: OSCategory): boolean {
  return category === 'windows-11' || category === 'windows-10-current'
}

// ─── SPN parsing ──────────────────────────────────────────────────────────────

export function parseSPN(
  spn: string,
  accountSAM: string,
  accountDN: string,
  accountType: NormalisedSPN['accountType'],
): NormalisedSPN {
  // Format: ServiceClass/host[:port][/serviceName]
  const slash = spn.indexOf('/')
  const serviceClass = slash >= 0 ? spn.slice(0, slash) : spn
  const rest = slash >= 0 ? spn.slice(slash + 1) : ''
  const hostPart = rest.split('/')[0]
  const colonIdx = hostPart.lastIndexOf(':')
  const host = colonIdx >= 0 ? hostPart.slice(0, colonIdx) : hostPart
  const port = colonIdx >= 0 ? parseInt(hostPart.slice(colonIdx + 1)) || null : null

  return { spn, serviceClass, host, port, accountSAM, accountDN, accountType }
}

// ─── Proxy collision detection ────────────────────────────────────────────────

function hasProxyCollision(proxyAddresses: string[]): boolean {
  // A collision exists when the same address appears with different case prefixes
  // e.g. SMTP:x@y.com and smtp:x@y.com both pointing to same address
  const addresses = proxyAddresses.map(p => p.toLowerCase().replace(/^smtp:/, ''))
  return new Set(addresses).size < addresses.length
}

// ─── Per-entity normalisers ───────────────────────────────────────────────────

function normaliseUser(
  user: ADUser,
  routableUPNSuffixes: Set<string>,
  privilegedDNs: Set<string>,
): NormalisedUser {
  const lastLogonDate = parseDate(user.lastLogonDate)
  const passwordLastSet = parseDate(user.passwordLastSet)
  const whenCreated = parseDate(user.whenCreated)
  const daysInactive = daysSince(lastLogonDate)
  const isStale = lastLogonDate === null || (daysInactive !== null && daysInactive > STALE_THRESHOLD_DAYS)
  const upnDomain = extractUPNDomain(user.userPrincipalName)
  const hasNonRoutableUPN = !routableUPNSuffixes.has(upnDomain) && isNonRoutableUPN(user.userPrincipalName)

  // Privileged: adminCount set, or member of a privileged group
  const isPrivileged = (user.adminCount != null && user.adminCount > 0)
    || user.memberOf.some(dn => privilegedDNs.has(dn.toLowerCase()))

  // Service account: has SPNs or sAMAccountName matches common prefixes
  const isServiceAccount = user.servicePrincipalNames.length > 0
    || /^(svc[_-]|service[_-]|app[_-]|sql[_-]|iis[_-])/i.test(user.sAMAccountName)

  // UPN/SAM mismatch: sAMAccountName prefix doesn't match UPN prefix
  const upnPrefix = user.userPrincipalName.split('@')[0].toLowerCase()
  const hasUPNSAMMismatch = upnPrefix !== user.sAMAccountName.toLowerCase()

  return {
    sAMAccountName: user.sAMAccountName,
    userPrincipalName: user.userPrincipalName,
    displayName: user.displayName ?? user.sAMAccountName,
    distinguishedName: user.distinguishedName,
    department: user.department ?? null,
    title: user.title ?? null,
    mail: user.mail ?? null,
    enabled: user.enabled,
    memberOf: user.memberOf,
    proxyAddresses: user.proxyAddresses,
    servicePrincipalNames: user.servicePrincipalNames,
    adminCount: user.adminCount ?? null,
    lastLogonDate,
    passwordLastSet,
    whenCreated,
    isStale,
    daysInactive,
    passwordNeverExpires: user.passwordNeverExpires,
    passwordNotRequired: user.passwordNotRequired,
    hasNonRoutableUPN,
    upnDomain,
    isPrivileged,
    isServiceAccount,
    hasProxyCollision: hasProxyCollision(user.proxyAddresses),
    hasUPNSAMMismatch,
  }
}

function normaliseGroup(group: ADGroup, privilegedDNs: Set<string>): NormalisedGroup {
  const nameLC = group.name.toLowerCase()
  return {
    name: group.name,
    sAMAccountName: group.sAMAccountName,
    distinguishedName: group.distinguishedName,
    groupScope: group.groupScope ?? 'Unknown',
    groupCategory: group.groupCategory ?? 'Unknown',
    members: group.members,
    memberOf: group.memberOf,
    description: group.description ?? null,
    isEmpty: group.members.length === 0,
    isSingleMember: group.members.length === 1,
    isPrivilegedGroup: PRIVILEGED_GROUP_NAMES.has(nameLC)
      || group.memberOf.some(dn => privilegedDNs.has(dn.toLowerCase())),
    nestingDepth: 0, // populated by computeGroupNesting
  }
}

function normaliseComputer(computer: ADComputer): NormalisedComputer {
  const lastLogonDate = parseDate(computer.lastLogonDate)
  const whenCreated = parseDate(computer.whenCreated)
  const daysInactive = daysSince(lastLogonDate)
  const osCategory = classifyOS(computer.operatingSystem, computer.operatingSystemVersion)

  return {
    name: computer.name,
    sAMAccountName: computer.sAMAccountName,
    distinguishedName: computer.distinguishedName,
    dnsHostName: computer.dnsHostName ?? null,
    operatingSystem: computer.operatingSystem ?? null,
    operatingSystemVersion: computer.operatingSystemVersion ?? null,
    enabled: computer.enabled,
    lastLogonDate,
    whenCreated,
    isStale: lastLogonDate === null || (daysInactive !== null && daysInactive > STALE_THRESHOLD_DAYS),
    daysInactive,
    osCategory,
    entraJoinSupported: isEntraJoinSupported(osCategory),
    isServer: !!computer.operatingSystem?.toLowerCase().includes('server'),
  }
}

// ─── Group nesting depth (BFS) ────────────────────────────────────────────────

function computeGroupNesting(groups: NormalisedGroup[]): void {
  const byDN = new Map(groups.map(g => [g.distinguishedName.toLowerCase(), g]))

  for (const root of groups) {
    if (!root.isPrivilegedGroup) continue
    const visited = new Set<string>()
    const queue: Array<{ dn: string; depth: number }> = [{ dn: root.distinguishedName.toLowerCase(), depth: 0 }]

    while (queue.length) {
      const { dn, depth } = queue.shift()!
      if (visited.has(dn)) continue
      visited.add(dn)

      const group = byDN.get(dn)
      if (!group) continue
      if (depth > group.nestingDepth) group.nestingDepth = depth

      for (const memberDN of group.members) {
        const child = byDN.get(memberDN.toLowerCase())
        if (child) queue.push({ dn: memberDN.toLowerCase(), depth: depth + 1 })
      }
    }
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function computeStats(
  users: NormalisedUser[],
  groups: NormalisedGroup[],
  computers: NormalisedComputer[],
  spns: NormalisedSPN[],
  gpos: ADExport['gpos'],
): ExportStats {
  return {
    totalUsers: users.length,
    enabledUsers: users.filter(u => u.enabled).length,
    staleUsers: users.filter(u => u.enabled && u.isStale).length,
    usersWithNonRoutableUPN: users.filter(u => u.hasNonRoutableUPN).length,
    usersPasswordNeverExpires: users.filter(u => u.enabled && u.passwordNeverExpires).length,
    usersWithSPNs: users.filter(u => u.servicePrincipalNames.length > 0).length,
    serviceAccounts: users.filter(u => u.isServiceAccount).length,
    privilegedUsers: users.filter(u => u.isPrivileged).length,
    usersWithProxyCollision: users.filter(u => u.hasProxyCollision).length,

    totalGroups: groups.length,
    emptyGroups: groups.filter(g => g.isEmpty).length,
    singleMemberGroups: groups.filter(g => g.isSingleMember).length,
    privilegedGroups: groups.filter(g => g.isPrivilegedGroup).length,

    totalComputers: computers.length,
    enabledComputers: computers.filter(c => c.enabled).length,
    staleComputers: computers.filter(c => c.enabled && c.isStale).length,
    eolComputers: computers.filter(c => c.osCategory === 'windows-7-or-older' || c.osCategory === 'windows-10-eol' || c.osCategory === 'server-eol').length,
    entraJoinCapableComputers: computers.filter(c => c.entraJoinSupported).length,

    totalSPNs: spns.length,
    totalGPOs: gpos.length,
  }
}

// ─── Main normaliser ──────────────────────────────────────────────────────────

export function normalise(adExport: ADExport): NormalisedExport {
  // Build routable UPN suffix set from domain info
  const nonRoutableSuffixes = new Set(
    adExport.domainInfo.upnSuffixes.filter(s => isNonRoutableUPN(`user@${s}`))
  )
  const routableUPNSuffixes = new Set(
    adExport.domainInfo.upnSuffixes
      .filter(s => !nonRoutableSuffixes.has(s))
      .map(s => s.toLowerCase())
  )

  // Build privileged group DN set for cross-referencing
  const privilegedDNs = new Set(
    adExport.groups
      .filter(g => PRIVILEGED_GROUP_NAMES.has(g.name.toLowerCase()))
      .map(g => g.distinguishedName.toLowerCase())
  )

  const users = adExport.users.map(u => normaliseUser(u, routableUPNSuffixes, privilegedDNs))
  const groups = adExport.groups.map(g => normaliseGroup(g, privilegedDNs))
  const computers = adExport.computers.map(normaliseComputer)

  computeGroupNesting(groups)

  // Extract SPNs from users and computers
  const spns: NormalisedSPN[] = []
  for (const u of adExport.users) {
    const type: NormalisedSPN['accountType'] = u.servicePrincipalNames.length > 0 ? 'service-account' : 'user'
    for (const s of u.servicePrincipalNames) {
      spns.push(parseSPN(s, u.sAMAccountName, u.distinguishedName, type))
    }
  }
  for (const c of adExport.computers) {
    // Computers have implicit SPNs (HOST/name) — include explicitly listed ones only
    for (const s of (c as ADComputer & { servicePrincipalNames?: string[] }).servicePrincipalNames ?? []) {
      spns.push(parseSPN(s, c.sAMAccountName, c.distinguishedName, 'computer'))
    }
  }

  const stats = computeStats(users, groups, computers, spns, adExport.gpos)

  return {
    domainInfo: adExport.domainInfo,
    users,
    groups,
    computers,
    ous: adExport.ous,
    gpos: adExport.gpos,
    spns,
    passwordPolicy: adExport.passwordPolicy,
    trusts: adExport.trusts,
    stats,
    exportedAt: adExport.exportedAt,
    anonymised: adExport.anonymised,
  }
}
