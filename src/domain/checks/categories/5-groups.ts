import type { CheckRunner, SampleObject } from '../types'

const MAX_SAMPLE = 5

function sample(items: SampleObject[]): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

// ─── 1. Empty security groups ─────────────────────────────────────────────────

const emptyGroups: CheckRunner = ({ normalised }) => {
  const affected = normalised.groups.filter(
    g => g.isEmpty && g.groupCategory === 'Security'
  )
  return {
    id: 'group-empty',
    category: 'group-rationalisation',
    title: 'Empty security groups',
    severity: affected.length > 20 ? 'medium' : 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(g => ({
      id: g.sAMAccountName,
      label: g.name,
      details: { scope: g.groupScope },
    }))),
    remediation: 'Review and delete empty security groups. Orphaned groups increase sync object count and complicate Entra role assignments. Validate with resource owners before deletion.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/users/groups-lifecycle',
    passed: affected.length === 0,
  }
}

// ─── 2. Single-member groups ──────────────────────────────────────────────────

const singleMemberGroups: CheckRunner = ({ normalised }) => {
  const affected = normalised.groups.filter(
    g => g.isSingleMember && g.groupCategory === 'Security' && !g.isPrivilegedGroup
  )
  return {
    id: 'group-single-member',
    category: 'group-rationalisation',
    title: 'Security groups with only one member',
    severity: 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(g => ({
      id: g.sAMAccountName,
      label: g.name,
      details: {
        member: g.members[0]?.split(',')[0].replace('CN=', '') ?? 'unknown',
      },
    }))),
    remediation: 'Review single-member groups. If the group exists only to wrap one user, assign resource access directly or use a dynamic Entra group post-migration.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/users/groups-dynamic-membership',
    passed: affected.length === 0,
  }
}

// ─── 3. Circular group nesting ────────────────────────────────────────────────

const circularNesting: CheckRunner = ({ normalised }) => {
  const byDN = new Map(normalised.groups.map(g => [g.distinguishedName.toLowerCase(), g]))
  const circular: typeof normalised.groups = []

  for (const root of normalised.groups) {
    const visited = new Set<string>()
    const stack = [root.distinguishedName.toLowerCase()]

    while (stack.length) {
      const dn = stack.pop()!
      if (visited.has(dn)) {
        circular.push(root)
        break
      }
      visited.add(dn)
      const g = byDN.get(dn)
      if (g) {
        for (const memberDN of g.members) {
          const childDN = memberDN.toLowerCase()
          if (byDN.has(childDN)) stack.push(childDN)
        }
      }
    }
  }

  const unique = [...new Map(circular.map(g => [g.distinguishedName, g])).values()]

  return {
    id: 'group-circular-nesting',
    category: 'group-rationalisation',
    title: 'Circular group membership detected',
    severity: unique.length > 0 ? 'high' : 'low',
    affectedCount: unique.length,
    sampleObjects: sample(unique.map(g => ({
      id: g.sAMAccountName,
      label: g.name,
      details: { memberCount: g.members.length },
    }))),
    remediation: 'Break circular group references immediately. Circular nesting causes infinite loops in group expansion tools and may prevent correct sync. Use Get-ADGroupMember -Recursive to verify.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/identity/information-about-group-nesting',
    passed: unique.length === 0,
  }
}

// ─── 4. Groups referencing non-existent member DNs ────────────────────────────

const orphanedMembers: CheckRunner = ({ normalised }) => {
  const allDNs = new Set([
    ...normalised.users.map(u => u.distinguishedName.toLowerCase()),
    ...normalised.computers.map(c => c.distinguishedName.toLowerCase()),
    ...normalised.groups.map(g => g.distinguishedName.toLowerCase()),
  ])

  const groupsWithOrphans = normalised.groups.filter(g =>
    g.members.some(dn => !allDNs.has(dn.toLowerCase()))
  )

  return {
    id: 'group-orphaned-members',
    category: 'group-rationalisation',
    title: 'Groups with orphaned member references',
    severity: groupsWithOrphans.length > 0 ? 'medium' : 'low',
    affectedCount: groupsWithOrphans.length,
    sampleObjects: sample(groupsWithOrphans.map(g => ({
      id: g.sAMAccountName,
      label: g.name,
      details: {
        totalMembers: g.members.length,
        orphanedCount: g.members.filter(dn => !allDNs.has(dn.toLowerCase())).length,
      },
    }))),
    remediation: 'Clean up group membership referencing deleted objects (phantom members). Use Get-ADGroup -Properties Members and filter for objects without a valid DN. Phantom members inflate membership counts in Entra.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/identity/ldap-search-shows-deleted-objects',
    passed: groupsWithOrphans.length === 0,
  }
}

export const groupChecks: CheckRunner[] = [
  emptyGroups,
  singleMemberGroups,
  circularNesting,
  orphanedMembers,
]
