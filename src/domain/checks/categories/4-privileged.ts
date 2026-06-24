import type { CheckRunner, SampleObject } from '../types'

const MAX_SAMPLE = 5
const DA_THRESHOLD = 5
const INACTIVE_ADMIN_DAYS = 30

function sample(items: SampleObject[]): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

// ─── 1. Domain Admin count ────────────────────────────────────────────────────

const daCount: CheckRunner = ({ normalised }) => {
  const daGroup = normalised.groups.find(
    g => g.name.toLowerCase() === 'domain admins'
  )
  const count = daGroup?.members.length ?? 0
  const severity = count > DA_THRESHOLD
    ? (count > 10 ? 'blocker' : 'high')
    : 'low'

  return {
    id: 'priv-da-count',
    category: 'privileged-access',
    title: `Domain Admins count (${count}) exceeds recommended threshold (${DA_THRESHOLD})`,
    severity,
    affectedCount: count > DA_THRESHOLD ? count : 0,
    sampleObjects: daGroup ? sample(
      daGroup.members.slice(0, MAX_SAMPLE).map(dn => ({
        id: dn,
        label: dn.split(',')[0].replace('CN=', ''),
        details: {},
      }))
    ) : [],
    remediation: `Reduce Domain Admins to ≤${DA_THRESHOLD} break-glass accounts. Move day-to-day admin work to role-specific groups. Implement Entra PIM for just-in-time privileged access post-migration.`,
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure',
    passed: count <= DA_THRESHOLD,
  }
}

// ─── 2. Nested privileged group depth ─────────────────────────────────────────

const nestedPrivilegedGroups: CheckRunner = ({ normalised }) => {
  const deeplyNested = normalised.groups.filter(
    g => g.isPrivilegedGroup && g.nestingDepth > 2
  )
  return {
    id: 'priv-nested-groups',
    category: 'privileged-access',
    title: 'Privileged groups with deep nesting (depth > 2)',
    severity: deeplyNested.length > 0 ? 'high' : 'low',
    affectedCount: deeplyNested.length,
    sampleObjects: sample(deeplyNested.map(g => ({
      id: g.sAMAccountName,
      label: g.name,
      details: { nestingDepth: g.nestingDepth, memberCount: g.members.length },
    }))),
    remediation: 'Flatten privileged group nesting. Deeply nested groups obscure effective membership and make access reviews unreliable. Entra ID roles do not support on-prem nested group inheritance.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/best-practices',
    passed: deeplyNested.length === 0,
  }
}

// ─── 3. Admin accounts with mailboxes (separation of duties) ──────────────────

const adminMailboxes: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(
    u => u.isPrivileged && u.enabled && !!u.mail
  )
  return {
    id: 'priv-admin-mailboxes',
    category: 'privileged-access',
    title: 'Privileged accounts with mailboxes (separation of duties violation)',
    severity: affected.length > 0 ? 'high' : 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { mail: u.mail, department: u.department },
    }))),
    remediation: 'Admin accounts should not have mailboxes. Create separate named accounts for privileged tasks. This separation prevents phishing-based privilege escalation and is required for Tier 0 hygiene.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-accounts',
    passed: affected.length === 0,
  }
}

// ─── 4. Inactive privileged accounts ─────────────────────────────────────────

const inactiveAdmins: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u => {
    if (!u.isPrivileged || !u.enabled) return false
    if (!u.lastLogonDate) return true
    const days = Math.floor((Date.now() - u.lastLogonDate.getTime()) / 86_400_000)
    return days > INACTIVE_ADMIN_DAYS
  })
  return {
    id: 'priv-inactive-admins',
    category: 'privileged-access',
    title: `Privileged accounts inactive >${INACTIVE_ADMIN_DAYS} days`,
    severity: affected.length > 0 ? 'high' : 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: {
        daysInactive: u.daysInactive,
        lastLogon: u.lastLogonDate?.toISOString() ?? 'never',
      },
    }))),
    remediation: 'Disable or remove unused privileged accounts immediately. Inactive admin accounts are high-value targets. Implement quarterly access reviews for all privileged roles.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview',
    passed: affected.length === 0,
  }
}

// ─── 5. adminCount anomaly (set but not in privileged group) ──────────────────

const adminCountAnomaly: CheckRunner = ({ normalised }) => {
  const privilegedGroupDNs = new Set(
    normalised.groups
      .filter(g => g.isPrivilegedGroup)
      .flatMap(g => g.members)
      .map(dn => dn.toLowerCase())
  )

  const affected = normalised.users.filter(u =>
    u.adminCount != null &&
    u.adminCount > 0 &&
    !privilegedGroupDNs.has(u.distinguishedName.toLowerCase())
  )

  return {
    id: 'priv-admincount-anomaly',
    category: 'privileged-access',
    title: 'Users with adminCount > 0 not in any privileged group',
    severity: affected.length > 0 ? 'medium' : 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { adminCount: u.adminCount },
    }))),
    remediation: 'Run "AdminSDHolder" cleanup. The adminCount attribute indicates the object was previously in a protected group. Clear adminCount and restore ACL inheritance via SDProp if no longer required.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/implementing-least-privilege-administrative-models',
    passed: affected.length === 0,
  }
}

export const privilegedChecks: CheckRunner[] = [
  daCount,
  nestedPrivilegedGroups,
  adminMailboxes,
  inactiveAdmins,
  adminCountAnomaly,
]
