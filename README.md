# MigrateReady — AD → Entra ID Migration Assessor

> **Cut assessment time from ~3 consultant-days to under 1 hour.**  
> Upload an Active Directory export, get a scored readiness report, a phased wave plan, and actionable remediation steps — all without touching your production environment.

**[Live Demo →](https://migrate-ready.vercel.app)**  &nbsp;|&nbsp;  **[PowerShell Collector →](./collector/Get-ADAssessmentData.ps1)**

---

## The hybrid identity problem in AU

A large share of Australian mid-market organisations and government agencies are mid-journey from on-prem Active Directory to Microsoft Entra ID. MSPs in Perth, Sydney, and Melbourne bill heavily for exactly this assessment work — manually auditing stale accounts, checking UPN routing, mapping GPOs to Intune, and building cutover wave plans. MigrateReady automates the entire discovery and scoring phase so identity engineers can focus on remediation and client communication, not spreadsheet archaeology.

---

## What it does

```
[DC: Get-ADAssessmentData.ps1] → ad-export.json
                                        │
                               Upload UI (Next.js)
                                        │
                              Zod schema validation
                                        │
                         Normalised domain model (TS)
                                        │
                    ┌───────────────────┴───────────────────┐
                    │           Check Engine                 │
                    │   30 runners across 6 categories      │
                    │   Severity: blocker/high/medium/low    │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │  Wave Planner  │  Report Generator     │
                    │  IT pilot →    │  HTML + Markdown      │
                    │  bulk waves →  │  Print-ready CSS      │
                    │  privileged    │  Full check catalogue │
                    └────────────────┴───────────────────────┘
```

**Input:** JSON export from the included PowerShell collector (runs read-only on any domain controller).  
**Output:** Readiness score (0–100), prioritised findings with remediation, migration wave plan, exportable HTML/MD report.

---

## Check catalogue

30 automated checks across 6 categories. Each check returns `{ id, severity, affectedCount, sampleObjects (max 5), remediation, effortEstimate, docsUrl }`.

### Category 1 — Identity Hygiene

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `hygiene-stale-users` | Stale enabled user accounts (>90 days inactive) | high |
| `hygiene-stale-computers` | Stale enabled computer accounts (>90 days inactive) | medium |
| `hygiene-non-routable-upn` | Users with non-routable UPN suffixes (.local/.internal/.lan/.corp) | **blocker** |
| `hygiene-duplicate-proxy` | Duplicate or conflicting proxyAddresses | high |
| `hygiene-password-never-expires` | Enabled non-service-account users with PasswordNeverExpires | medium |
| `hygiene-upn-sam-mismatch` | UPN prefix ≠ sAMAccountName (breaks some SSO flows) | low |
| `hygiene-disabled-users-lingering` | Disabled accounts inactive >180 days (deletion candidates) | low |

### Category 2 — Sync Readiness

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `sync-attribute-length` | Attributes exceeding Entra ID field length limits | **blocker** |
| `sync-invalid-chars` | Invalid characters in sync-critical attributes | high |
| `sync-mail-collision` | Duplicate mail/mailNickname values (provisioning will fail) | **blocker** |
| `sync-entra-last-sync` | Entra Connect last sync >3 hours ago | high |
| `sync-provisioning-errors` | Provisioning errors reported by Entra tenant | blocker / high / medium |

### Category 3 — Authentication Modernisation

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `auth-spn-kerberos-apps` | Applications using Kerberos SPNs — require migration strategy | high |
| `auth-unconstrained-delegation` | Privileged service accounts with SPN (delegation risk) | high |
| `auth-service-account-pne` | Service accounts with PasswordNeverExpires | medium |
| `auth-smart-card-users` | Privileged accounts — verify MFA/Passwordless readiness | medium |

### Category 4 — Privileged Access

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `priv-da-count` | Domain Admins count exceeds threshold (>5 high, >10 blocker) | high / **blocker** |
| `priv-nested-groups` | Privileged groups with deep nesting (depth > 2) | high |
| `priv-admin-mailboxes` | Privileged accounts with mailboxes (separation of duties) | high |
| `priv-inactive-admins` | Privileged accounts inactive >30 days | high |
| `priv-admincount-anomaly` | adminCount > 0 on accounts not in privileged groups | medium |

### Category 5 — Group Rationalisation

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `group-empty` | Empty security groups (inflate sync scope) | medium / low |
| `group-single-member` | Security groups with only one member | low |
| `group-circular-nesting` | Circular group membership detected (BFS algorithm) | high |
| `group-orphaned-members` | Groups with orphaned member DN references | medium |

### Category 6 — Device & GPO Posture

| Check ID | Title | Default Severity |
|----------|-------|-----------------|
| `device-eol-os` | Devices running end-of-life OS (Win7 = blocker, Win10 EOL = high) | **blocker** / high |
| `device-stale-computers` | Stale enabled computer accounts (>90 days inactive) | medium |
| `device-entra-join-readiness` | % of workstations capable of Entra join | high / medium / low |
| `gpo-no-intune-equivalent` | GPO settings with no Intune equivalent — require remediation plan | high |
| `gpo-disabled-orphaned` | Disabled or unlinked GPOs (cleanup candidates) | low |

**Scoring:** Each failing check deducts from 100 (blocker: −25, high: −10, medium: −4, low: −1). If any blocker is present, the score is capped at 49 regardless of total deductions.

| Band | Score |
|------|-------|
| Excellent | 85–100 |
| Good | 70–84 |
| Fair | 50–69 |
| Poor | 30–49 |
| Critical | 0–29 |

---

## PowerShell Collector

The included collector script runs **read-only** against any domain controller using standard `Get-AD*` cmdlets. No elevated permissions beyond standard domain user are required for most attributes (Domain Admin required for GPO links and password policy).

```powershell
# Basic export
.\collector\Get-ADAssessmentData.ps1 -OutputPath .\ad-export.json

# With name anonymisation (SHA-256 hashes sAMAccountNames — safe for demos)
.\collector\Get-ADAssessmentData.ps1 -OutputPath .\ad-export.json -AnonymiseNames

# Target a specific domain controller
.\collector\Get-ADAssessmentData.ps1 -Server dc01.corp.local -OutputPath .\ad-export.json
```

**Attributes collected:** sAMAccountName, displayName, userPrincipalName, mail, proxyAddresses, department, enabled, lastLogonDate, passwordNeverExpires, passwordLastSet, adminCount, servicePrincipalNames, memberOf, operatingSystem, operatingSystemVersion, GPO display names and link status, password policy, domain trusts, UPN suffixes.

**Never collected:** password hashes, Kerberos keys, NTLM hashes, BitLocker recovery keys, certificate private keys, any secret or credential material.

See [docs/data-collected.md](./docs/data-collected.md) for the full attribute inventory with privacy justification.

---

## Architecture

```
src/
├── domain/           ← Pure functions, zero IO (testable in isolation)
│   ├── parser/       ← Zod schema + normaliser + streaming generator
│   ├── checks/       ← 30 check runners + scoring engine + GPO-Intune map
│   ├── waves/        ← Wave planner algorithm + reassign helper
│   └── report/       ← HTML + Markdown report generators + diff engine
├── services/
│   └── supabase/     ← Client + TypeScript DB types (assessments, runs, findings, waves)
└── app/              ← Next.js App Router
    ├── page.tsx      ← Landing page
    └── assess/       ← Assessment wizard (Upload → Findings → Wave Plan → Compare)
```

**Strict boundary:** `domain/` never imports from `services/` or `app/`. All side-effectful IO lives in `services/`. `app/` calls domain functions directly (client-side) and service functions for persistence.

---

## Performance

The parser uses **generator-based streaming** for O(1) memory handling of large exports. A 100,000-object directory processes without heap pressure — each object is normalised and yielded individually rather than materialising the full array.

```typescript
// Streaming 100k users — memory stays flat
for (const user of streamUsers(adExport)) {
  // process one at a time
}
```

The MinerTech demo (1,500 users, 33 groups, 350 computers) completes parse + 30 checks + wave planning in **under 1 second** in the browser.

---

## Security & Data Minimisation

- **Collector is read-only.** No write operations, no schema changes, no LDAP modifications.
- **Uploads processed in-memory.** The raw export JSON is parsed client-side; only finding results (counts, samples) are persisted to Supabase — never raw AD data.
- **Anonymisation mode.** The `-AnonymiseNames` flag replaces sAMAccountNames with a seeded SHA-256 hash, making exports safe to share for demos or external review.
- **Graph scopes (when connected):** `Directory.Read.All` only. This is the minimum scope required to read sync health and provisioning errors.
- **No secrets in repo.** Supabase credentials are in `.env.local` (gitignored). The demo runs entirely from the public `minertech-export.json` fixture.

---

## Running locally

```bash
git clone https://github.com/MG-Teban/hybrid-identity-assessor
cd hybrid-identity-assessor
npm install
npm run dev         # http://localhost:3001
npm test            # 177 tests
npx tsc --noEmit    # type check
```

To use your own AD export, run the PowerShell collector on a domain controller and upload the resulting JSON via the Upload tab.

---

## Limitations

- **Entra Connect health checks** (`sync-entra-last-sync`, `sync-provisioning-errors`) require Graph API credentials. Without them, these checks pass automatically and are marked as "not evaluated".
- **Entra Kerberos readiness** is inferred from SPN presence, not from live tenant queries. Actual app migration complexity varies significantly.
- **GPO content analysis** uses display name pattern matching against a static knowledge table — it does not parse ADMX settings. Complex or custom GPOs need manual review.
- **Wave planner** uses department attribute for grouping. Organisations with inconsistent or missing department data will see a single large wave.

---

## Roadmap

- [ ] Entra Connect config file (`.xml`) parsing for sync rule analysis
- [ ] ADFS claims rules import and modernisation guidance
- [ ] Conditional Access baseline gap analysis
- [ ] Entra ID Governance readiness check (access reviews, entitlement management)
- [ ] PDF report export
- [ ] Multi-tenant comparison (MSP mode — compare multiple client assessments)

---

## Database schema (Supabase)

```sql
assessments(id, org_name, created_by, created_at, source_schema_version)
runs(id, assessment_id, ran_at, readiness_score, blockers, summary jsonb)
findings(id, run_id, check_id, category, severity, affected_count, sample jsonb, remediation)
waves(id, run_id, wave_number, name, member_count, criteria jsonb)
```

Row-level security enforces per-user data isolation. Raw uploads are never stored — only parsed findings are persisted (data minimisation).

---

*MigrateReady — AD → Entra ID Assessment Toolkit*
