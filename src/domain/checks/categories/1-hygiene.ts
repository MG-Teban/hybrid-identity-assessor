import type { CheckRunner, CheckResult, SampleObject } from '../types'
import type { NormalisedUser, NormalisedComputer } from '../../parser/normalised-types'

const STALE_DAYS = 90
const DISABLED_LINGER_DAYS = 180
const MAX_SAMPLE = 5

function sample(items: Array<{ id: string; label: string; details?: Record<string, string | number | boolean | null> }>): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

// ─── 1. Stale enabled users (>90d no logon) ───────────────────────────────────

const staleUsers: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(
    u => u.enabled && !u.isServiceAccount && u.isStale
  )
  return {
    id: 'hygiene-stale-users',
    category: 'identity-hygiene',
    title: 'Stale enabled user accounts (>90 days inactive)',
    severity: 'high',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { daysInactive: u.daysInactive, department: u.department },
    }))),
    remediation: 'Disable or delete accounts inactive for >90 days. Review with HR before deletion. Consider an AD lifecycle process tied to HR offboarding.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/users/clean-up-unmanaged-accounts',
    passed: affected.length === 0,
  }
}

// ─── 2. Stale enabled computers (>90d no logon) ───────────────────────────────

const staleComputers: CheckRunner = ({ normalised }) => {
  const affected = normalised.computers.filter(c => c.enabled && c.isStale)
  return {
    id: 'hygiene-stale-computers',
    category: 'identity-hygiene',
    title: 'Stale enabled computer accounts (>90 days inactive)',
    severity: 'medium',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(c => ({
      id: c.sAMAccountName,
      label: c.name,
      details: { daysInactive: c.daysInactive, os: c.operatingSystem },
    }))),
    remediation: 'Disable computer accounts inactive >90 days. Verify the device is decommissioned before deleting the AD object.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/identity/delete-computer-accounts-ad',
    passed: affected.length === 0,
  }
}

// ─── 3. Users with non-routable UPN suffix ────────────────────────────────────

const nonRoutableUPN: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u => u.enabled && u.hasNonRoutableUPN)
  const severity: CheckResult['severity'] = affected.length > 0 ? 'blocker' : 'low'
  return {
    id: 'hygiene-non-routable-upn',
    category: 'identity-hygiene',
    title: 'Users with non-routable UPN suffixes (.local / .internal)',
    severity,
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { upn: u.userPrincipalName, upnDomain: u.upnDomain },
    }))),
    remediation: 'Add a verified custom domain to Entra ID, then update UPNs to use the routable domain before enabling directory sync. Use Set-ADUser -UserPrincipalName for bulk updates.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/prepare-a-non-routable-domain-for-directory-synchronization',
    passed: affected.length === 0,
  }
}

// ─── 4. Duplicate proxyAddresses ──────────────────────────────────────────────

const duplicateProxy: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u => u.hasProxyCollision)
  return {
    id: 'hygiene-duplicate-proxy',
    category: 'identity-hygiene',
    title: 'Duplicate or conflicting proxyAddresses',
    severity: 'high',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { proxyCount: u.proxyAddresses.length },
    }))),
    remediation: 'Remove duplicate SMTP addresses. Each routable address should appear only once. Use Get-ADUser with ProxyAddresses filter to identify duplicates.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/exchange/troubleshoot/administration/proxyaddresses-attribute-not-populate',
    passed: affected.length === 0,
  }
}

// ─── 5. Human users with password never expires ───────────────────────────────

const passwordNeverExpires: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(
    u => u.enabled && u.passwordNeverExpires && !u.isServiceAccount
  )
  return {
    id: 'hygiene-password-never-expires',
    category: 'identity-hygiene',
    title: 'Human user accounts with PasswordNeverExpires',
    severity: 'medium',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { department: u.department, privileged: u.isPrivileged },
    }))),
    remediation: 'Clear the PasswordNeverExpires flag for all human user accounts. Enforce Entra ID password policies post-migration. Service accounts should use managed identities or MSA.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/authentication/concept-sspr-policy',
    passed: affected.length === 0,
  }
}

// ─── 6. UPN / sAMAccountName mismatch ────────────────────────────────────────

const upnSAMMismatch: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(
    u => u.enabled && u.hasUPNSAMMismatch && !u.isServiceAccount
  )
  return {
    id: 'hygiene-upn-sam-mismatch',
    category: 'identity-hygiene',
    title: 'UPN prefix does not match sAMAccountName',
    severity: 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { sam: u.sAMAccountName, upnPrefix: u.userPrincipalName.split('@')[0] },
    }))),
    remediation: 'Align UPN prefixes with sAMAccountNames where possible to reduce confusion post-migration. Use Set-ADUser -UserPrincipalName.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/active-directory/hybrid/tshoot-connect-attribute-not-syncing',
    passed: affected.length === 0,
  }
}

// ─── 7. Disabled users lingering >180 days ────────────────────────────────────

const disabledUsersLingering: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u => {
    if (u.enabled) return false
    const days = u.lastLogonDate
      ? Math.floor((Date.now() - u.lastLogonDate.getTime()) / 86_400_000)
      : DISABLED_LINGER_DAYS + 1
    return days > DISABLED_LINGER_DAYS
  })
  return {
    id: 'hygiene-disabled-users-lingering',
    category: 'identity-hygiene',
    title: 'Disabled user accounts lingering >180 days',
    severity: 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { department: u.department },
    }))),
    remediation: 'Delete disabled accounts inactive >180 days after confirming with HR. Sync scope should exclude disabled users to reduce Entra object count.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/users/clean-up-unmanaged-accounts',
    passed: affected.length === 0,
  }
}

export const hygieneChecks: CheckRunner[] = [
  staleUsers,
  staleComputers,
  nonRoutableUPN,
  duplicateProxy,
  passwordNeverExpires,
  upnSAMMismatch,
  disabledUsersLingering,
]
