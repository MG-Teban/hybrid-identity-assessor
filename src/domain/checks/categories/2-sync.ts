import type { CheckRunner, CheckResult, SampleObject } from '../types'

const MAX_SAMPLE = 5
const MAX_UPN_LENGTH = 113
const MAX_DISPLAY_NAME = 256
const MAX_SAM_LENGTH = 20
const SYNC_STALE_HOURS = 3

function sample(items: SampleObject[]): SampleObject[] {
  return items.slice(0, MAX_SAMPLE)
}

const INVALID_CHARS_PATTERN = /[\\[\]:;|=+*?<>/,@"]/

// ─── 1. Attribute length violations ───────────────────────────────────────────

const attributeLength: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u =>
    u.userPrincipalName.length > MAX_UPN_LENGTH ||
    (u.displayName?.length ?? 0) > MAX_DISPLAY_NAME ||
    u.sAMAccountName.length > MAX_SAM_LENGTH
  )
  return {
    id: 'sync-attribute-length',
    category: 'sync-readiness',
    title: 'Attributes exceeding Entra ID field length limits',
    severity: 'blocker',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: {
        upnLength: u.userPrincipalName.length,
        displayNameLength: u.displayName?.length ?? 0,
      },
    }))),
    remediation: `Shorten UPNs to ≤${MAX_UPN_LENGTH} chars, displayName to ≤${MAX_DISPLAY_NAME} chars, and sAMAccountName to ≤${MAX_SAM_LENGTH} chars before enabling sync. Objects exceeding limits will fail provisioning.`,
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/active-directory/hybrid/reference-connect-sync-attributes-synchronized',
    passed: affected.length === 0,
  }
}

// ─── 2. Invalid characters in sync attributes ─────────────────────────────────

const invalidChars: CheckRunner = ({ normalised }) => {
  const affected = normalised.users.filter(u =>
    INVALID_CHARS_PATTERN.test(u.sAMAccountName) ||
    (u.mail && INVALID_CHARS_PATTERN.test(u.mail))
  )
  return {
    id: 'sync-invalid-chars',
    category: 'sync-readiness',
    title: 'Invalid characters in sync-critical attributes',
    severity: 'high',
    affectedCount: affected.length,
    sampleObjects: sample(affected.map(u => ({
      id: u.sAMAccountName,
      label: u.displayName,
      details: { sAMAccountName: u.sAMAccountName, mail: u.mail },
    }))),
    remediation: 'Remove special characters (\\[]:|=+*?<>/,@") from sAMAccountName and mail attributes. Entra Connect will drop objects with invalid characters during sync.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/prepare-for-directory-synchronization',
    passed: affected.length === 0,
  }
}

// ─── 3. Mail / mailNickname collisions ────────────────────────────────────────

const mailCollision: CheckRunner = ({ normalised }) => {
  const seen = new Map<string, string>()
  const collisions: Array<{ id: string; label: string; details: Record<string, string | null> }> = []

  for (const u of normalised.users) {
    if (!u.mail) continue
    const key = u.mail.toLowerCase()
    if (seen.has(key)) {
      collisions.push({
        id: u.sAMAccountName,
        label: u.displayName,
        details: { mail: u.mail, collidesWithSAM: seen.get(key) ?? null },
      })
    } else {
      seen.set(key, u.sAMAccountName)
    }
  }

  return {
    id: 'sync-mail-collision',
    category: 'sync-readiness',
    title: 'Duplicate mail attributes (mailNickname collision risk)',
    severity: 'blocker',
    affectedCount: collisions.length,
    sampleObjects: sample(collisions),
    remediation: 'Each user must have a unique mail attribute. Resolve duplicates before enabling sync — Entra Connect will fail to provision duplicate mail objects.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/identify-directory-synchronization-errors',
    passed: collisions.length === 0,
  }
}

// ─── 4. Entra Connect last sync staleness ─────────────────────────────────────

const entraLastSync: CheckRunner = ({ entraSync }) => {
  if (!entraSync) {
    return {
      id: 'sync-entra-last-sync',
      category: 'sync-readiness',
      title: 'Entra Connect last sync time',
      severity: 'medium',
      affectedCount: 0,
      sampleObjects: [],
      remediation: 'Connect your Entra tenant via Microsoft Graph to check live sync health.',
      effortEstimate: 'hours',
      docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sync-feature-scheduler',
      passed: true,
    }
  }

  const lastSync = entraSync.lastSyncDateTime ? new Date(entraSync.lastSyncDateTime) : null
  const hoursSince = lastSync
    ? (Date.now() - lastSync.getTime()) / 3_600_000
    : Infinity

  const stale = !entraSync.onPremisesSyncEnabled || hoursSince > SYNC_STALE_HOURS
  return {
    id: 'sync-entra-last-sync',
    category: 'sync-readiness',
    title: 'Entra Connect last sync time',
    severity: 'high',
    affectedCount: stale ? 1 : 0,
    sampleObjects: stale ? [{
      id: 'entra-connect',
      label: 'Entra Connect',
      details: {
        lastSyncDateTime: entraSync.lastSyncDateTime,
        hoursSinceSync: Math.round(hoursSince),
        syncEnabled: entraSync.onPremisesSyncEnabled,
      },
    }] : [],
    remediation: 'Investigate Entra Connect sync health. Check the Synchronization Service Manager for errors. Ensure the ADSync service is running.',
    effortEstimate: 'hours',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sync-feature-scheduler',
    passed: !stale,
  }
}

// ─── 5. Entra provisioning errors ─────────────────────────────────────────────

const provisioningErrors: CheckRunner = ({ entraSync }) => {
  if (!entraSync) {
    return {
      id: 'sync-provisioning-errors',
      category: 'sync-readiness',
      title: 'Entra ID provisioning errors',
      severity: 'high',
      affectedCount: 0,
      sampleObjects: [],
      remediation: 'Connect your Entra tenant to check provisioning error count.',
      effortEstimate: 'hours',
      docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sync-errors',
      passed: true,
    }
  }

  const count = entraSync.provisioningErrors
  const severity: CheckResult['severity'] = count > 50 ? 'blocker' : count > 10 ? 'high' : 'medium'
  return {
    id: 'sync-provisioning-errors',
    category: 'sync-readiness',
    title: 'Entra ID object provisioning errors',
    severity,
    affectedCount: count,
    sampleObjects: count > 0 ? [{
      id: 'provisioning-errors',
      label: `${count} provisioning error(s)`,
      details: { count, dirSyncEnabled: entraSync.dirSyncEnabled },
    }] : [],
    remediation: 'Review provisioning errors in Entra admin centre > Identity > Hybrid management > Microsoft Entra Connect > Sync errors. Common causes: duplicate attributes, UPN conflicts.',
    effortEstimate: 'days',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-sync-errors',
    passed: count === 0,
  }
}

export const syncChecks: CheckRunner[] = [
  attributeLength,
  invalidChars,
  mailCollision,
  entraLastSync,
  provisioningErrors,
]
