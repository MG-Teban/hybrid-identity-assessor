import { describe, it, expect } from 'vitest'
import { normalise, isNonRoutableUPN, classifyOS, isEntraJoinSupported, parseSPN } from './normaliser'
import { parseADExport } from './index'
import healthyFixture from '../../../fixtures/healthy-org.json'
import messyFixture from '../../../fixtures/messy-org.json'
import minertechFixture from '../../../fixtures/minertech-export.json'

// ─── isNonRoutableUPN ─────────────────────────────────────────────────────────

describe('isNonRoutableUPN', () => {
  it('flags .local UPNs as non-routable', () => {
    expect(isNonRoutableUPN('user@contoso.local')).toBe(true)
  })
  it('flags .internal UPNs as non-routable', () => {
    expect(isNonRoutableUPN('user@corp.internal')).toBe(true)
  })
  it('flags .lan UPNs as non-routable', () => {
    expect(isNonRoutableUPN('user@company.lan')).toBe(true)
  })
  it('accepts .com.au as routable', () => {
    expect(isNonRoutableUPN('user@company.com.au')).toBe(false)
  })
  it('accepts .com as routable', () => {
    expect(isNonRoutableUPN('user@company.com')).toBe(false)
  })
  it('accepts .org as routable', () => {
    expect(isNonRoutableUPN('user@company.org')).toBe(false)
  })
  it('handles UPN with no @ as non-routable', () => {
    expect(isNonRoutableUPN('noatsign')).toBe(true)
  })
})

// ─── classifyOS ───────────────────────────────────────────────────────────────

describe('classifyOS', () => {
  it('classifies Windows 11', () => {
    expect(classifyOS('Windows 11 Enterprise', '10.0 (26100)')).toBe('windows-11')
  })
  it('classifies Windows 10 current (build 19045)', () => {
    expect(classifyOS('Windows 10 Enterprise', '10.0 (19045)')).toBe('windows-10-current')
  })
  it('classifies Windows 10 EOL (build 17763)', () => {
    expect(classifyOS('Windows 10 Enterprise', '10.0 (17763)')).toBe('windows-10-eol')
  })
  it('classifies Windows 7 as legacy', () => {
    expect(classifyOS('Windows 7 Enterprise', '6.1 (7601)')).toBe('windows-7-or-older')
  })
  it('classifies Server 2022', () => {
    expect(classifyOS('Windows Server 2022 Standard', '10.0 (20348)')).toBe('server-2022')
  })
  it('classifies Server 2019', () => {
    expect(classifyOS('Windows Server 2019 Standard', '10.0 (17763)')).toBe('server-2019')
  })
  it('classifies Server 2012 R2 as EOL', () => {
    expect(classifyOS('Windows Server 2012 R2 Standard', '6.3 (9600)')).toBe('server-eol')
  })
  it('returns unknown for null OS', () => {
    expect(classifyOS(null, null)).toBe('unknown')
  })
})

describe('isEntraJoinSupported', () => {
  it('supports Windows 11', () => expect(isEntraJoinSupported('windows-11')).toBe(true))
  it('supports Windows 10 current', () => expect(isEntraJoinSupported('windows-10-current')).toBe(true))
  it('does not support Windows 10 EOL', () => expect(isEntraJoinSupported('windows-10-eol')).toBe(false))
  it('does not support Windows 7', () => expect(isEntraJoinSupported('windows-7-or-older')).toBe(false))
  it('does not support Server 2022 (direct Entra join)', () => expect(isEntraJoinSupported('server-2022')).toBe(false))
})

// ─── parseSPN ─────────────────────────────────────────────────────────────────

describe('parseSPN', () => {
  it('parses MSSQLSvc SPN with port', () => {
    const spn = parseSPN('MSSQLSvc/sql01.contoso.local:1433', 'svc_sql', 'CN=svc_sql,DC=c,DC=local', 'service-account')
    expect(spn.serviceClass).toBe('MSSQLSvc')
    expect(spn.host).toBe('sql01.contoso.local')
    expect(spn.port).toBe(1433)
  })
  it('parses HTTP SPN without port', () => {
    const spn = parseSPN('HTTP/web01.contoso.local', 'svc_web', 'CN=svc_web,DC=c,DC=local', 'service-account')
    expect(spn.serviceClass).toBe('HTTP')
    expect(spn.host).toBe('web01.contoso.local')
    expect(spn.port).toBeNull()
  })
  it('preserves account metadata', () => {
    const spn = parseSPN('HOST/server01', 'server01$', 'CN=server01,DC=c,DC=local', 'computer')
    expect(spn.accountSAM).toBe('server01$')
    expect(spn.accountType).toBe('computer')
  })
})

// ─── normalise — healthy org ───────────────────────────────────────────────────

describe('normalise — healthy org', () => {
  const parsed = parseADExport(healthyFixture)
  if (!parsed.success) throw new Error('Healthy fixture failed to parse')
  const result = normalise(parsed.data)

  it('produces correct user count', () => {
    expect(result.users.length).toBe(20)
  })

  it('all users are active (not stale)', () => {
    const stale = result.users.filter(u => u.isStale && u.enabled)
    expect(stale).toHaveLength(0)
  })

  it('no users have non-routable UPN', () => {
    const bad = result.users.filter(u => u.hasNonRoutableUPN)
    expect(bad).toHaveLength(0)
  })

  it('no users have passwordNeverExpires', () => {
    const pne = result.users.filter(u => u.passwordNeverExpires && !u.isServiceAccount)
    expect(pne).toHaveLength(0)
  })

  it('all computers are Windows 11', () => {
    expect(result.computers.every(c => c.osCategory === 'windows-11')).toBe(true)
  })

  it('all computers support Entra join', () => {
    expect(result.computers.every(c => c.entraJoinSupported)).toBe(true)
  })

  it('no empty groups', () => {
    expect(result.groups.filter(g => g.isEmpty)).toHaveLength(0)
  })

  it('stats are computed', () => {
    expect(result.stats.totalUsers).toBe(20)
    expect(result.stats.staleUsers).toBe(0)
    expect(result.stats.eolComputers).toBe(0)
  })
})

// ─── normalise — messy org ────────────────────────────────────────────────────

describe('normalise — messy org', () => {
  const parsed = parseADExport(messyFixture)
  if (!parsed.success) throw new Error('Messy fixture failed to parse')
  const result = normalise(parsed.data)

  it('detects stale users', () => {
    expect(result.stats.staleUsers).toBeGreaterThanOrEqual(15)
  })

  it('detects non-routable UPN users', () => {
    expect(result.stats.usersWithNonRoutableUPN).toBeGreaterThanOrEqual(10)
  })

  it('detects users with passwordNeverExpires', () => {
    expect(result.stats.usersPasswordNeverExpires).toBeGreaterThan(0)
  })

  it('detects proxy address collisions', () => {
    const collisions = result.users.filter(u => u.hasProxyCollision)
    expect(collisions.length).toBeGreaterThanOrEqual(5)
  })

  it('detects elevated DA count', () => {
    const privileged = result.users.filter(u => u.isPrivileged)
    expect(privileged.length).toBeGreaterThanOrEqual(10)
  })

  it('detects empty groups', () => {
    expect(result.stats.emptyGroups).toBeGreaterThanOrEqual(12)
  })

  it('detects single-member groups', () => {
    expect(result.stats.singleMemberGroups).toBeGreaterThanOrEqual(5)
  })

  it('detects EOL computers', () => {
    expect(result.stats.eolComputers).toBeGreaterThanOrEqual(5)
  })

  it('detects stale computers', () => {
    expect(result.stats.staleComputers).toBeGreaterThanOrEqual(8)
  })

  it('extracts SPNs from service accounts', () => {
    expect(result.spns.length).toBeGreaterThanOrEqual(8)
  })
})

// ─── normalise — MinerTech (full 1500-user) ───────────────────────────────────

describe('normalise — MinerTech fixture', () => {
  const parsed = parseADExport(minertechFixture)
  if (!parsed.success) throw new Error('MinerTech fixture failed to parse')
  const result = normalise(parsed.data)

  it('normalises all 1500 users', () => {
    expect(result.users.length).toBe(1500)
  })

  it('produces non-zero stale user count', () => {
    expect(result.stats.staleUsers).toBeGreaterThan(0)
  })

  it('detects non-routable UPN users', () => {
    expect(result.stats.usersWithNonRoutableUPN).toBeGreaterThan(0)
  })

  it('extracts SPNs from service accounts', () => {
    expect(result.spns.length).toBeGreaterThanOrEqual(25)
  })

  it('all SPN service classes are non-empty strings', () => {
    expect(result.spns.every(s => s.serviceClass.length > 0)).toBe(true)
  })

  it('stats.totalUsers matches users array', () => {
    expect(result.stats.totalUsers).toBe(result.users.length)
  })
})
