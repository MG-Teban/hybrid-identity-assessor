import type { CheckRunner, SampleObject } from '../types'
import { GPO_INTUNE_MAP, getGPOMapping } from '../gpo-intune-map'

const MAX_SAMPLE = 5

function sample(items: SampleObject[]): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

// ─── 1. EOL operating systems ─────────────────────────────────────────────────

const eolOS: CheckRunner = ({ normalised }) => {
  const eolCategories = new Set(['windows-7-or-older', 'windows-10-eol', 'server-eol'])
  const affected = normalised.computers.filter(
    c => c.enabled && eolCategories.has(c.osCategory)
  )
  const severity = affected.length > 0
    ? (affected.some(c => c.osCategory === 'windows-7-or-older') ? 'blocker' : 'high')
    : 'low'

  return {
    id: 'device-eol-os',
    category: 'device-gpo-posture',
    title: 'Devices running end-of-life operating systems',
    severity,
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(c => ({
      id: c.sAMAccountName,
      label: c.name,
      details: { os: c.operatingSystem, version: c.operatingSystemVersion, category: c.osCategory },
    }))),
    remediation: 'Upgrade or decommission EOL devices before Entra join. Windows 7 and Server 2008/2012 cannot be Entra-joined or Intune-enrolled. EOL devices are a significant security risk.',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/lifecycle/products/',
    passed: affected.length === 0,
  }
}

// ─── 2. Stale computer accounts ───────────────────────────────────────────────

const staleComputersDevice: CheckRunner = ({ normalised }) => {
  const affected = normalised.computers.filter(c => c.enabled && c.isStale)
  return {
    id: 'device-stale-computers',
    category: 'device-gpo-posture',
    title: 'Stale enabled computer accounts (>90 days inactive)',
    severity: 'medium',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(c => ({
      id: c.sAMAccountName,
      label: c.name,
      details: { daysInactive: c.daysInactive, os: c.operatingSystem },
    }))),
    remediation: 'Disable and delete stale computer objects. They inflate sync scope and may hold GPO-assigned rights. Confirm decommission status with desktop team before deletion.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/identity/delete-computer-accounts-ad',
    passed: affected.length === 0,
  }
}

// ─── 3. Entra join readiness by OS ────────────────────────────────────────────

const entraJoinReadiness: CheckRunner = ({ normalised }) => {
  const enabled = normalised.computers.filter(c => c.enabled && !c.isServer)
  const capable = enabled.filter(c => c.entraJoinSupported)
  const incapable = enabled.filter(c => !c.entraJoinSupported)
  const pct = enabled.length > 0 ? Math.round((capable.length / enabled.length) * 100) : 100

  return {
    id: 'device-entra-join-readiness',
    category: 'device-gpo-posture',
    title: `Entra join readiness: ${pct}% of workstations capable`,
    severity: pct < 50 ? 'high' : pct < 80 ? 'medium' : 'low',
    affectedCount: incapable.length,
    sampleObjects: sample(incapable.map(c => ({
      id: c.sAMAccountName,
      label: c.name,
      details: { os: c.operatingSystem, category: c.osCategory },
    }))),
    remediation: `${incapable.length} workstations cannot be Entra-joined without an OS upgrade. Target Win10 21H1+ or Win11 for all new device purchases. Plan hardware refresh for remaining EOL/old-build devices.`,
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/devices/concept-directory-join',
    passed: pct >= 80,
  }
}

// ─── 4. GPO settings without Intune equivalent ────────────────────────────────

const gpoNoIntuneEquiv: CheckRunner = ({ normalised }) => {
  const noEquivMappings = GPO_INTUNE_MAP.filter(m => m.intuneEquivalent === 'none')
  const noEquivCategories = new Set(noEquivMappings.map(m => m.gpoCategory.toLowerCase()))

  const flaggedGPOs = normalised.gpos.filter(gpo => {
    if (gpo.gpoStatus === 'AllSettingsDisabled') return false
    const name = gpo.displayName.toLowerCase()
    return noEquivCategories.has(name) || [...noEquivCategories].some(cat => name.includes(cat))
  })

  return {
    id: 'gpo-no-intune-equivalent',
    category: 'device-gpo-posture',
    title: 'GPO settings with no Intune equivalent — require remediation plan',
    severity: flaggedGPOs.length > 0 ? 'high' : 'low',
    affectedCount: flaggedGPOs.length,
    sampleObjects: sample(flaggedGPOs.map(g => {
      const mapping = getGPOMapping(g.displayName)
      return {
        id: g.displayName,
        label: g.displayName,
        details: { recommendation: mapping?.intuneArea ?? 'Manual review required' },
      }
    })),
    remediation: 'GPO settings without Intune equivalents must be addressed before decommissioning on-prem AD. Common cases: NAP (replace with Conditional Access), SRP (replace with WDAC), NTP (custom OMA-URI).',
    effortEstimate: 'weeks',
    docsUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/group-policy-analytics',
    passed: flaggedGPOs.length === 0,
  }
}

// ─── 5. Disabled / orphaned GPOs ──────────────────────────────────────────────

const disabledGPOs: CheckRunner = ({ normalised }) => {
  const affected = normalised.gpos.filter(
    g => g.gpoStatus === 'AllSettingsDisabled' || (g.linkedOUs.length === 0)
  )
  return {
    id: 'gpo-disabled-orphaned',
    category: 'device-gpo-posture',
    title: 'Disabled or unlinked GPOs (cleanup candidates)',
    severity: 'low',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(g => ({
      id: g.displayName,
      label: g.displayName,
      details: { status: g.gpoStatus ?? 'AllSettingsEnabled', linkedOUs: g.linkedOUs.length },
    }))),
    remediation: 'Delete disabled and unlinked GPOs after confirming with IT. Orphaned GPOs consume SYSVOL space and complicate the GPO audit trail.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/group-policy/orphaned-gpos',
    passed: affected.length === 0,
  }
}

export const deviceGpoChecks: CheckRunner[] = [
  eolOS,
  staleComputersDevice,
  entraJoinReadiness,
  gpoNoIntuneEquiv,
  disabledGPOs,
]
