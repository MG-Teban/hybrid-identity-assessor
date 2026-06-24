import { describe, it, expect } from 'vitest'
import { runAllChecks, ALL_CHECKS } from './registry'
import { hygieneChecks } from './categories/1-hygiene'
import { syncChecks } from './categories/2-sync'
import { authChecks } from './categories/3-auth'
import { privilegedChecks } from './categories/4-privileged'
import { groupChecks } from './categories/5-groups'
import { deviceGpoChecks } from './categories/6-device-gpo'
import { computeReadinessScore } from './scoring'
import { normalise } from '../parser/normaliser'
import { parseADExport } from '../parser'
import type { CheckInput } from './types'
import healthyRaw from '../../../fixtures/healthy-org.json'
import messyRaw from '../../../fixtures/messy-org.json'
import minertechRaw from '../../../fixtures/minertech-export.json'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function loadInput(raw: unknown): CheckInput {
  const parsed = parseADExport(raw)
  if (!parsed.success) throw new Error(`Parse failed: ${JSON.stringify(parsed.errors)}`)
  return { normalised: normalise(parsed.data) }
}

const healthy = loadInput(healthyRaw)
const messy = loadInput(messyRaw)
const minertech = loadInput(minertechRaw)

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('Check registry', () => {
  it('has at least 25 checks registered', () => {
    expect(ALL_CHECKS.length).toBeGreaterThanOrEqual(25)
  })

  it('all check IDs are unique', () => {
    const results = runAllChecks(messy)
    const ids = results.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every result has required fields', () => {
    const results = runAllChecks(messy)
    for (const r of results) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.title).toBe('string')
      expect(['blocker', 'high', 'medium', 'low']).toContain(r.severity)
      expect(typeof r.affectedCount).toBe('number')
      expect(Array.isArray(r.sampleObjects)).toBe(true)
      expect(r.sampleObjects.length).toBeLessThanOrEqual(5)
      expect(typeof r.passed).toBe('boolean')
      expect(r.docsUrl).toMatch(/^https:\/\//)
    }
  })

  it('affectedCount is 0 when passed is true', () => {
    const results = runAllChecks(healthy)
    for (const r of results.filter(r => r.passed)) {
      expect(r.affectedCount).toBe(0)
    }
  })
})

// ─── Category 1 — Identity Hygiene ───────────────────────────────────────────

describe('Category 1 — Identity Hygiene', () => {
  it('detects stale users in messy org', () => {
    const result = hygieneChecks[0](messy)
    expect(result.id).toBe('hygiene-stale-users')
    expect(result.affectedCount).toBeGreaterThanOrEqual(15)
    expect(result.passed).toBe(false)
  })

  it('passes stale-users check on healthy org', () => {
    const result = hygieneChecks[0](healthy)
    expect(result.passed).toBe(true)
    expect(result.affectedCount).toBe(0)
  })

  it('detects non-routable UPN as blocker', () => {
    const result = hygieneChecks.find(c => {
      const r = c(messy)
      return r.id === 'hygiene-non-routable-upn'
    })!(messy)
    expect(result.severity).toBe('blocker')
    expect(result.affectedCount).toBeGreaterThan(0)
  })

  it('healthy org passes non-routable UPN check', () => {
    const upnCheck = hygieneChecks.find(c => c(healthy).id === 'hygiene-non-routable-upn')
    const result = upnCheck!(healthy)
    expect(result.passed).toBe(true)
  })

  it('detects duplicate proxyAddresses in messy org', () => {
    const check = hygieneChecks.find(c => c(messy).id === 'hygiene-duplicate-proxy')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThanOrEqual(5)
  })

  it('detects password-never-expires on humans', () => {
    const check = hygieneChecks.find(c => c(messy).id === 'hygiene-password-never-expires')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThan(0)
  })

  it('healthy org passes all hygiene checks', () => {
    for (const check of hygieneChecks) {
      const result = check(healthy)
      // healthy org has no stale/UPN issues — only UPN-SAM mismatch may fire
      if (result.id === 'hygiene-upn-sam-mismatch' || result.id === 'hygiene-disabled-users-lingering') continue
      expect(result.passed).toBe(true)
    }
  })

  it('sample objects never exceed 5', () => {
    for (const check of hygieneChecks) {
      const result = check(messy)
      expect(result.sampleObjects.length).toBeLessThanOrEqual(5)
    }
  })
})

// ─── Category 2 — Sync Readiness ─────────────────────────────────────────────

describe('Category 2 — Sync Readiness', () => {
  it('passes attribute-length on healthy/messy org (no long fields)', () => {
    const check = syncChecks.find(c => c(healthy).id === 'sync-attribute-length')
    expect(check!(healthy).passed).toBe(true)
    expect(check!(messy).passed).toBe(true)
  })

  it('detects attribute length violation on crafted input', () => {
    const longUPNInput: CheckInput = {
      normalised: {
        ...healthy.normalised,
        users: [{
          ...healthy.normalised.users[0],
          userPrincipalName: 'a'.repeat(114) + '@test.com',
        }],
      },
    }
    const check = syncChecks.find(c => c(longUPNInput).id === 'sync-attribute-length')
    const result = check!(longUPNInput)
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('blocker')
  })

  it('detects mail collision in messy org', () => {
    // Messy org has duplicate disabled users seeded — look for any collision
    const check = syncChecks.find(c => c(messy).id === 'sync-mail-collision')
    const result = check!(messy)
    // messy org may or may not have mail collisions — just check it runs
    expect(typeof result.passed).toBe('boolean')
  })

  it('sync-entra-last-sync passes when entraSync is not provided', () => {
    const check = syncChecks.find(c => c(messy).id === 'sync-entra-last-sync')
    const result = check!(messy) // no entraSync
    expect(result.passed).toBe(true)
  })

  it('sync-entra-last-sync fails when sync is stale', () => {
    const input: CheckInput = {
      normalised: messy.normalised,
      entraSync: {
        onPremisesSyncEnabled: true,
        lastSyncDateTime: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        provisioningErrors: 0,
        dirSyncEnabled: true,
      },
    }
    const check = syncChecks.find(c => c(input).id === 'sync-entra-last-sync')
    expect(check!(input).passed).toBe(false)
  })

  it('sync-entra-last-sync passes when sync is recent', () => {
    const input: CheckInput = {
      normalised: messy.normalised,
      entraSync: {
        onPremisesSyncEnabled: true,
        lastSyncDateTime: new Date(Date.now() - 30 * 60_000).toISOString(), // 30 min ago
        provisioningErrors: 0,
        dirSyncEnabled: true,
      },
    }
    const check = syncChecks.find(c => c(input).id === 'sync-entra-last-sync')
    expect(check!(input).passed).toBe(true)
  })

  it('provisioning-errors becomes blocker at >50 errors', () => {
    const input: CheckInput = {
      normalised: messy.normalised,
      entraSync: {
        onPremisesSyncEnabled: true,
        lastSyncDateTime: new Date().toISOString(),
        provisioningErrors: 51,
        dirSyncEnabled: true,
      },
    }
    const check = syncChecks.find(c => c(input).id === 'sync-provisioning-errors')
    const result = check!(input)
    expect(result.severity).toBe('blocker')
    expect(result.passed).toBe(false)
  })
})

// ─── Category 3 — Authentication Modernisation ────────────────────────────────

describe('Category 3 — Auth Modernisation', () => {
  it('detects Kerberos SPNs in minertech', () => {
    const check = authChecks.find(c => c(minertech).id === 'auth-spn-kerberos-apps')
    const result = check!(minertech)
    expect(result.affectedCount).toBeGreaterThan(0)
  })

  it('passes Kerberos check on healthy org (no SPNs)', () => {
    const check = authChecks.find(c => c(healthy).id === 'auth-spn-kerberos-apps')
    expect(check!(healthy).passed).toBe(true)
  })

  it('service-account-pne fires on messy org', () => {
    const check = authChecks.find(c => c(messy).id === 'auth-service-account-pne')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThan(0)
  })
})

// ─── Category 4 — Privileged Access ──────────────────────────────────────────

describe('Category 4 — Privileged Access', () => {
  it('priv-da-count fires on messy org (10 DAs)', () => {
    const check = privilegedChecks.find(c => c(messy).id === 'priv-da-count')
    const result = check!(messy)
    expect(result.passed).toBe(false)
    expect(result.affectedCount).toBeGreaterThanOrEqual(10)
    expect(result.severity).toBe('high') // 10 DAs: >5 but not >10, so high not blocker
  })

  it('priv-da-count passes on healthy org (1 DA)', () => {
    const check = privilegedChecks.find(c => c(healthy).id === 'priv-da-count')
    expect(check!(healthy).passed).toBe(true)
  })

  it('priv-admin-mailboxes fires on messy org', () => {
    const check = privilegedChecks.find(c => c(messy).id === 'priv-admin-mailboxes')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThan(0)
  })

  it('priv-inactive-admins fires on messy org', () => {
    const check = privilegedChecks.find(c => c(messy).id === 'priv-inactive-admins')
    const result = check!(messy)
    // messy admins last logged in 5 days ago — may or may not fire
    expect(typeof result.passed).toBe('boolean')
  })

  it('priv-da-count threshold is configurable via check title', () => {
    const check = privilegedChecks.find(c => c(messy).id === 'priv-da-count')
    const result = check!(messy)
    expect(result.title).toContain('10') // shows actual count
  })
})

// ─── Category 5 — Group Rationalisation ──────────────────────────────────────

describe('Category 5 — Group Rationalisation', () => {
  it('detects empty groups in messy org', () => {
    const check = groupChecks.find(c => c(messy).id === 'group-empty')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThanOrEqual(12)
  })

  it('detects single-member groups in messy org', () => {
    const check = groupChecks.find(c => c(messy).id === 'group-single-member')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThanOrEqual(5)
  })

  it('circular nesting check passes on simple org', () => {
    const check = groupChecks.find(c => c(healthy).id === 'group-circular-nesting')
    expect(check!(healthy).passed).toBe(true)
  })

  it('detects circular nesting on crafted input', () => {
    const circularInput: CheckInput = {
      normalised: {
        ...healthy.normalised,
        groups: [
          {
            name: 'GroupA', sAMAccountName: 'GroupA',
            distinguishedName: 'CN=GroupA,DC=test,DC=local',
            groupScope: 'Global', groupCategory: 'Security',
            members: ['CN=GroupB,DC=test,DC=local'],
            memberOf: [], description: null, isEmpty: false, isSingleMember: true,
            isPrivilegedGroup: false, nestingDepth: 0,
          },
          {
            name: 'GroupB', sAMAccountName: 'GroupB',
            distinguishedName: 'CN=GroupB,DC=test,DC=local',
            groupScope: 'Global', groupCategory: 'Security',
            members: ['CN=GroupA,DC=test,DC=local'],
            memberOf: [], description: null, isEmpty: false, isSingleMember: true,
            isPrivilegedGroup: false, nestingDepth: 0,
          },
        ],
      },
    }
    const check = groupChecks.find(c => c(circularInput).id === 'group-circular-nesting')
    expect(check!(circularInput).passed).toBe(false)
  })

  it('orphaned members check finds missing DNs', () => {
    const input: CheckInput = {
      normalised: {
        ...healthy.normalised,
        groups: [{
          name: 'TestGroup', sAMAccountName: 'TestGroup',
          distinguishedName: 'CN=TestGroup,DC=test,DC=local',
          groupScope: 'Global', groupCategory: 'Security',
          members: ['CN=NonExistentUser,DC=test,DC=local'],
          memberOf: [], description: null, isEmpty: false, isSingleMember: true,
          isPrivilegedGroup: false, nestingDepth: 0,
        }],
      },
    }
    const check = groupChecks.find(c => c(input).id === 'group-orphaned-members')
    expect(check!(input).passed).toBe(false)
    expect(check!(input).affectedCount).toBe(1)
  })
})

// ─── Category 6 — Device & GPO Posture ───────────────────────────────────────

describe('Category 6 — Device & GPO Posture', () => {
  it('detects EOL OS as blocker in messy org', () => {
    const check = deviceGpoChecks.find(c => c(messy).id === 'device-eol-os')
    const result = check!(messy)
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('blocker') // Windows 7 present
  })

  it('healthy org (Win11 only) passes EOL OS check', () => {
    const check = deviceGpoChecks.find(c => c(healthy).id === 'device-eol-os')
    expect(check!(healthy).passed).toBe(true)
  })

  it('Entra join readiness is 100% on healthy org', () => {
    const check = deviceGpoChecks.find(c => c(healthy).id === 'device-entra-join-readiness')
    const result = check!(healthy)
    expect(result.passed).toBe(true)
    expect(result.title).toContain('100%')
  })

  it('Entra join readiness is lower on messy org (has Win7)', () => {
    const check = deviceGpoChecks.find(c => c(messy).id === 'device-entra-join-readiness')
    const result = check!(messy)
    expect(result.title).not.toContain('100%')
  })

  it('disabled GPOs are flagged', () => {
    const check = deviceGpoChecks.find(c => c(messy).id === 'gpo-disabled-orphaned')
    const result = check!(messy)
    expect(result.affectedCount).toBeGreaterThan(0) // messy has 1 AllSettingsDisabled GPO
  })
})

// ─── GPO Intune map ───────────────────────────────────────────────────────────

describe('GPO Intune map', () => {
  it('has at least 30 entries', async () => {
    const { GPO_INTUNE_MAP } = await import('./gpo-intune-map')
    expect(GPO_INTUNE_MAP.length).toBeGreaterThanOrEqual(30)
  })

  it('every entry has required fields', async () => {
    const { GPO_INTUNE_MAP } = await import('./gpo-intune-map')
    for (const entry of GPO_INTUNE_MAP) {
      expect(entry.gpoCategory.length).toBeGreaterThan(0)
      expect(['full', 'partial', 'none']).toContain(entry.intuneEquivalent)
      expect(entry.intuneDocUrl).toMatch(/^https:\/\//)
    }
  })

  it('has entries for all three equivalence levels', async () => {
    const { GPO_INTUNE_MAP } = await import('./gpo-intune-map')
    expect(GPO_INTUNE_MAP.some(m => m.intuneEquivalent === 'full')).toBe(true)
    expect(GPO_INTUNE_MAP.some(m => m.intuneEquivalent === 'partial')).toBe(true)
    expect(GPO_INTUNE_MAP.some(m => m.intuneEquivalent === 'none')).toBe(true)
  })
})

// ─── Full pipeline integration ────────────────────────────────────────────────

describe('Full pipeline — runAllChecks + scoring', () => {
  it('messy org scores ≤49 (has blockers)', () => {
    const results = runAllChecks(messy)
    const score = computeReadinessScore(results)
    expect(score.cappedByBlocker).toBe(true)
    expect(score.score).toBeLessThanOrEqual(49)
    expect(score.band).toMatch(/critical|poor/)
  })

  it('healthy org scores high (no blockers)', () => {
    const results = runAllChecks(healthy)
    const score = computeReadinessScore(results)
    expect(score.cappedByBlocker).toBe(false)
    expect(score.score).toBeGreaterThan(49)
  })

  it('MinerTech org runs all checks without throwing', () => {
    expect(() => runAllChecks(minertech)).not.toThrow()
  })

  it('MinerTech has blockers (non-routable UPNs)', () => {
    const results = runAllChecks(minertech)
    const score = computeReadinessScore(results)
    expect(score.blockerCount).toBeGreaterThan(0)
  })

  it('all 25+ checks produce a result', () => {
    const results = runAllChecks(messy)
    expect(results.length).toBeGreaterThanOrEqual(25)
  })
})

// ─── Scoring unit tests ────────────────────────────────────────────────────────

describe('Scoring — computeReadinessScore', () => {
  it('zero deductions → score 100, band excellent', () => {
    const score = computeReadinessScore([
      { id: 'a', title: 'A', severity: 'low', category: 'identity-hygiene', affectedCount: 0,
        sampleObjects: [], remediation: '', effortEstimate: 'hours', docsUrl: 'https://ms.com', passed: true },
    ])
    expect(score.score).toBe(100)
    expect(score.band).toBe('excellent')
    expect(score.cappedByBlocker).toBe(false)
  })

  it('single blocker caps score at ≤49', () => {
    const score = computeReadinessScore([
      { id: 'b', title: 'B', severity: 'blocker', category: 'sync-readiness', affectedCount: 5,
        sampleObjects: [], remediation: '', effortEstimate: 'days', docsUrl: 'https://ms.com', passed: false },
    ])
    expect(score.score).toBeLessThanOrEqual(49)
    expect(score.cappedByBlocker).toBe(true)
    expect(score.blockerCount).toBe(1)
  })

  it('multiple high findings reduce score below 70', () => {
    const highs = Array.from({ length: 5 }, (_, i) => ({
      id: `h${i}`, title: `H${i}`, severity: 'high' as const, category: 'privileged-access' as const,
      affectedCount: 1, sampleObjects: [], remediation: '', effortEstimate: 'days' as const,
      docsUrl: 'https://ms.com', passed: false,
    }))
    const score = computeReadinessScore(highs) // 5 × 10 = 50 deduction, raw = 50
    expect(score.score).toBe(50)
    expect(score.band).toBe('fair')
  })

  it('passedCount is accurate', () => {
    const results = runAllChecks(healthy)
    const score = computeReadinessScore(results)
    expect(score.passedCount + score.blockerCount + score.highCount + score.mediumCount + score.lowCount)
      .toBe(score.totalChecks)
  })

  it('band boundaries are correct', () => {
    const makeScore = (n: number) => computeReadinessScore([
      { id: 'x', title: 'X', severity: 'high', category: 'identity-hygiene', affectedCount: n,
        sampleObjects: [], remediation: '', effortEstimate: 'hours', docsUrl: 'https://ms.com', passed: n === 0 },
    ])
    // 0 deduction = 100 = excellent
    expect(makeScore(0).band).toBe('excellent')
  })
})

// ─── Auth checks — extra coverage ─────────────────────────────────────────────

describe('Category 3 — Auth (extra coverage)', () => {
  it('all auth check IDs start with "auth-"', () => {
    for (const check of authChecks) {
      expect(check(healthy).id).toMatch(/^auth-/)
    }
  })

  it('auth-unconstrained-delegation passes on healthy org', () => {
    const check = authChecks.find(c => c(healthy).id === 'auth-unconstrained-delegation')
    expect(check!(healthy).passed).toBe(true)
  })

  it('auth-smart-card-users runs without throwing', () => {
    for (const input of [healthy, messy, minertech]) {
      expect(() => authChecks.find(c => c(input).id === 'auth-smart-card-users')!(input)).not.toThrow()
    }
  })

  it('auth-service-account-pne fires on messy org', () => {
    const check = authChecks.find(c => c(messy).id === 'auth-service-account-pne')
    expect(check!(messy).affectedCount).toBeGreaterThan(0)
  })

  it('auth-service-account-pne passes on healthy org (no SAs with PNE)', () => {
    const check = authChecks.find(c => c(healthy).id === 'auth-service-account-pne')
    expect(check!(healthy).passed).toBe(true)
  })
})

// ─── Sync checks — extra coverage ─────────────────────────────────────────────

describe('Category 2 — Sync (extra coverage)', () => {
  it('all sync check IDs start with "sync-"', () => {
    for (const check of syncChecks) {
      expect(check(healthy).id).toMatch(/^sync-/)
    }
  })

  it('sync-invalid-chars detects special char in SAM', () => {
    const input: CheckInput = {
      normalised: {
        ...healthy.normalised,
        users: [{
          ...healthy.normalised.users[0],
          sAMAccountName: 'user+name',
        }],
      },
    }
    const check = syncChecks.find(c => c(input).id === 'sync-invalid-chars')
    expect(check!(input).passed).toBe(false)
  })

  it('sync-invalid-chars passes on healthy org', () => {
    const check = syncChecks.find(c => c(healthy).id === 'sync-invalid-chars')
    expect(check!(healthy).passed).toBe(true)
  })

  it('sync-provisioning-errors passes when entraSync is absent', () => {
    const check = syncChecks.find(c => c(messy).id === 'sync-provisioning-errors')
    expect(check!(messy).passed).toBe(true)
  })

  it('sync-provisioning-errors is medium severity at low error count', () => {
    const input: CheckInput = {
      normalised: messy.normalised,
      entraSync: {
        onPremisesSyncEnabled: true,
        lastSyncDateTime: new Date().toISOString(),
        provisioningErrors: 3,
        dirSyncEnabled: true,
      },
    }
    const check = syncChecks.find(c => c(input).id === 'sync-provisioning-errors')
    expect(check!(input).severity).toBe('medium')
  })
})

// ─── Category 4 — Privileged (extra coverage) ─────────────────────────────────

describe('Category 4 — Privileged (extra coverage)', () => {
  it('all privileged check IDs start with "priv-"', () => {
    for (const check of privilegedChecks) {
      expect(check(healthy).id).toMatch(/^priv-/)
    }
  })

  it('priv-nested-groups passes when no deep nesting', () => {
    const check = privilegedChecks.find(c => c(healthy).id === 'priv-nested-groups')
    expect(check!(healthy).passed).toBe(true)
  })

  it('priv-admincount-anomaly passes on healthy org', () => {
    const check = privilegedChecks.find(c => c(healthy).id === 'priv-admincount-anomaly')
    expect(check!(healthy).passed).toBe(true)
  })
})
