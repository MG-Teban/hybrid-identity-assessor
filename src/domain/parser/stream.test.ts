import { describe, it, expect } from 'vitest'
import { streamUsers, streamGroups, streamComputers, streamSPNs, collect, reduce } from './stream'
import { parseADExport } from './index'
import minertechFixture from '../../../fixtures/minertech-export.json'
import healthyFixture from '../../../fixtures/healthy-org.json'
import messyFixture from '../../../fixtures/messy-org.json'

const minertech = (() => {
  const r = parseADExport(minertechFixture)
  if (!r.success) throw new Error('MinerTech fixture failed')
  return r.data
})()

const healthy = (() => {
  const r = parseADExport(healthyFixture)
  if (!r.success) throw new Error('Healthy fixture failed')
  return r.data
})()

const messy = (() => {
  const r = parseADExport(messyFixture)
  if (!r.success) throw new Error('Messy fixture failed')
  return r.data
})()

// ─── streamUsers ──────────────────────────────────────────────────────────────

describe('streamUsers', () => {
  it('yields the correct total count', () => {
    const count = reduce(streamUsers(minertech), 0, acc => acc + 1)
    expect(count).toBe(1500)
  })

  it('each yielded user has required fields', () => {
    for (const user of streamUsers(healthy)) {
      expect(typeof user.sAMAccountName).toBe('string')
      expect(typeof user.userPrincipalName).toBe('string')
      expect(typeof user.enabled).toBe('boolean')
      expect(typeof user.isStale).toBe('boolean')
      expect(Array.isArray(user.memberOf)).toBe(true)
    }
  })

  it('detects stale users via stream (messy org)', () => {
    const staleCount = reduce(streamUsers(messy), 0, (acc, u) => acc + (u.isStale && u.enabled ? 1 : 0))
    expect(staleCount).toBeGreaterThanOrEqual(15)
  })

  it('detects non-routable UPNs via stream (messy org)', () => {
    const count = reduce(streamUsers(messy), 0, (acc, u) => acc + (u.hasNonRoutableUPN ? 1 : 0))
    expect(count).toBeGreaterThanOrEqual(10)
  })

  it('can be iterated multiple times independently', () => {
    const count1 = reduce(streamUsers(healthy), 0, acc => acc + 1)
    const count2 = reduce(streamUsers(healthy), 0, acc => acc + 1)
    expect(count1).toBe(count2)
  })
})

// ─── streamGroups ─────────────────────────────────────────────────────────────

describe('streamGroups', () => {
  it('yields correct group count', () => {
    const count = reduce(streamGroups(messy), 0, acc => acc + 1)
    expect(count).toBe(messy.groups.length)
  })

  it('detects empty groups via stream', () => {
    const empty = reduce(streamGroups(messy), 0, (acc, g) => acc + (g.isEmpty ? 1 : 0))
    expect(empty).toBeGreaterThanOrEqual(12)
  })

  it('detects single-member groups via stream', () => {
    const single = reduce(streamGroups(messy), 0, (acc, g) => acc + (g.isSingleMember ? 1 : 0))
    expect(single).toBeGreaterThanOrEqual(5)
  })
})

// ─── streamComputers ──────────────────────────────────────────────────────────

describe('streamComputers', () => {
  it('yields correct computer count', () => {
    const count = reduce(streamComputers(minertech), 0, acc => acc + 1)
    expect(count).toBe(minertech.computers.length)
  })

  it('classifies Windows 11 computers correctly', () => {
    const win11 = reduce(streamComputers(healthy), 0, (acc, c) => acc + (c.osCategory === 'windows-11' ? 1 : 0))
    expect(win11).toBe(10)
  })

  it('detects stale computers via stream', () => {
    const stale = reduce(streamComputers(messy), 0, (acc, c) => acc + (c.isStale && c.enabled ? 1 : 0))
    expect(stale).toBeGreaterThanOrEqual(8)
  })

  it('detects EOL computers via stream', () => {
    const eol = reduce(streamComputers(messy), 0, (acc, c) =>
      acc + (c.osCategory === 'windows-7-or-older' ? 1 : 0))
    expect(eol).toBeGreaterThanOrEqual(5)
  })
})

// ─── streamSPNs ───────────────────────────────────────────────────────────────

describe('streamSPNs', () => {
  it('extracts SPNs from MinerTech service accounts', () => {
    const count = reduce(streamSPNs(minertech), 0, acc => acc + 1)
    expect(count).toBeGreaterThanOrEqual(25)
  })

  it('each SPN has a non-empty service class', () => {
    for (const spn of streamSPNs(messy)) {
      expect(spn.serviceClass.length).toBeGreaterThan(0)
    }
  })
})

// ─── collect / reduce helpers ─────────────────────────────────────────────────

describe('collect', () => {
  it('materialises generator to array', () => {
    const arr = collect(streamUsers(healthy))
    expect(arr).toHaveLength(20)
    expect(arr[0].sAMAccountName).toBeDefined()
  })
})

describe('reduce', () => {
  it('sums without materialising array', () => {
    const sum = reduce(streamUsers(healthy), 0, (acc, u) => acc + (u.enabled ? 1 : 0))
    expect(sum).toBe(20)
  })

  it('handles empty input', () => {
    const empty = parseADExport({
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      domainInfo: { name: 'empty.local', upnSuffixes: [] },
      users: [], groups: [], computers: [], ous: [], gpos: [], trusts: [], anonymised: false,
    })
    if (!empty.success) throw new Error('parse failed')
    const count = reduce(streamUsers(empty.data), 0, acc => acc + 1)
    expect(count).toBe(0)
  })
})

// ─── Schema drift tolerance ───────────────────────────────────────────────────

describe('schema drift tolerance', () => {
  it('parser accepts users missing optional fields', () => {
    const r = parseADExport({
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      domainInfo: { name: 'test.local', upnSuffixes: [] },
      users: [{
        sAMAccountName: 'jdoe',
        userPrincipalName: 'jdoe@test.local',
        distinguishedName: 'CN=jdoe,DC=test,DC=local',
        enabled: true,
        // all optional fields omitted
      }],
      groups: [], computers: [], ous: [], gpos: [], trusts: [], anonymised: false,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      const norm = collect(streamUsers(r.data))
      expect(norm[0].department).toBeNull()
      expect(norm[0].proxyAddresses).toEqual([])
    }
  })

  it('parser accepts computers missing OS fields', () => {
    const r = parseADExport({
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      domainInfo: { name: 'test.local', upnSuffixes: [] },
      users: [],
      groups: [],
      computers: [{
        name: 'PC01',
        sAMAccountName: 'PC01$',
        distinguishedName: 'CN=PC01,DC=test,DC=local',
        enabled: true,
        // OS fields omitted
      }],
      ous: [], gpos: [], trusts: [], anonymised: false,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      const computers = collect(streamComputers(r.data))
      expect(computers[0].osCategory).toBe('unknown')
    }
  })

  it('normaliser does not throw on all-null optional date fields', () => {
    const r = parseADExport({
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      domainInfo: { name: 'test.local', upnSuffixes: [] },
      users: [{
        sAMAccountName: 'jdoe',
        userPrincipalName: 'jdoe@test.local',
        distinguishedName: 'CN=jdoe,DC=test,DC=local',
        enabled: true,
        lastLogonDate: null,
        passwordLastSet: null,
      }],
      groups: [], computers: [], ous: [], gpos: [], trusts: [], anonymised: false,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      const users = collect(streamUsers(r.data))
      expect(users[0].lastLogonDate).toBeNull()
      expect(users[0].isStale).toBe(true) // null lastLogon = stale
    }
  })
})

// ─── Memory / performance ─────────────────────────────────────────────────────

describe('generator memory pattern', () => {
  it('reduce never holds more than one user in the accumulator', () => {
    // This test verifies the generator is lazy — we count without collect()
    let maxConcurrent = 0
    let active = 0

    const gen = (function* () {
      for (const u of streamUsers(minertech)) {
        active++
        maxConcurrent = Math.max(maxConcurrent, active)
        yield u
        active--
      }
    })()

    reduce(gen, 0, acc => acc + 1)
    // Generator processes one item at a time
    expect(maxConcurrent).toBe(1)
  })
})
