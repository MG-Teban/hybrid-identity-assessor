import type { CheckResult } from '../checks/types'
import type { ReadinessScore } from '../checks/scoring'
import type { WavePlan } from '../waves/types'
import type { NormalisedExport } from '../parser/normalised-types'

export interface ReportInput {
  orgName: string
  score: ReadinessScore
  results: CheckResult[]
  wavePlan: WavePlan
  normalised: NormalisedExport
  generatedAt?: Date
}

const SEV_ICON: Record<string, string> = {
  blocker: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
}

export function generateMarkdownReport(input: ReportInput): string {
  const { orgName, score, results, wavePlan, normalised } = input
  const date = (input.generatedAt ?? new Date()).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const failed = results
    .filter(r => !r.passed)
    .sort((a, b) => ({ blocker: 0, high: 1, medium: 2, low: 3 }[a.severity] - { blocker: 0, high: 1, medium: 2, low: 3 }[b.severity]))

  const passed = results.filter(r => r.passed)

  const effortBand = score.blockerCount > 0 ? 'High (blockers must be resolved first)'
    : score.highCount > 3 ? 'Medium–High'
    : score.highCount > 0 ? 'Medium'
    : 'Low'

  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# MigrateReady Assessment Report`)
  lines.push(``)
  lines.push(`**Organisation:** ${orgName}  `)
  lines.push(`**Generated:** ${date}  `)
  lines.push(`**Tool:** MigrateReady — AD → Entra ID Assessor`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  // ── Executive Summary ─────────────────────────────────────────────────────
  lines.push(`## Executive Summary`)
  lines.push(``)
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| **Readiness Score** | **${score.score}/100 (${score.band})** |`)
  lines.push(`| Score capped by blockers | ${score.cappedByBlocker ? 'Yes ⚠️' : 'No ✅'} |`)
  lines.push(`| Blockers | ${score.blockerCount} |`)
  lines.push(`| High | ${score.highCount} |`)
  lines.push(`| Medium | ${score.mediumCount} |`)
  lines.push(`| Low | ${score.lowCount} |`)
  lines.push(`| Checks passed | ${score.passedCount}/${score.totalChecks} |`)
  lines.push(`| Estimated effort | ${effortBand} |`)
  lines.push(``)
  lines.push(`### Inventory`)
  lines.push(``)
  lines.push(`| Object | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Users | ${normalised.users.length.toLocaleString()} |`)
  lines.push(`| Computers | ${normalised.computers.length.toLocaleString()} |`)
  lines.push(`| Groups | ${normalised.groups.length.toLocaleString()} |`)
  lines.push(`| GPOs | ${normalised.gpos.length} |`)
  lines.push(``)

  if (score.blockerCount > 0) {
    lines.push(`> ⚠️ **${score.blockerCount} blocker${score.blockerCount > 1 ? 's' : ''} found.** Migration cannot proceed until these are resolved. The readiness score is capped at 49.`)
    lines.push(``)
  } else {
    lines.push(`> ✅ No blockers. Migration can proceed — address high-severity findings before Wave 1.`)
    lines.push(``)
  }

  // ── Findings ──────────────────────────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Findings`)
  lines.push(``)

  if (failed.length === 0) {
    lines.push(`✅ All ${results.length} checks passed.`)
    lines.push(``)
  } else {
    lines.push(`| Severity | Finding | Affected | Effort | Docs |`)
    lines.push(`|----------|---------|----------|--------|------|`)
    for (const r of failed) {
      const icon = SEV_ICON[r.severity]
      lines.push(`| ${icon} ${r.severity} | ${r.title} | ${r.affectedCount.toLocaleString()} | ${r.effortEstimate} | [Learn](${r.docsUrl}) |`)
    }
    lines.push(``)

    // Detail blocks for each failing check
    lines.push(`### Finding Details`)
    lines.push(``)
    for (const r of failed) {
      lines.push(`#### ${SEV_ICON[r.severity]} ${r.title}`)
      lines.push(``)
      lines.push(`**Severity:** ${r.severity} · **Affected:** ${r.affectedCount.toLocaleString()} · **Effort:** ${r.effortEstimate}`)
      lines.push(``)
      lines.push(`**Remediation:** ${r.remediation}`)
      lines.push(``)
      if (r.sampleObjects.length > 0) {
        lines.push(`**Sample objects:**`)
        lines.push(``)
        for (const obj of r.sampleObjects) {
          const details = Object.entries(obj.details ?? {})
            .map(([k, v]) => `${k}: \`${v}\``)
            .join(' · ')
          lines.push(`- **${obj.label}** — ${details}`)
        }
        lines.push(``)
      }
      lines.push(`**Reference:** ${r.docsUrl}`)
      lines.push(``)
    }
  }

  // ── Passed checks ─────────────────────────────────────────────────────────
  if (passed.length > 0) {
    lines.push(`### Passed Checks`)
    lines.push(``)
    lines.push(passed.map(r => `- ✅ ${r.title}`).join('\n'))
    lines.push(``)
  }

  // ── Wave Plan ─────────────────────────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Migration Wave Plan`)
  lines.push(``)
  lines.push(`Total users in scope: **${wavePlan.totalUsers.toLocaleString()}**`)
  lines.push(``)

  for (const wave of wavePlan.waves) {
    const icon = wave.waveNumber === 0 ? '🔵' : wave.name.includes('Privileged') ? '🔴' : '⚪'
    lines.push(`### ${icon} ${wave.name}`)
    lines.push(``)
    lines.push(`**Users:** ${wave.members.length.toLocaleString()} · **Criteria:** ${wave.criteria.join(', ')}`)
    lines.push(``)
    if (wave.members.length <= 10) {
      for (const m of wave.members) {
        lines.push(`- ${m.displayName} (${m.department ?? 'No dept'}) — risk: ${m.riskScore}, flags: ${m.riskFlags.join(', ')}`)
      }
      lines.push(``)
    }
  }

  // ── Prerequisites ──────────────────────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Migration Prerequisites`)
  lines.push(``)
  lines.push(`1. Resolve all **blocker**-severity findings before enabling Entra Connect sync`)
  lines.push(`2. Register and verify a routable UPN suffix in Entra ID`)
  lines.push(`3. Deploy Entra Connect or Cloud Sync in *staging mode* first`)
  lines.push(`4. Run Wave 0 pilot (IT/helpdesk) and validate sign-on`)
  lines.push(`5. Migrate privileged accounts last with PIM just-in-time configured`)
  lines.push(`6. Decommission on-premises AD only after all workloads validated`)
  lines.push(``)

  // ── Check Catalogue ────────────────────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Appendix — Full Check Catalogue`)
  lines.push(``)
  lines.push(`| Check ID | Title | Severity | Result |`)
  lines.push(`|----------|-------|----------|--------|`)
  for (const r of results) {
    const status = r.passed ? '✅ Pass' : `❌ ${r.affectedCount.toLocaleString()} affected`
    lines.push(`| \`${r.id}\` | ${r.title} | ${r.severity} | ${status} |`)
  }
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`*Generated by MigrateReady · AD → Entra ID Assessment Toolkit*`)

  return lines.join('\n')
}
