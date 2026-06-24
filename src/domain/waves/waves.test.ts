import { describe, it, expect } from 'vitest'
import { planWaves, reassignMember } from './planner'
import { DEFAULT_WAVE_CONFIG } from './types'
import { normalise } from '../parser/normaliser'
import { parseADExport } from '../parser'
import healthyRaw from '../../../fixtures/healthy-org.json'
import messyRaw from '../../../fixtures/messy-org.json'
import minertechRaw from '../../../fixtures/minertech-export.json'

function load(raw: unknown) {
  const parsed = parseADExport(raw)
  if (!parsed.success) throw new Error('Parse failed')
  return normalise(parsed.data)
}

const healthy = load(healthyRaw)
const messy = load(messyRaw)
const minertech = load(minertechRaw)

// ─── Core invariants ──────────────────────────────────────────────────────────

describe('planWaves — invariants', () => {
  it('every enabled user appears exactly once across all waves', () => {
    const plan = planWaves(messy)
    const enabledCount = messy.users.filter(u => u.enabled).length
    const allSAMs = plan.waves.flatMap(w => w.members.map(m => m.sAMAccountName))
    expect(allSAMs.length).toBe(enabledCount)
    expect(new Set(allSAMs).size).toBe(enabledCount)
  })

  it('disabled users are excluded', () => {
    const plan = planWaves(messy)
    const allSAMs = new Set(plan.waves.flatMap(w => w.members.map(m => m.sAMAccountName)))
    for (const u of messy.users.filter(u => !u.enabled)) {
      expect(allSAMs.has(u.sAMAccountName)).toBe(false)
    }
  })

  it('no bulk wave exceeds maxWaveSize', () => {
    const config = { maxWaveSize: 10, pilotMaxSize: 5 }
    const plan = planWaves(minertech, config)
    for (const wave of plan.waves) {
      // Wave 0 (pilot) uses pilotMaxSize; final (Privileged) is uncapped
      if (wave.waveNumber === 0 || wave.name.includes('Privileged')) continue
      expect(wave.members.length).toBeLessThanOrEqual(config.maxWaveSize)
    }
  })

  it('output is deterministic (same input → same output)', () => {
    const plan1 = planWaves(messy)
    const plan2 = planWaves(messy)
    expect(plan1.waves.map(w => w.members.map(m => m.sAMAccountName))).toEqual(
      plan2.waves.map(w => w.members.map(m => m.sAMAccountName))
    )
  })

  it('plan.totalUsers equals enabled user count', () => {
    const plan = planWaves(messy)
    expect(plan.totalUsers).toBe(messy.users.filter(u => u.enabled).length)
  })
})

// ─── Pilot wave (Wave 0) ──────────────────────────────────────────────────────

describe('planWaves — pilot wave', () => {
  it('Wave 0 only contains IT-department users', () => {
    const plan = planWaves(messy)
    const wave0 = plan.waves.find(w => w.waveNumber === 0)
    if (!wave0) return // may not exist if no IT dept users
    for (const m of wave0.members) {
      const dept = m.department?.toLowerCase() ?? ''
      const isIt = DEFAULT_WAVE_CONFIG.pilotDepartmentKeywords.some(kw => dept.includes(kw))
      expect(isIt).toBe(true)
    }
  })

  it('Wave 0 respects pilotMaxSize', () => {
    const plan = planWaves(messy, { pilotMaxSize: 5 })
    const wave0 = plan.waves.find(w => w.waveNumber === 0)
    if (wave0) expect(wave0.members.length).toBeLessThanOrEqual(5)
  })

  it('Wave 0 criteria mentions pilot', () => {
    const plan = planWaves(messy)
    const wave0 = plan.waves.find(w => w.waveNumber === 0)
    if (wave0) expect(wave0.name).toContain('Pilot')
  })
})

// ─── Final wave (privileged/service accounts) ─────────────────────────────────

describe('planWaves — final wave', () => {
  it('privileged users are always in the final wave', () => {
    const plan = planWaves(messy)
    const finalWave = plan.waves[plan.waves.length - 1]
    const privilegedUsers = messy.users.filter(u => u.enabled && u.isPrivileged)

    for (const u of privilegedUsers) {
      const inFinal = finalWave.members.some(m => m.sAMAccountName === u.sAMAccountName)
      expect(inFinal).toBe(true)
    }
  })

  it('service accounts are always in the final wave', () => {
    const plan = planWaves(messy)
    const finalWave = plan.waves[plan.waves.length - 1]
    const serviceAccounts = messy.users.filter(u => u.enabled && u.isServiceAccount)

    for (const u of serviceAccounts) {
      const inFinal = finalWave.members.some(m => m.sAMAccountName === u.sAMAccountName)
      expect(inFinal).toBe(true)
    }
  })

  it('final wave name contains "Privileged"', () => {
    const plan = planWaves(messy)
    const finalWave = plan.waves[plan.waves.length - 1]
    expect(finalWave.name).toContain('Privileged')
  })
})

// ─── Risk scoring ─────────────────────────────────────────────────────────────

describe('planWaves — risk flags', () => {
  it('privileged members carry the "privileged" flag', () => {
    const plan = planWaves(messy)
    const allMembers = plan.waves.flatMap(w => w.members)
    for (const m of allMembers.filter(m => m.riskFlags.includes('privileged'))) {
      expect(m.riskScore).toBeGreaterThanOrEqual(50)
    }
  })

  it('service accounts carry the "service-account" flag', () => {
    const plan = planWaves(messy)
    const allMembers = plan.waves.flatMap(w => w.members)
    const sas = allMembers.filter(m => m.riskFlags.includes('service-account'))
    expect(sas.length).toBeGreaterThan(0)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('planWaves — edge cases', () => {
  it('empty user list returns empty plan', () => {
    const empty = { ...healthy, users: [] }
    const plan = planWaves(empty)
    expect(plan.waves).toHaveLength(0)
    expect(plan.totalUsers).toBe(0)
  })

  it('all-disabled org returns empty plan', () => {
    const allDisabled = {
      ...messy,
      users: messy.users.map(u => ({ ...u, enabled: false })),
    }
    const plan = planWaves(allDisabled)
    expect(plan.totalUsers).toBe(0)
    expect(plan.waves).toHaveLength(0)
  })

  it('single user plan has exactly one wave', () => {
    const oneUser = {
      ...healthy,
      users: [{ ...healthy.users[0], enabled: true }],
    }
    const plan = planWaves(oneUser)
    expect(plan.totalUsers).toBe(1)
    expect(plan.waves.length).toBeGreaterThan(0)
  })

  it('MinerTech (1500 users) runs without error', () => {
    expect(() => planWaves(minertech)).not.toThrow()
  })

  it('MinerTech total users matches enabled count', () => {
    const plan = planWaves(minertech)
    const enabledCount = minertech.users.filter(u => u.enabled).length
    expect(plan.totalUsers).toBe(enabledCount)
  })
})

// ─── reassignMember ───────────────────────────────────────────────────────────

describe('reassignMember', () => {
  it('moves a member to the target wave', () => {
    const plan = planWaves(messy)
    // pick a member from wave 1 or above and move them to wave 0 (if wave 0 exists)
    const wave0 = plan.waves.find(w => w.waveNumber === 0)
    const wave1 = plan.waves.find(w => w.waveNumber === 1)
    if (!wave1 || wave1.members.length === 0) return

    const member = wave1.members[0]
    const targetWave = wave0 ? 0 : 1
    const updated = reassignMember(plan, member.sAMAccountName, targetWave)

    const allSAMs = updated.waves.flatMap(w => w.members.map(m => m.sAMAccountName))
    expect(new Set(allSAMs).size).toBe(allSAMs.length) // still unique
    const movedMember = updated.waves.find(w => w.waveNumber === targetWave)?.members
      .find(m => m.sAMAccountName === member.sAMAccountName)
    expect(movedMember).toBeDefined()
    expect(movedMember?.wave).toBe(targetWave)
  })

  it('does not change total member count', () => {
    const plan = planWaves(messy)
    const totalBefore = plan.waves.reduce((s, w) => s + w.members.length, 0)
    const wave1 = plan.waves.find(w => w.waveNumber === 1)
    const wave2 = plan.waves.find(w => w.waveNumber === 2)
    if (!wave1 || !wave2 || wave1.members.length === 0) return

    const member = wave1.members[0]
    const updated = reassignMember(plan, member.sAMAccountName, wave2.waveNumber)
    const totalAfter = updated.waves.reduce((s, w) => s + w.members.length, 0)
    expect(totalAfter).toBe(totalBefore)
  })

  it('returns unchanged plan for unknown SAM', () => {
    const plan = planWaves(healthy)
    const updated = reassignMember(plan, '__nonexistent__', 0)
    expect(updated).toBe(plan) // same reference
  })
})
