/**
 * Demo dataset generator for MinerTech Australia (fictional).
 * Produces fixtures/minertech-export.json — a realistic 1,500-user AD export
 * shaped to exercise every readiness check category.
 *
 * Usage: npm run gen-demo
 */

import { Faker, en } from '@faker-js/faker'
import fs from 'fs'
import path from 'path'
import type { ADExport, ADUser, ADGroup, ADComputer, ADOU, ADGPO } from '../src/domain/parser/ad-export.schema'
import { SCHEMA_VERSION } from '../src/domain/parser/ad-export.schema'

const faker = new Faker({ locale: [en] })
faker.seed(42)

// ─── Config ───────────────────────────────────────────────────────────────────

const ORG = 'minertech'
const DOMAIN = 'minertech.local'
const ROUTABLE_UPN = 'minertech.com.au'
const TOTAL_USERS = 1500

const DEPARTMENTS = [
  { name: 'Operations', weight: 0.25, ou: 'Operations' },
  { name: 'Information Technology', weight: 0.1, ou: 'IT' },
  { name: 'Finance', weight: 0.1, ou: 'Finance' },
  { name: 'Human Resources', weight: 0.06, ou: 'HR' },
  { name: 'Safety & Environment', weight: 0.1, ou: 'Safety' },
  { name: 'Engineering', weight: 0.18, ou: 'Engineering' },
  { name: 'Management', weight: 0.04, ou: 'Management' },
  { name: 'Administration', weight: 0.08, ou: 'Administration' },
  { name: 'Legal & Compliance', weight: 0.04, ou: 'Legal' },
  { name: 'Procurement', weight: 0.05, ou: 'Procurement' },
]

const SITES = ['Perth', 'Kalgoorlie', 'Port Hedland', 'Newman', 'Geraldton']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weightedPick<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = faker.number.float({ min: 0, max: total })
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return items[items.length - 1].value
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function randomPastDate(maxDays: number): string {
  return daysAgo(faker.number.int({ min: 1, max: maxDays }))
}

function dnUser(sam: string, ou: string): string {
  return `CN=${sam},OU=${ou},OU=Users,DC=${ORG},DC=local`
}

function dnGroup(name: string): string {
  return `CN=${name},OU=Groups,DC=${ORG},DC=local`
}

function dnComputer(name: string, ou: string): string {
  return `CN=${name},OU=${ou},OU=Computers,DC=${ORG},DC=local`
}

// ─── OUs ──────────────────────────────────────────────────────────────────────

function buildOUs(): ADOU[] {
  const ous: ADOU[] = [
    { name: 'Users', distinguishedName: `OU=Users,DC=${ORG},DC=local`, gpLinks: [] },
    { name: 'Groups', distinguishedName: `OU=Groups,DC=${ORG},DC=local`, gpLinks: [] },
    { name: 'Computers', distinguishedName: `OU=Computers,DC=${ORG},DC=local`, gpLinks: [] },
    { name: 'ServiceAccounts', distinguishedName: `OU=ServiceAccounts,DC=${ORG},DC=local`, gpLinks: [] },
    { name: 'Servers', distinguishedName: `OU=Servers,DC=${ORG},DC=local`, gpLinks: [`CN=Server Baseline Policy,CN=Policies,CN=System,DC=${ORG},DC=local`] },
  ]
  for (const dept of DEPARTMENTS) {
    ous.push({
      name: dept.ou,
      distinguishedName: `OU=${dept.ou},OU=Users,DC=${ORG},DC=local`,
      gpLinks: [],
    })
    ous.push({
      name: dept.ou,
      distinguishedName: `OU=${dept.ou},OU=Computers,DC=${ORG},DC=local`,
      gpLinks: [`CN=Workstation Baseline Policy,CN=Policies,CN=System,DC=${ORG},DC=local`],
    })
  }
  return ous
}

// ─── GPOs ─────────────────────────────────────────────────────────────────────

function buildGPOs(): ADGPO[] {
  return [
    { displayName: 'Default Domain Policy', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`DC=${ORG},DC=local`] },
    { displayName: 'Workstation Baseline Policy', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: DEPARTMENTS.map(d => `OU=${d.ou},OU=Computers,DC=${ORG},DC=local`) },
    { displayName: 'Server Baseline Policy', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Servers,DC=${ORG},DC=local`] },
    { displayName: 'IT Admin Workstations', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=IT,OU=Computers,DC=${ORG},DC=local`] },
    { displayName: 'Internet Explorer Lockdown', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Users,DC=${ORG},DC=local`] },
    { displayName: 'Drive Mappings - Finance', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Finance,OU=Users,DC=${ORG},DC=local`] },
    { displayName: 'Drive Mappings - Operations', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Operations,OU=Users,DC=${ORG},DC=local`] },
    { displayName: 'BitLocker - Workstations', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: DEPARTMENTS.map(d => `OU=${d.ou},OU=Computers,DC=${ORG},DC=local`) },
    { displayName: 'Windows Firewall - Servers', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Servers,DC=${ORG},DC=local`] },
    { displayName: 'Software Restrictions - Legacy', id: faker.string.uuid(), gpoStatus: 'AllSettingsDisabled', linkedOUs: [] },
    { displayName: 'Audit Policy - Domain Controllers', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Domain Controllers,DC=${ORG},DC=local`] },
    { displayName: 'User Rights Assignment - Servers', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Servers,DC=${ORG},DC=local`] },
    { displayName: 'Screen Saver Policy', id: faker.string.uuid(), gpoStatus: 'UserSettingsDisabled', linkedOUs: [] },
    { displayName: 'Proxy Settings - All Sites', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Users,DC=${ORG},DC=local`] },
    { displayName: 'Windows Update - WSUS', id: faker.string.uuid(), gpoStatus: 'AllSettingsEnabled', linkedOUs: [`OU=Computers,DC=${ORG},DC=local`, `OU=Servers,DC=${ORG},DC=local`] },
  ]
}

// ─── Users ────────────────────────────────────────────────────────────────────

interface UserMeta {
  user: ADUser
  dept: typeof DEPARTMENTS[0]
  isAdmin: boolean
  isServiceAccount: boolean
}

function buildUsers(): UserMeta[] {
  const users: UserMeta[] = []
  const usedSAMs = new Set<string>()
  const DA_GROUP_DN = dnGroup('Domain Admins')
  const IT_ADMIN_DN = dnGroup('IT-Admins')

  // Service accounts (25)
  for (let i = 1; i <= 25; i++) {
    const sam = `svc_${faker.hacker.noun().replace(/\s/g, '').toLowerCase()}${i}`
    const spn = faker.helpers.arrayElement([
      `MSSQLSvc/sql${i.toString().padStart(2, '0')}.${DOMAIN}:1433`,
      `HTTP/web${i}.${DOMAIN}`,
      `HOST/app${i}.${DOMAIN}`,
    ])
    users.push({
      user: {
        sAMAccountName: sam,
        userPrincipalName: `${sam}@${DOMAIN}`,
        displayName: `Service Account - ${sam}`,
        distinguishedName: `CN=${sam},OU=ServiceAccounts,DC=${ORG},DC=local`,
        enabled: true,
        lastLogonDate: faker.datatype.boolean({ probability: 0.6 }) ? randomPastDate(180) : null,
        passwordLastSet: randomPastDate(365),
        passwordNeverExpires: true,
        passwordNotRequired: false,
        proxyAddresses: [],
        memberOf: [],
        servicePrincipalNames: [spn],
        whenCreated: daysAgo(faker.number.int({ min: 365, max: 2000 })),
        adminCount: null,
      },
      dept: DEPARTMENTS[1], // IT
      isAdmin: false,
      isServiceAccount: true,
    })
  }

  // Domain Admins (8 — intentionally high for a finding)
  const domainAdmins = ['adm_johnson', 'adm_smith', 'adm_nguyen', 'adm_roberts', 'adm_davies', 'adm_brown', 'adm_wilson', 'adm_taylor']
  for (const sam of domainAdmins) {
    users.push({
      user: {
        sAMAccountName: sam,
        userPrincipalName: `${sam}@${DOMAIN}`,
        displayName: `Admin - ${sam.replace('adm_', '')}`,
        mail: `${sam}@${ROUTABLE_UPN}`,
        department: 'Information Technology',
        title: 'System Administrator',
        distinguishedName: dnUser(sam, 'IT'),
        enabled: true,
        lastLogonDate: randomPastDate(30),
        passwordLastSet: randomPastDate(90),
        passwordNeverExpires: faker.datatype.boolean({ probability: 0.3 }),
        passwordNotRequired: false,
        proxyAddresses: [`SMTP:${sam}@${ROUTABLE_UPN}`],
        memberOf: [DA_GROUP_DN, IT_ADMIN_DN],
        servicePrincipalNames: [],
        whenCreated: daysAgo(faker.number.int({ min: 500, max: 2000 })),
        adminCount: 1,
      },
      dept: DEPARTMENTS[1],
      isAdmin: true,
      isServiceAccount: false,
    })
    usedSAMs.add(sam)
  }

  // Regular users
  const deptWeights = DEPARTMENTS.map(d => ({ value: d, weight: d.weight }))
  const remaining = TOTAL_USERS - users.length

  for (let i = 0; i < remaining; i++) {
    const first = faker.person.firstName()
    const last = faker.person.lastName()
    let sam = `${first.toLowerCase().charAt(0)}${last.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}`
    let attempt = 0
    while (usedSAMs.has(sam)) {
      sam = `${first.toLowerCase().charAt(0)}${last.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)}${++attempt}`
    }
    usedSAMs.add(sam)

    const dept = weightedPick(deptWeights)
    const isStale = faker.datatype.boolean({ probability: 0.15 })
    const isPasswordNeverExpires = faker.datatype.boolean({ probability: 0.1 })
    const isDisabled = faker.datatype.boolean({ probability: 0.06 })
    // ~8% have non-routable UPN (still on .local)
    const hasNonRoutableUPN = faker.datatype.boolean({ probability: 0.08 })
    const upnDomain = hasNonRoutableUPN ? DOMAIN : ROUTABLE_UPN
    const hasDuplicateProxy = faker.datatype.boolean({ probability: 0.03 })

    const lastLogon = isStale
      ? (faker.datatype.boolean({ probability: 0.3 }) ? null : daysAgo(faker.number.int({ min: 91, max: 730 })))
      : randomPastDate(89)

    const proxies = [`SMTP:${sam}@${ROUTABLE_UPN}`]
    if (hasDuplicateProxy) proxies.push(`smtp:${sam}@${ROUTABLE_UPN}`) // intentional collision

    users.push({
      user: {
        sAMAccountName: sam,
        userPrincipalName: `${sam}@${upnDomain}`,
        displayName: `${first} ${last}`,
        givenName: first,
        surname: last,
        mail: `${sam}@${ROUTABLE_UPN}`,
        department: dept.name,
        title: faker.person.jobTitle(),
        company: 'MinerTech Australia',
        distinguishedName: dnUser(sam, dept.ou),
        enabled: !isDisabled,
        lastLogonDate: lastLogon,
        passwordLastSet: isDisabled ? daysAgo(faker.number.int({ min: 180, max: 1000 })) : randomPastDate(89),
        passwordNeverExpires: isPasswordNeverExpires,
        passwordNotRequired: false,
        proxyAddresses: proxies,
        memberOf: [dnGroup(`${dept.ou}-Users`)],
        servicePrincipalNames: [],
        whenCreated: daysAgo(faker.number.int({ min: 30, max: 2500 })),
        adminCount: null,
      },
      dept,
      isAdmin: false,
      isServiceAccount: false,
    })
  }

  return users
}

// ─── Groups ───────────────────────────────────────────────────────────────────

function buildGroups(userMetas: UserMeta[]): ADGroup[] {
  const groups: ADGroup[] = []
  const usersByDept: Record<string, ADUser[]> = {}

  for (const m of userMetas) {
    if (!usersByDept[m.dept.ou]) usersByDept[m.dept.ou] = []
    if (!m.isServiceAccount) usersByDept[m.dept.ou].push(m.user)
  }

  // Department groups
  for (const dept of DEPARTMENTS) {
    const members = (usersByDept[dept.ou] ?? []).map(u => u.distinguishedName)
    groups.push({
      name: `${dept.ou}-Users`,
      sAMAccountName: `${dept.ou}-Users`,
      distinguishedName: dnGroup(`${dept.ou}-Users`),
      groupScope: 'Global',
      groupCategory: 'Security',
      members,
      memberOf: [],
    })
  }

  // Privileged groups
  const admins = userMetas.filter(m => m.isAdmin).map(m => m.user.distinguishedName)
  groups.push({
    name: 'Domain Admins',
    sAMAccountName: 'Domain Admins',
    distinguishedName: dnGroup('Domain Admins'),
    groupScope: 'Global',
    groupCategory: 'Security',
    members: admins,
    memberOf: [dnGroup('Administrators')],
  })
  groups.push({
    name: 'Administrators',
    sAMAccountName: 'Administrators',
    distinguishedName: dnGroup('Administrators'),
    groupScope: 'DomainLocal',
    groupCategory: 'Security',
    members: [dnGroup('Domain Admins')],
    memberOf: [],
  })
  groups.push({
    name: 'IT-Admins',
    sAMAccountName: 'IT-Admins',
    distinguishedName: dnGroup('IT-Admins'),
    groupScope: 'Global',
    groupCategory: 'Security',
    members: admins,
    memberOf: [dnGroup('Domain Admins')], // intentional nested priv group finding
  })

  // Empty groups (for rationalisation check)
  for (let i = 1; i <= 12; i++) {
    groups.push({
      name: `Legacy-Group-${i.toString().padStart(2, '0')}`,
      sAMAccountName: `Legacy-Group-${i.toString().padStart(2, '0')}`,
      distinguishedName: dnGroup(`Legacy-Group-${i.toString().padStart(2, '0')}`),
      groupScope: 'Global',
      groupCategory: 'Security',
      members: [],
      memberOf: [],
    })
  }

  // Single-member groups
  const singleMemberSource = userMetas.filter(m => !m.isServiceAccount && !m.isAdmin).slice(0, 8)
  for (const m of singleMemberSource) {
    groups.push({
      name: `Access-${m.user.sAMAccountName}`,
      sAMAccountName: `Access-${m.user.sAMAccountName}`,
      distinguishedName: dnGroup(`Access-${m.user.sAMAccountName}`),
      groupScope: 'Global',
      groupCategory: 'Security',
      members: [m.user.distinguishedName],
      memberOf: [],
    })
  }

  return groups
}

// ─── Computers ────────────────────────────────────────────────────────────────

function buildComputers(): ADComputer[] {
  const computers: ADComputer[] = []
  const osOptions = [
    { os: 'Windows 11 Enterprise', ver: '10.0 (26100)', weight: 0.4 },
    { os: 'Windows 10 Enterprise', ver: '10.0 (19045)', weight: 0.35 },
    { os: 'Windows 10 Enterprise', ver: '10.0 (17763)', weight: 0.1 }, // EOL build
    { os: 'Windows 7 Enterprise', ver: '6.1 (7601)', weight: 0.05 },  // EOL OS
    { os: 'Windows Server 2022 Standard', ver: '10.0 (20348)', weight: 0.05 },
    { os: 'Windows Server 2019 Standard', ver: '10.0 (17763)', weight: 0.03 },
    { os: 'Windows Server 2012 R2 Standard', ver: '6.3 (9600)', weight: 0.02 }, // EOL
  ]
  const osWeights = osOptions.map(o => ({ value: o, weight: o.weight }))

  for (let i = 1; i <= 350; i++) {
    const site = faker.helpers.arrayElement(SITES).toUpperCase().slice(0, 3)
    const dept = faker.helpers.arrayElement(DEPARTMENTS)
    const isServer = i > 300
    const name = isServer
      ? `MT-SRV-${i.toString().padStart(3, '0')}`
      : `MT-${site}-WS-${i.toString().padStart(4, '0')}`
    const { os, ver } = weightedPick(osWeights)
    const isStale = faker.datatype.boolean({ probability: 0.12 })

    computers.push({
      name,
      sAMAccountName: `${name}$`,
      distinguishedName: isServer ? dnComputer(name, 'Servers') : dnComputer(name, dept.ou),
      dnsHostName: `${name.toLowerCase()}.${DOMAIN}`,
      operatingSystem: os,
      operatingSystemVersion: ver,
      enabled: !faker.datatype.boolean({ probability: 0.04 }),
      lastLogonDate: isStale
        ? daysAgo(faker.number.int({ min: 91, max: 500 }))
        : randomPastDate(89),
      whenCreated: daysAgo(faker.number.int({ min: 30, max: 2000 })),
    })
  }
  return computers
}

// ─── Assemble & write ─────────────────────────────────────────────────────────

function main() {
  const userMetas = buildUsers()
  const users = userMetas.map(m => m.user)
  const groups = buildGroups(userMetas)
  const computers = buildComputers()
  const ous = buildOUs()
  const gpos = buildGPOs()

  const exportData: ADExport = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    domainInfo: {
      name: DOMAIN,
      forest: DOMAIN,
      netBIOSName: 'MINERTECH',
      domainFunctionalLevel: 'Windows2016Domain',
      forestFunctionalLevel: 'Windows2016Forest',
      // Non-routable UPN suffix still in use — triggers sync-readiness check
      upnSuffixes: [ROUTABLE_UPN, DOMAIN],
      pdcEmulator: `MT-DC-001.${DOMAIN}`,
    },
    users,
    groups,
    computers,
    ous,
    gpos,
    passwordPolicy: {
      minPasswordLength: 8,
      maxPasswordAge: '42.00:00:00',
      minPasswordAge: '1.00:00:00',
      passwordHistoryCount: 24,
      lockoutThreshold: 5,
      lockoutDuration: '00:30:00',
      complexityEnabled: true,
      reversibleEncryptionEnabled: false,
    },
    trusts: [],
    anonymised: false,
  }

  const outPath = path.resolve(process.cwd(), 'fixtures', 'minertech-export.json')
  fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf-8')

  console.log(`✓ Generated ${users.length} users, ${groups.length} groups, ${computers.length} computers`)
  console.log(`✓ Written to ${outPath}`)
}

main()
