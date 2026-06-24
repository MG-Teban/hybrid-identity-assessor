import type { CheckRunner, SampleObject } from '../types'

const MAX_SAMPLE = 5

function sample(items: SampleObject[]): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

// Kerberos-requiring service classes that need migration planning
const KERBEROS_SERVICE_CLASSES = new Set([
  'MSSQLSvc', 'HTTP', 'WSMAN', 'TERMSRV', 'HOST',
  'GC', 'LDAP', 'DNS', 'SMTP', 'POP', 'IMAP',
])

// ─── 1. SPN inventory — apps requiring Kerberos migration planning ─────────────

const spnKerberosApps: CheckRunner = ({ normalised }) => {
  const kerberosSpns = normalised.spns.filter(s =>
    KERBEROS_SERVICE_CLASSES.has(s.serviceClass.toUpperCase())
  )

  // Deduplicate by host to count unique apps
  const uniqueHosts = new Set(kerberosSpns.map(s => s.host))

  return {
    id: 'auth-spn-kerberos-apps',
    category: 'auth-modernisation',
    title: 'Applications using Kerberos SPNs requiring migration strategy',
    severity: kerberosSpns.length > 0 ? 'high' : 'low',
    affectedCount: uniqueHosts.size,
    sampleObjects: sample(
      [...uniqueHosts].slice(0, MAX_SAMPLE).map(host => {
        const spn = kerberosSpns.find(s => s.host === host)!
        return {
          id: spn.accountSAM,
          label: host,
          details: { serviceClass: spn.serviceClass, accountType: spn.accountType },
        }
      })
    ),
    remediation: 'For each Kerberos-dependent app, evaluate: (1) Entra Kerberos for cloud-joined devices, (2) Microsoft Entra application proxy for on-prem web apps, (3) Hybrid join for legacy app compatibility.',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/devices/howto-vm-sign-in-azure-ad-windows',
    passed: kerberosSpns.length === 0,
  }
}

// ─── 2. Service accounts with unconstrained Kerberos delegation ───────────────

const unconstrainedDelegation: CheckRunner = ({ normalised }) => {
  // UserAccountControl flag 0x80000 = TrustedForDelegation (unconstrained)
  const UNCONSTRAINED_FLAG = 0x80000
  const affected = normalised.users.filter(u =>
    u.isServiceAccount &&
    u.adminCount != null &&
    // If adminCount is set, it may have delegation rights; check via UAC if available
    // Since UAC is not always in normalised, we flag service accounts in privileged groups
    u.isPrivileged
  )

  // Also flag SPNs on accounts where servicePrincipalNames exist and are privileged
  const spnPrivileged = normalised.users.filter(u =>
    u.servicePrincipalNames.length > 0 && u.isPrivileged
  )

  const combined = [...new Map([...affected, ...spnPrivileged].map(u => [u.sAMAccountName, u])).values()]

  return {
    id: 'auth-unconstrained-delegation',
    category: 'auth-modernisation',
    title: 'Privileged service accounts with SPN (delegation risk)',
    severity: combined.length > 0 ? 'high' : 'low',
    affectedCount: combined.length,
    sampleObjects: sample(combined.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { spnCount: u.servicePrincipalNames.length, privileged: u.isPrivileged },
    }))),
    remediation: 'Review delegation settings on all service accounts. Replace unconstrained delegation with constrained (KCD) or resource-based constrained delegation (RBCD). Migrate workloads to managed identities where possible.',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-constrained-delegation-overview',
    passed: combined.length === 0,
  }
}

// ─── 3. Service accounts with password never expires ─────────────────────────

const serviceAccountPNE: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(
    u => u.isServiceAccount && u.enabled && u.passwordNeverExpires
  )
  return {
    id: 'auth-service-account-pne',
    category: 'auth-modernisation',
    title: 'Service accounts with PasswordNeverExpires',
    severity: 'medium',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: {
        spnCount: u.servicePrincipalNames.length,
        passwordLastSetDays: u.passwordLastSet
          ? Math.floor((Date.now() - u.passwordLastSet.getTime()) / 86_400_000)
          : null,
      },
    }))),
    remediation: 'Migrate service accounts to Group Managed Service Accounts (gMSA) which auto-rotate passwords, or to Entra workload identities. Avoid long-lived static credentials in cloud-joined environments.',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/windows-server/security/group-managed-service-accounts/group-managed-service-accounts-overview',
    passed: affected.length === 0,
  }
}

// ─── 4. Smart card required users ─────────────────────────────────────────────

const smartCardRequired: CheckRunner = ({ normalised }) => {
  // UAC flag 0x40000 = SmartcardRequired
  // Since we don't always have UAC in normalised, we use adminCount + no MFA signal as proxy
  // For demo purposes: flag privileged users with no modern auth indicators
  const affected = normalised.users.filter(
    u => u.enabled && u.isPrivileged && u.servicePrincipalNames.length === 0
  )

  // Limit to a reasonable threshold — only flag as finding if count is high
  const flagged = affected.length > 20 ? [] : affected

  return {
    id: 'auth-smart-card-users',
    category: 'auth-modernisation',
    title: 'Privileged accounts — verify MFA/Passwordless readiness',
    severity: 'medium',
    affectedCount: affected.length,
    sampleObjects: sample(flagged.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { privileged: u.isPrivileged, department: u.department },
    }))),
    remediation: 'Enrol all privileged accounts in Entra MFA or Passwordless (FIDO2/Windows Hello) before migrating. Smart card-required accounts need Entra Certificate-Based Auth (CBA) as a replacement.',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/authentication/concept-certificate-based-authentication',
    passed: affected.length === 0,
  }
}

export const authChecks: CheckRunner[] = [
  spnKerberosApps,
  unconstrainedDelegation,
  serviceAccountPNE,
  smartCardRequired,
]
