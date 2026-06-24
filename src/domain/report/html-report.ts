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

const SEVERITY_COLOR: Record<string, string> = {
  blocker: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#64748b',
}

const BAND_COLOR: Record<string, string> = {
  critical: '#dc2626',
  poor: '#ea580c',
  fair: '#d97706',
  good: '#2563eb',
  excellent: '#16a34a',
}

function scoreGaugeSvg(score: number, band: string): string {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = BAND_COLOR[band] ?? '#64748b'
  return `<svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      stroke-linecap="round" transform="rotate(-90 70 70)"/>
    <text x="70" y="66" text-anchor="middle" font-size="26" font-weight="700" font-family="system-ui" fill="${color}">${score}</text>
    <text x="70" y="83" text-anchor="middle" font-size="12" font-family="system-ui" fill="#94a3b8">${band}</text>
  </svg>`
}

function findingsTable(results: CheckResult[]): string {
  const failed = results
    .filter(r => !r.passed)
    .sort((a, b) => {
      const order = { blocker: 0, high: 1, medium: 2, low: 3 }
      return order[a.severity] - order[b.severity]
    })

  if (failed.length === 0) return '<p style="color:#16a34a;font-weight:600">✓ All checks passed</p>'

  const rows = failed.map(r => `
    <tr>
      <td><span class="badge" style="background:${SEVERITY_COLOR[r.severity]}20;color:${SEVERITY_COLOR[r.severity]};border:1px solid ${SEVERITY_COLOR[r.severity]}40">${r.severity}</span></td>
      <td>${r.title}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${r.affectedCount.toLocaleString()}</td>
      <td>${r.effortEstimate}</td>
      <td><a href="${r.docsUrl}" style="color:#2563eb;font-size:12px">Learn →</a></td>
    </tr>`).join('')

  return `<table class="findings-table">
    <thead><tr><th>Severity</th><th>Finding</th><th>Affected</th><th>Effort</th><th>Docs</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function wavePlanSection(wavePlan: WavePlan): string {
  return wavePlan.waves.map(wave => {
    const color = wave.waveNumber === 0 ? '#2563eb'
      : wave.name.includes('Privileged') ? '#dc2626' : '#475569'
    return `
    <div class="wave-block" style="border-left:4px solid ${color}">
      <h4 style="margin:0 0 4px;color:${color}">${wave.name}</h4>
      <p style="margin:0;font-size:13px;color:#475569">${wave.members.length} users · ${wave.criteria.join(' · ')}</p>
    </div>`
  }).join('')
}

function checkCatalogueTable(results: CheckResult[]): string {
  const rows = results.map(r => `
    <tr style="${r.passed ? 'opacity:0.5' : ''}">
      <td><code style="font-size:11px">${r.id}</code></td>
      <td>${r.title}</td>
      <td><span class="badge" style="background:${SEVERITY_COLOR[r.severity]}20;color:${SEVERITY_COLOR[r.severity]};border:1px solid ${SEVERITY_COLOR[r.severity]}40">${r.severity}</span></td>
      <td style="text-align:center">${r.passed ? '✓' : r.affectedCount.toLocaleString()}</td>
    </tr>`).join('')

  return `<table class="findings-table">
    <thead><tr><th>Check ID</th><th>Title</th><th>Severity</th><th>Affected</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

export function generateHTMLReport(input: ReportInput): string {
  const { orgName, score, results, wavePlan, normalised } = input
  const date = (input.generatedAt ?? new Date()).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const effortBand = score.blockerCount > 0 ? 'High (blockers must be resolved first)'
    : score.highCount > 3 ? 'Medium–High (multiple significant findings)'
    : score.highCount > 0 ? 'Medium'
    : 'Low'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MigrateReady — ${orgName} Assessment Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6;
           color: #1e293b; background: #fff; max-width: 960px; margin: 0 auto; padding: 40px 32px; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; }
    h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 32px 0 12px;
         padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    h3 { font-size: 15px; font-weight: 600; color: #334155; margin: 20px 0 8px; }
    h4 { font-size: 14px; font-weight: 600; }
    p { color: #475569; margin: 8px 0; }
    a { color: #2563eb; }
    code { font-family: ui-monospace, monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }

    .header { display: flex; justify-content: space-between; align-items: flex-start;
              padding-bottom: 20px; border-bottom: 3px solid #2563eb; margin-bottom: 28px; }
    .header-meta { text-align: right; color: #64748b; font-size: 13px; }
    .brand { font-weight: 800; font-size: 20px; color: #2563eb; letter-spacing: -0.5px; }

    .exec-grid { display: grid; grid-template-columns: 160px 1fr; gap: 24px; align-items: start;
                 background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
                 padding: 24px; margin: 12px 0 24px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
    .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;
            text-align: center; }
    .stat-val { font-size: 22px; font-weight: 700; }
    .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px;
             font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }

    .findings-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    .findings-table th { text-align: left; padding: 8px 10px; background: #f1f5f9;
                         font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
                         color: #64748b; border-bottom: 1px solid #e2e8f0; }
    .findings-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .findings-table tr:hover td { background: #f8fafc; }

    .wave-block { padding: 12px 16px; background: #f8fafc; border-radius: 8px;
                  margin: 8px 0; border-left: 4px solid #2563eb; }

    .meta-box { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; margin: 8px 0;
                background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; }
    .meta-box.warn { background: #fef2f2; border-color: #fecaca; }

    .section-tag { font-size: 11px; font-weight: 600; text-transform: uppercase;
                   letter-spacing: 0.6px; color: #94a3b8; margin-bottom: 4px; }

    .effort-badge { display: inline-block; background: #fef3c7; color: #92400e;
                    border: 1px solid #fde68a; padding: 4px 12px; border-radius: 20px;
                    font-size: 12px; font-weight: 600; margin: 4px 0; }

    footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0;
             font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }

    @media print {
      body { padding: 20px; font-size: 13px; }
      h2 { page-break-before: always; }
      h2:first-of-type { page-break-before: avoid; }
      .findings-table td, .findings-table th { padding: 5px 8px; }
      .no-print { display: none; }
      a { color: #2563eb; text-decoration: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand">MigrateReady</div>
      <h1>${orgName}</h1>
      <p style="margin-top:4px;color:#64748b;font-size:13px">AD → Entra ID Readiness Assessment</p>
    </div>
    <div class="header-meta">
      <div>Generated: ${date}</div>
      <div style="margin-top:4px">30 automated checks</div>
    </div>
  </div>

  <!-- ── Executive Summary ── -->
  <h2>Executive Summary</h2>
  <div class="exec-grid">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      ${scoreGaugeSvg(score.score, score.band)}
      ${score.cappedByBlocker ? '<span style="font-size:11px;color:#dc2626;font-weight:600">Score capped by blockers</span>' : ''}
    </div>
    <div>
      <div class="section-tag">Readiness Score</div>
      <p><strong>${orgName}</strong> scored <strong style="color:${BAND_COLOR[score.band]}">${score.score}/100 (${score.band})</strong>.</p>
      ${score.blockerCount > 0
        ? `<p style="color:#dc2626">⚠ ${score.blockerCount} blocker${score.blockerCount > 1 ? 's' : ''} must be resolved before migration can proceed.</p>`
        : '<p style="color:#16a34a">✓ No blockers. Migration can proceed with attention to high-severity findings.</p>'
      }
      <div class="stat-grid">
        <div class="stat"><div class="stat-val" style="color:#dc2626">${score.blockerCount}</div><div class="stat-lbl">Blockers</div></div>
        <div class="stat"><div class="stat-val" style="color:#ea580c">${score.highCount}</div><div class="stat-lbl">High</div></div>
        <div class="stat"><div class="stat-val" style="color:#d97706">${score.mediumCount}</div><div class="stat-lbl">Medium</div></div>
        <div class="stat"><div class="stat-val" style="color:#16a34a">${score.passedCount}</div><div class="stat-lbl">Passed</div></div>
      </div>
      <div style="margin-top:14px">
        <span class="section-tag">Estimated effort to resolve all findings: </span>
        <span class="effort-badge">${effortBand}</span>
      </div>
    </div>
  </div>

  <div class="meta-box ${score.blockerCount > 0 ? 'warn' : ''}">
    <span>👥 <strong>${normalised.users.length.toLocaleString()}</strong> users</span>
    <span>🖥 <strong>${normalised.computers.length.toLocaleString()}</strong> computers</span>
    <span>📁 <strong>${normalised.groups.length.toLocaleString()}</strong> groups</span>
    <span>📋 <strong>${normalised.gpos.length}</strong> GPOs</span>
    <span>✅ <strong>${score.passedCount}/${score.totalChecks}</strong> checks passed</span>
  </div>

  <!-- ── Findings ── -->
  <h2>Findings</h2>
  ${findingsTable(results)}

  <!-- ── Migration Wave Plan ── -->
  <h2>Migration Wave Plan</h2>
  <p>The following waves are recommended based on dependency risk. Wave 0 (Pilot) should complete before proceeding.</p>
  <div style="margin:16px 0">
    ${wavePlanSection(wavePlan)}
  </div>

  <!-- ── Prerequisites ── -->
  <h2>Migration Prerequisites</h2>
  <ol style="margin:12px 0 0 20px;color:#475569;line-height:2">
    <li>Resolve all <strong>blocker</strong>-severity findings before enabling Entra Connect sync</li>
    <li>Register and verify a routable UPN suffix in Entra ID (if non-routable UPNs found)</li>
    <li>Deploy Entra Connect or Cloud Sync in <em>staging mode</em> first</li>
    <li>Run Wave 0 pilot (IT/helpdesk staff) and validate sign-on experience</li>
    <li>Migrate privileged accounts last with PIM just-in-time activation configured</li>
    <li>Decommission on-premises AD only after all workloads validated cloud-joined</li>
  </ol>

  <!-- ── Check Catalogue ── -->
  <h2>Appendix — Full Check Catalogue</h2>
  ${checkCatalogueTable(results)}

  <footer>
    <span>MigrateReady · AD → Entra ID Assessment Toolkit</span>
    <span>Generated ${date} · ${score.totalChecks} checks</span>
  </footer>

</body>
</html>`
}
