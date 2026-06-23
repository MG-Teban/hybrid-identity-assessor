import { z } from 'zod'

export const SCHEMA_VERSION = '1.0'

// ─── Primitives ──────────────────────────────────────────────────────────────

const IsoDateString = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))

// ─── User ─────────────────────────────────────────────────────────────────────

export const ADUserSchema = z.object({
  sAMAccountName: z.string(),
  userPrincipalName: z.string(),
  displayName: z.string().optional(),
  givenName: z.string().optional(),
  surname: z.string().optional(),
  mail: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  manager: z.string().optional(),
  distinguishedName: z.string(),
  enabled: z.boolean(),
  lastLogonDate: IsoDateString.optional().nullable(),
  passwordLastSet: IsoDateString.optional().nullable(),
  passwordNeverExpires: z.boolean().default(false),
  passwordNotRequired: z.boolean().default(false),
  proxyAddresses: z.array(z.string()).default([]),
  memberOf: z.array(z.string()).default([]),
  servicePrincipalNames: z.array(z.string()).default([]),
  whenCreated: IsoDateString.optional(),
  whenChanged: IsoDateString.optional(),
  adminCount: z.number().optional().nullable(),
  userAccountControl: z.number().optional(),
})

export type ADUser = z.infer<typeof ADUserSchema>

// ─── Group ────────────────────────────────────────────────────────────────────

export const ADGroupSchema = z.object({
  name: z.string(),
  sAMAccountName: z.string(),
  distinguishedName: z.string(),
  groupScope: z.enum(['DomainLocal', 'Global', 'Universal']).optional(),
  groupCategory: z.enum(['Security', 'Distribution']).optional(),
  members: z.array(z.string()).default([]),
  memberOf: z.array(z.string()).default([]),
  description: z.string().optional(),
  managedBy: z.string().optional(),
  whenCreated: IsoDateString.optional(),
})

export type ADGroup = z.infer<typeof ADGroupSchema>

// ─── Computer ─────────────────────────────────────────────────────────────────

export const ADComputerSchema = z.object({
  name: z.string(),
  sAMAccountName: z.string(),
  distinguishedName: z.string(),
  dnsHostName: z.string().optional(),
  operatingSystem: z.string().optional(),
  operatingSystemVersion: z.string().optional(),
  enabled: z.boolean(),
  lastLogonDate: IsoDateString.optional().nullable(),
  whenCreated: IsoDateString.optional(),
})

export type ADComputer = z.infer<typeof ADComputerSchema>

// ─── OU ───────────────────────────────────────────────────────────────────────

export const ADOUSchema = z.object({
  name: z.string(),
  distinguishedName: z.string(),
  description: z.string().optional(),
  gpLinks: z.array(z.string()).default([]),
})

export type ADOU = z.infer<typeof ADOUSchema>

// ─── GPO ──────────────────────────────────────────────────────────────────────

export const ADGPOSchema = z.object({
  displayName: z.string(),
  id: z.string().uuid().optional(),
  gpoStatus: z.enum(['AllSettingsEnabled', 'ComputerSettingsDisabled', 'UserSettingsDisabled', 'AllSettingsDisabled']).optional(),
  linkedOUs: z.array(z.string()).default([]),
  description: z.string().optional(),
})

export type ADGPO = z.infer<typeof ADGPOSchema>

// ─── Password Policy ──────────────────────────────────────────────────────────

export const ADPasswordPolicySchema = z.object({
  minPasswordLength: z.number().optional(),
  maxPasswordAge: z.string().optional(),
  minPasswordAge: z.string().optional(),
  passwordHistoryCount: z.number().optional(),
  lockoutThreshold: z.number().optional(),
  lockoutDuration: z.string().optional(),
  complexityEnabled: z.boolean().optional(),
  reversibleEncryptionEnabled: z.boolean().optional(),
})

export type ADPasswordPolicy = z.infer<typeof ADPasswordPolicySchema>

// ─── Trust ────────────────────────────────────────────────────────────────────

export const ADTrustSchema = z.object({
  name: z.string(),
  distinguishedName: z.string(),
  trustType: z.enum(['Uplevel', 'Downlevel', 'MIT', 'DCE']).optional(),
  trustDirection: z.enum(['Disabled', 'Inbound', 'Outbound', 'BiDirectional']).optional(),
  trustAttributes: z.number().optional(),
  selectiveAuthentication: z.boolean().optional(),
})

export type ADTrust = z.infer<typeof ADTrustSchema>

// ─── Domain Info ─────────────────────────────────────────────────────────────

export const ADDomainInfoSchema = z.object({
  name: z.string(),
  forest: z.string().optional(),
  netBIOSName: z.string().optional(),
  domainFunctionalLevel: z.string().optional(),
  forestFunctionalLevel: z.string().optional(),
  upnSuffixes: z.array(z.string()).default([]),
  pdcEmulator: z.string().optional(),
})

export type ADDomainInfo = z.infer<typeof ADDomainInfoSchema>

// ─── Root export ──────────────────────────────────────────────────────────────

export const ADExportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: IsoDateString,
  domainInfo: ADDomainInfoSchema,
  users: z.array(ADUserSchema),
  groups: z.array(ADGroupSchema),
  computers: z.array(ADComputerSchema),
  ous: z.array(ADOUSchema),
  gpos: z.array(ADGPOSchema),
  passwordPolicy: ADPasswordPolicySchema.optional(),
  trusts: z.array(ADTrustSchema).default([]),
  anonymised: z.boolean().default(false),
})

export type ADExport = z.infer<typeof ADExportSchema>
