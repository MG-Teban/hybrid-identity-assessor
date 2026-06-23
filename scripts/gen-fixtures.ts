/**
 * Generates healthy-org.json and messy-org.json test fixtures.
 * Also generates a huge-org.json header stub for memory tests (users only).
 *
 * Usage: npx tsx scripts/gen-fixtures.ts
 */

import fs from 'fs'
import path from 'path'
import type { ADExport } from '../src/domain/parser/ad-export.schema'
import { SCHEMA_VERSION } from '../src/domain/parser/ad-export.schema'

function iso(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

const BASE = {
  schemaVersion: SCHEMA_VERSION as '1.0',
  exportedAt: new Date().toISOString(),
  trusts: [] as ADExport['trusts'],
  anonymised: false,
} as const

// ─── Healthy org ──────────────────────────────────────────────────────────────
// 20 enabled users, all active, routable UPNs, no issues

function buildHealthyOrg(): ADExport {
  const domain = 'healthy.com.au'
  const users = Array.from({ length: 20 }, (_, i) => ({
    sAMAccountName: `user${i + 1}`,
    userPrincipalName: `user${i + 1}@${domain}`,
    displayName: `User ${i + 1}`,
    distinguishedName: `CN=user${i + 1},OU=Staff,DC=healthy,DC=com,DC=au`,
    enabled: true,
    lastLogonDate: iso(Math.floor(Math.random() * 60) + 1),
    passwordLastSet: iso(Math.floor(Math.random() * 60) + 1),
    passwordNeverExpires: false,
    passwordNotRequired: false,
    proxyAddresses: [`SMTP:user${i + 1}@${domain}`],
    memberOf: [`CN=All-Staff,OU=Groups,DC=healthy,DC=com,DC=au`],
    servicePrincipalNames: [],
    whenCreated: iso(365 + i * 10),
    adminCount: null,
  }))

  return {
    ...BASE,
    domainInfo: {
      name: 'healthy.com.au',
      forest: 'healthy.com.au',
      netBIOSName: 'HEALTHY',
      domainFunctionalLevel: 'Windows2016Domain',
      upnSuffixes: ['healthy.com.au'],
    },
    users,
    groups: [
      {
        name: 'All-Staff',
        sAMAccountName: 'All-Staff',
        distinguishedName: 'CN=All-Staff,OU=Groups,DC=healthy,DC=com,DC=au',
        groupScope: 'Global',
        groupCategory: 'Security',
        members: users.map(u => u.distinguishedName),
        memberOf: [],
      },
      {
        name: 'Domain Admins',
        sAMAccountName: 'Domain Admins',
        distinguishedName: 'CN=Domain Admins,CN=Users,DC=healthy,DC=com,DC=au',
        groupScope: 'Global',
        groupCategory: 'Security',
        members: ['CN=user1,OU=Staff,DC=healthy,DC=com,DC=au'],
        memberOf: [],
      },
    ],
    computers: Array.from({ length: 10 }, (_, i) => ({
      name: `HLT-WS-${String(i + 1).padStart(3, '0')}`,
      sAMAccountName: `HLT-WS-${String(i + 1).padStart(3, '0')}$`,
      distinguishedName: `CN=HLT-WS-${String(i + 1).padStart(3, '0')},OU=Workstations,DC=healthy,DC=com,DC=au`,
      dnsHostName: `hlt-ws-${String(i + 1).padStart(3, '0')}.healthy.com.au`,
      operatingSystem: 'Windows 11 Enterprise',
      operatingSystemVersion: '10.0 (26100)',
      enabled: true,
      lastLogonDate: iso(Math.floor(Math.random() * 30) + 1),
      whenCreated: iso(200 + i * 5),
    })),
    ous: [
      { name: 'Staff', distinguishedName: 'OU=Staff,DC=healthy,DC=com,DC=au', gpLinks: [] },
      { name: 'Groups', distinguishedName: 'OU=Groups,DC=healthy,DC=com,DC=au', gpLinks: [] },
      { name: 'Workstations', distinguishedName: 'OU=Workstations,DC=healthy,DC=com,DC=au', gpLinks: [] },
    ],
    gpos: [
      {
        displayName: 'Default Domain Policy',
        id: '31b2f340-016d-11d2-945f-00c04fb984f9',
        gpoStatus: 'AllSettingsEnabled',
        linkedOUs: ['DC=healthy,DC=com,DC=au'],
      },
    ],
    passwordPolicy: {
      minPasswordLength: 14,
      maxPasswordAge: '60.00:00:00',
      minPasswordAge: '1.00:00:00',
      passwordHistoryCount: 24,
      lockoutThreshold: 5,
      lockoutDuration: '00:30:00',
      complexityEnabled: true,
      reversibleEncryptionEnabled: false,
    },
  }
}

// ─── Messy org ────────────────────────────────────────────────────────────────
// ~80 users, one of every issue type seeded

function buildMessyOrg(): ADExport {
  const routableDomain = 'messycorp.com.au'
  const nonRoutableDomain = 'messycorp.local'

  const users = [
    // 1. Stale active users (>90 days no login)
    ...Array.from({ length: 15 }, (_, i) => ({
      sAMAccountName: `stale${i + 1}`,
      userPrincipalName: `stale${i + 1}@${routableDomain}`,
      displayName: `Stale User ${i + 1}`,
      distinguishedName: `CN=stale${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(100 + i * 10),
      passwordLastSet: iso(200),
      passwordNeverExpires: false,
      passwordNotRequired: false,
      proxyAddresses: [`SMTP:stale${i + 1}@${routableDomain}`],
      memberOf: [],
      servicePrincipalNames: [],
      whenCreated: iso(800),
      adminCount: null,
    })),

    // 2. Non-routable UPN users
    ...Array.from({ length: 10 }, (_, i) => ({
      sAMAccountName: `nonroute${i + 1}`,
      userPrincipalName: `nonroute${i + 1}@${nonRoutableDomain}`,
      displayName: `NonRoutable ${i + 1}`,
      distinguishedName: `CN=nonroute${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(5),
      passwordLastSet: iso(30),
      passwordNeverExpires: false,
      passwordNotRequired: false,
      proxyAddresses: [`SMTP:nonroute${i + 1}@${routableDomain}`],
      memberOf: [],
      servicePrincipalNames: [],
      whenCreated: iso(500),
      adminCount: null,
    })),

    // 3. Password never expires (humans, not service accounts)
    ...Array.from({ length: 8 }, (_, i) => ({
      sAMAccountName: `pnex${i + 1}`,
      userPrincipalName: `pnex${i + 1}@${routableDomain}`,
      displayName: `PNE User ${i + 1}`,
      distinguishedName: `CN=pnex${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(10),
      passwordLastSet: iso(400),
      passwordNeverExpires: true,
      passwordNotRequired: false,
      proxyAddresses: [],
      memberOf: [],
      servicePrincipalNames: [],
      whenCreated: iso(600),
      adminCount: null,
    })),

    // 4. Duplicate proxyAddresses
    ...Array.from({ length: 5 }, (_, i) => ({
      sAMAccountName: `dupproxy${i + 1}`,
      userPrincipalName: `dupproxy${i + 1}@${routableDomain}`,
      displayName: `DupProxy ${i + 1}`,
      distinguishedName: `CN=dupproxy${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(15),
      passwordLastSet: iso(30),
      passwordNeverExpires: false,
      passwordNotRequired: false,
      // Intentional collision: SMTP and smtp pointing to same address
      proxyAddresses: [
        `SMTP:dupproxy${i + 1}@${routableDomain}`,
        `smtp:dupproxy${i + 1}@${routableDomain}`,
      ],
      memberOf: [],
      servicePrincipalNames: [],
      whenCreated: iso(400),
      adminCount: null,
    })),

    // 5. Domain Admins (too many — 10)
    ...Array.from({ length: 10 }, (_, i) => ({
      sAMAccountName: `adm${i + 1}`,
      userPrincipalName: `adm${i + 1}@${routableDomain}`,
      displayName: `Admin ${i + 1}`,
      mail: `adm${i + 1}@${routableDomain}`, // admins with mailboxes — finding
      distinguishedName: `CN=adm${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(5),
      passwordLastSet: iso(20),
      passwordNeverExpires: i < 3, // some DA have password never expires
      passwordNotRequired: false,
      proxyAddresses: [`SMTP:adm${i + 1}@${routableDomain}`],
      memberOf: ['CN=Domain Admins,CN=Users,DC=messycorp,DC=local'],
      servicePrincipalNames: [],
      whenCreated: iso(1000),
      adminCount: 1,
    })),

    // 6. Service accounts with SPNs
    ...Array.from({ length: 8 }, (_, i) => ({
      sAMAccountName: `svc_app${i + 1}`,
      userPrincipalName: `svc_app${i + 1}@${nonRoutableDomain}`,
      displayName: `Service Account ${i + 1}`,
      distinguishedName: `CN=svc_app${i + 1},OU=ServiceAccounts,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(45),
      passwordLastSet: iso(500),
      passwordNeverExpires: true,
      passwordNotRequired: false,
      proxyAddresses: [],
      memberOf: [],
      servicePrincipalNames: [`MSSQLSvc/sql${i + 1}.messycorp.local:1433`],
      whenCreated: iso(800),
      adminCount: null,
    })),

    // 7. Normal active users (to pad out)
    ...Array.from({ length: 24 }, (_, i) => ({
      sAMAccountName: `normal${i + 1}`,
      userPrincipalName: `normal${i + 1}@${routableDomain}`,
      displayName: `Normal User ${i + 1}`,
      distinguishedName: `CN=normal${i + 1},OU=Staff,DC=messycorp,DC=local`,
      enabled: true,
      lastLogonDate: iso(Math.floor(Math.random() * 30) + 1),
      passwordLastSet: iso(Math.floor(Math.random() * 60) + 1),
      passwordNeverExpires: false,
      passwordNotRequired: false,
      proxyAddresses: [`SMTP:normal${i + 1}@${routableDomain}`],
      memberOf: [],
      servicePrincipalNames: [],
      whenCreated: iso(365),
      adminCount: null,
    })),
  ]

  return {
    ...BASE,
    domainInfo: {
      name: nonRoutableDomain,
      forest: nonRoutableDomain,
      netBIOSName: 'MESSYCORP',
      domainFunctionalLevel: 'Windows2012R2Domain',
      upnSuffixes: [routableDomain, nonRoutableDomain],
    },
    users,
    groups: [
      {
        name: 'Domain Admins',
        sAMAccountName: 'Domain Admins',
        distinguishedName: 'CN=Domain Admins,CN=Users,DC=messycorp,DC=local',
        groupScope: 'Global',
        groupCategory: 'Security',
        members: users.filter(u => u.adminCount === 1).map(u => u.distinguishedName),
        memberOf: [],
      },
      // Empty groups (12)
      ...Array.from({ length: 12 }, (_, i) => ({
        name: `Legacy-Group-${i + 1}`,
        sAMAccountName: `Legacy-Group-${i + 1}`,
        distinguishedName: `CN=Legacy-Group-${i + 1},OU=Groups,DC=messycorp,DC=local`,
        groupScope: 'Global' as const,
        groupCategory: 'Security' as const,
        members: [],
        memberOf: [],
      })),
      // Single-member groups (5)
      ...Array.from({ length: 5 }, (_, i) => ({
        name: `Access-User-${i + 1}`,
        sAMAccountName: `Access-User-${i + 1}`,
        distinguishedName: `CN=Access-User-${i + 1},OU=Groups,DC=messycorp,DC=local`,
        groupScope: 'Global' as const,
        groupCategory: 'Security' as const,
        members: [`CN=normal${i + 1},OU=Staff,DC=messycorp,DC=local`],
        memberOf: [],
      })),
    ],
    computers: [
      // EOL computers
      ...Array.from({ length: 5 }, (_, i) => ({
        name: `MSY-WS-EOL-${i + 1}`,
        sAMAccountName: `MSY-WS-EOL-${i + 1}$`,
        distinguishedName: `CN=MSY-WS-EOL-${i + 1},OU=Workstations,DC=messycorp,DC=local`,
        dnsHostName: `msy-ws-eol-${i + 1}.messycorp.local`,
        operatingSystem: 'Windows 7 Enterprise',
        operatingSystemVersion: '6.1 (7601)',
        enabled: true,
        lastLogonDate: iso(30),
        whenCreated: iso(2000),
      })),
      // Stale computers
      ...Array.from({ length: 8 }, (_, i) => ({
        name: `MSY-WS-STL-${i + 1}`,
        sAMAccountName: `MSY-WS-STL-${i + 1}$`,
        distinguishedName: `CN=MSY-WS-STL-${i + 1},OU=Workstations,DC=messycorp,DC=local`,
        dnsHostName: `msy-ws-stl-${i + 1}.messycorp.local`,
        operatingSystem: 'Windows 10 Enterprise',
        operatingSystemVersion: '10.0 (19045)',
        enabled: true,
        lastLogonDate: iso(150),
        whenCreated: iso(800),
      })),
      // Current computers
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `MSY-WS-OK-${i + 1}`,
        sAMAccountName: `MSY-WS-OK-${i + 1}$`,
        distinguishedName: `CN=MSY-WS-OK-${i + 1},OU=Workstations,DC=messycorp,DC=local`,
        dnsHostName: `msy-ws-ok-${i + 1}.messycorp.local`,
        operatingSystem: 'Windows 11 Enterprise',
        operatingSystemVersion: '10.0 (26100)',
        enabled: true,
        lastLogonDate: iso(10),
        whenCreated: iso(200),
      })),
    ],
    ous: [
      { name: 'Staff', distinguishedName: 'OU=Staff,DC=messycorp,DC=local', gpLinks: [] },
      { name: 'Groups', distinguishedName: 'OU=Groups,DC=messycorp,DC=local', gpLinks: [] },
      { name: 'Workstations', distinguishedName: 'OU=Workstations,DC=messycorp,DC=local', gpLinks: [] },
      { name: 'ServiceAccounts', distinguishedName: 'OU=ServiceAccounts,DC=messycorp,DC=local', gpLinks: [] },
    ],
    gpos: [
      {
        displayName: 'Default Domain Policy',
        gpoStatus: 'AllSettingsEnabled',
        linkedOUs: ['DC=messycorp,DC=local'],
      },
      {
        displayName: 'Internet Explorer Lockdown',
        gpoStatus: 'AllSettingsDisabled',
        linkedOUs: [],
      },
    ],
    passwordPolicy: {
      minPasswordLength: 6, // too short — finding
      maxPasswordAge: '42.00:00:00',
      minPasswordAge: '0.00:00:00',
      passwordHistoryCount: 5, // too low
      lockoutThreshold: 0, // no lockout — finding
      complexityEnabled: false, // disabled — finding
      reversibleEncryptionEnabled: false,
    },
  }
}

// ─── Write ─────────────────────────────────────────────────────────────────────

function write(name: string, data: ADExport) {
  const p = path.resolve(process.cwd(), 'fixtures', name)
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`✓ ${name}: ${data.users.length} users, ${data.groups.length} groups, ${data.computers.length} computers`)
}

write('healthy-org.json', buildHealthyOrg())
write('messy-org.json', buildMessyOrg())
console.log('Done.')
