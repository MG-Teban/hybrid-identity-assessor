import { describe, it, expect } from 'vitest'
import { parseADExport, parseADExportFromJson } from './index'
import { SCHEMA_VERSION } from './ad-export.schema'
import minertechFixture from '../../../fixtures/minertech-export.json'

const minimalValidExport = {
  schemaVersion: SCHEMA_VERSION,
  exportedAt: '2024-01-01T00:00:00.000Z',
  domainInfo: {
    name: 'contoso.local',
    upnSuffixes: ['contoso.com'],
  },
  users: [],
  groups: [],
  computers: [],
  ous: [],
  gpos: [],
  trusts: [],
  anonymised: false,
}

describe('parseADExport', () => {
  it('accepts a minimal valid export', () => {
    const result = parseADExport(minimalValidExport)
    expect(result.success).toBe(true)
  })

  it('returns warnings for empty collections', () => {
    const result = parseADExport(minimalValidExport)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('users'))).toBe(true)
    }
  })

  it('rejects wrong schema version', () => {
    const result = parseADExport({ ...minimalValidExport, schemaVersion: '2.0' })
    expect(result.success).toBe(false)
  })

  it('rejects missing schemaVersion', () => {
    const { schemaVersion: _, ...rest } = minimalValidExport
    const result = parseADExport(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing domainInfo', () => {
    const { domainInfo: _, ...rest } = minimalValidExport
    const result = parseADExport(rest)
    expect(result.success).toBe(false)
  })

  it('rejects null input', () => {
    const result = parseADExport(null)
    expect(result.success).toBe(false)
  })

  it('rejects array input', () => {
    const result = parseADExport([])
    expect(result.success).toBe(false)
  })

  it('returns errors with path context on invalid user fields', () => {
    const result = parseADExport({
      ...minimalValidExport,
      users: [{ sAMAccountName: 123, distinguishedName: 'CN=test', enabled: true }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('users'))).toBe(true)
    }
  })

  it('accepts users with nullable lastLogonDate', () => {
    const result = parseADExport({
      ...minimalValidExport,
      users: [{
        sAMAccountName: 'jdoe',
        userPrincipalName: 'jdoe@contoso.com',
        distinguishedName: 'CN=jdoe,DC=contoso,DC=local',
        enabled: true,
        lastLogonDate: null,
        passwordNeverExpires: false,
        passwordNotRequired: false,
        proxyAddresses: [],
        memberOf: [],
        servicePrincipalNames: [],
      }],
    })
    expect(result.success).toBe(true)
  })

  it('defaults missing arrays to empty', () => {
    const result = parseADExport({
      ...minimalValidExport,
      users: [{
        sAMAccountName: 'jdoe',
        userPrincipalName: 'jdoe@contoso.com',
        distinguishedName: 'CN=jdoe,DC=contoso,DC=local',
        enabled: true,
      }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.users[0].proxyAddresses).toEqual([])
      expect(result.data.users[0].memberOf).toEqual([])
    }
  })
})

describe('parseADExportFromJson', () => {
  it('accepts valid JSON string', () => {
    const result = parseADExportFromJson(JSON.stringify(minimalValidExport))
    expect(result.success).toBe(true)
  })

  it('rejects malformed JSON', () => {
    const result = parseADExportFromJson('{not valid json')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].message).toMatch(/Invalid JSON/)
    }
  })

  it('rejects empty string', () => {
    const result = parseADExportFromJson('')
    expect(result.success).toBe(false)
  })
})

describe('MinerTech fixture', () => {
  it('parses the full 1500-user fixture without errors', () => {
    const result = parseADExport(minertechFixture)
    expect(result.success).toBe(true)
  })

  it('fixture contains expected user count', () => {
    const result = parseADExport(minertechFixture)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.users.length).toBe(1500)
    }
  })

  it('fixture has non-routable UPN users for sync checks', () => {
    const result = parseADExport(minertechFixture)
    if (result.success) {
      const nonRoutable = result.data.users.filter(u => u.userPrincipalName.endsWith('.local'))
      expect(nonRoutable.length).toBeGreaterThan(0)
    }
  })

  it('fixture has Domain Admins group', () => {
    const result = parseADExport(minertechFixture)
    if (result.success) {
      const da = result.data.groups.find(g => g.name === 'Domain Admins')
      expect(da).toBeDefined()
      expect(da!.members.length).toBeGreaterThan(0)
    }
  })
})
