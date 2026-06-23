/**
 * Generator-based streaming normaliser.
 *
 * Instead of normalising all entities at once (which would hold a full
 * NormalisedExport in memory), these generators yield one entity at a time.
 * The check engine consumes them in a single pass, keeping peak memory
 * proportional to one entity + the running accumulator, not the full list.
 *
 * This is what allows the tool to handle 100k-object directories without OOM.
 */

import type { ADExport, ADUser, ADGroup, ADComputer } from './ad-export.schema'
import type { NormalisedUser, NormalisedGroup, NormalisedComputer, NormalisedSPN } from './normalised-types'
import { normalise, parseSPN, isNonRoutableUPN, classifyOS, isEntraJoinSupported } from './normaliser'

const STALE_THRESHOLD_DAYS = 90
const NON_ROUTABLE_TLDS = new Set(['.local', '.internal', '.lan', '.corp', '.home', '.localdomain'])
const PRIVILEGED_GROUP_NAMES = new Set([
  'domain admins', 'enterprise admins', 'schema admins',
  'administrators', 'account operators', 'backup operators',
  'print operators', 'server operators', 'group policy creator owners',
])

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function daysSince(d: Date | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

// ─── User stream ──────────────────────────────────────────────────────────────

export function* streamUsers(
  adExport: ADExport,
): Generator<NormalisedUser> {
  const privilegedDNs = new Set(
    adExport.groups
      .filter(g => PRIVILEGED_GROUP_NAMES.has(g.name.toLowerCase()))
      .map(g => g.distinguishedName.toLowerCase())
  )

  const routableSuffixes = new Set(
    adExport.domainInfo.upnSuffixes
      .filter(s => !isNonRoutableUPN(`u@${s}`))
      .map(s => s.toLowerCase())
  )

  for (const user of adExport.users) {
    const lastLogonDate = parseDate(user.lastLogonDate)
    const passwordLastSet = parseDate(user.passwordLastSet)
    const whenCreated = parseDate(user.whenCreated)
    const daysInactive = daysSince(lastLogonDate)
    const upnDomain = user.userPrincipalName.split('@').pop()?.toLowerCase() ?? ''
    const hasNonRoutableUPN = !routableSuffixes.has(upnDomain)
    const isPrivileged = (user.adminCount != null && user.adminCount > 0)
      || user.memberOf.some(dn => privilegedDNs.has(dn.toLowerCase()))
    const isServiceAccount = user.servicePrincipalNames.length > 0
      || /^(svc[_-]|service[_-]|app[_-]|sql[_-])/i.test(user.sAMAccountName)
    const proxies = user.proxyAddresses.map(p => p.toLowerCase().replace(/^smtp:/, ''))
    const hasProxyCollision = new Set(proxies).size < proxies.length
    const upnPrefix = user.userPrincipalName.split('@')[0].toLowerCase()

    yield {
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
      isStale: lastLogonDate === null || (daysInactive !== null && daysInactive > STALE_THRESHOLD_DAYS),
      daysInactive,
      passwordNeverExpires: user.passwordNeverExpires,
      passwordNotRequired: user.passwordNotRequired,
      hasNonRoutableUPN,
      upnDomain,
      isPrivileged,
      isServiceAccount,
      hasProxyCollision,
      hasUPNSAMMismatch: upnPrefix !== user.sAMAccountName.toLowerCase(),
    }
  }
}

// ─── Group stream ─────────────────────────────────────────────────────────────

export function* streamGroups(adExport: ADExport): Generator<NormalisedGroup> {
  const privilegedDNs = new Set(
    adExport.groups
      .filter(g => PRIVILEGED_GROUP_NAMES.has(g.name.toLowerCase()))
      .map(g => g.distinguishedName.toLowerCase())
  )

  for (const group of adExport.groups) {
    yield {
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
      isPrivilegedGroup: PRIVILEGED_GROUP_NAMES.has(group.name.toLowerCase())
        || group.memberOf.some(dn => privilegedDNs.has(dn.toLowerCase())),
      nestingDepth: 0,
    }
  }
}

// ─── Computer stream ──────────────────────────────────────────────────────────

export function* streamComputers(adExport: ADExport): Generator<NormalisedComputer> {
  for (const computer of adExport.computers) {
    const lastLogonDate = parseDate(computer.lastLogonDate)
    const whenCreated = parseDate(computer.whenCreated)
    const daysInactive = daysSince(lastLogonDate)
    const osCategory = classifyOS(computer.operatingSystem, computer.operatingSystemVersion)

    yield {
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
}

// ─── SPN stream ───────────────────────────────────────────────────────────────

export function* streamSPNs(adExport: ADExport): Generator<NormalisedSPN> {
  for (const user of adExport.users) {
    const type: NormalisedSPN['accountType'] = user.servicePrincipalNames.length > 0 ? 'service-account' : 'user'
    for (const spn of user.servicePrincipalNames) {
      yield parseSPN(spn, user.sAMAccountName, user.distinguishedName, type)
    }
  }
}

// ─── Consume helpers ──────────────────────────────────────────────────────────

/**
 * Drains a generator into an array. Use only when the full list is needed
 * (e.g. for checks that require cross-referencing). For single-pass checks,
 * iterate the generator directly without calling this.
 */
export function collect<T>(gen: Generator<T>): T[] {
  const out: T[] = []
  for (const item of gen) out.push(item)
  return out
}

/**
 * Runs a reducer over a generator without materialising the full array.
 * Peak memory = O(accumulator size), not O(N entities).
 */
export function reduce<T, A>(
  gen: Generator<T>,
  init: A,
  fn: (acc: A, item: T) => A,
): A {
  let acc = init
  for (const item of gen) acc = fn(acc, item)
  return acc
}
