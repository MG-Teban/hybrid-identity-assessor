'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseADExport } from '@/domain/parser'
import { normalise } from '@/domain/parser/normaliser'
import { runAllChecks } from '@/domain/checks/registry'
import { computeReadinessScore } from '@/domain/checks/scoring'
import { planWaves, reassignMember } from '@/domain/waves/planner'
import { generateHTMLReport } from '@/domain/report/html-report'
import { generateMarkdownReport } from '@/domain/report/md-report'
import { computeDiff } from '@/domain/report/diff'
import type { CheckResult } from '@/domain/checks/types'
import type { ReadinessScore } from '@/domain/checks/scoring'
import type { WavePlan, WaveMember } from '@/domain/waves/types'
import type { NormalisedExport } from '@/domain/parser/normalised-types'
import type { DiffReport } from '@/domain/report/diff'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessmentState {
  normalised: NormalisedExport
  results: CheckResult[]
  score: ReadinessScore
  wavePlan: WavePlan
  orgName: string
}

type Tab = 'upload' | 'findings' | 'waves' | 'compare'

// ─── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: ReadinessScore }) {
  const pct = score.score
  const circumference = 2 * Math.PI * 54
  const offset = circumference * (1 - pct / 100)
  const color =
    score.band === 'excellent' ? '#16a34a'
    : score.band === 'good' ? '#2563eb'
    : score.band === 'fair' ? '#d97706'
    : '#dc2626'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="54" fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70" cy="70" r="54" fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="70" y="65" textAnchor="middle" className="font-bold" fontSize="28" fill={color} fontWeight="700">{pct}</text>
        <text x="70" y="83" textAnchor="middle" fontSize="12" fill="#94a3b8">{score.band}</text>
      </svg>
      <div className="flex gap-4 text-xs text-center">
        <span className="text-red-600 font-semibold">{score.blockerCount} blockers</span>
        <span className="text-orange-500">{score.highCount} high</span>
        <span className="text-yellow-600">{score.mediumCount} medium</span>
        <span className="text-slate-500">{score.lowCount} low</span>
      </div>
    </div>
  )
}

// ─── Upload Tab ───────────────────────────────────────────────────────────────

function UploadTab({ onAssess }: { onAssess: (state: AssessmentState) => void }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processJson(json: string, orgName: string) {
    setLoading(true)
    setError(null)
    try {
      const raw = JSON.parse(json)
      const parsed = parseADExport(raw)
      if (!parsed.success) {
        setError(`Parse error: ${JSON.stringify(parsed.errors).slice(0, 200)}`)
        setLoading(false)
        return
      }
      const normalised = normalise(parsed.data)
      const results = runAllChecks({ normalised })
      const score = computeReadinessScore(results)
      const wavePlan = planWaves(normalised)
      onAssess({ normalised, results, score, wavePlan, orgName })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON file')
    }
    setLoading(false)
  }

  async function handleFile(file: File) {
    const text = await file.text()
    await processJson(text, file.name.replace('.json', ''))
  }

  async function loadDemo() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/demo/minertech-export.json')
      if (!res.ok) throw new Error('Demo data not found')
      const json = await res.text()
      await processJson(json, 'MinerTech Australia')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load demo')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">Upload AD Export</h2>
        <p className="text-slate-500 text-sm">JSON file produced by <code className="bg-slate-100 px-1 rounded text-xs font-mono">Get-ADAssessmentData.ps1</code></p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
        }`}
      >
        <div className="text-4xl">📁</div>
        <p className="text-slate-700 font-medium">Drop your ad-export.json here</p>
        <p className="text-slate-400 text-sm">or click to browse</p>
        <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-slate-400 text-xs font-medium">or try a demo</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <button
        onClick={loadDemo}
        disabled={loading}
        className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
      >
        {loading ? 'Analysing…' : 'Load MinerTech Australia (1,500 users)'}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}

// ─── Findings Tab ─────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { blocker: 0, high: 1, medium: 2, low: 3 } as const
const SEVERITY_COLORS = {
  blocker: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function FindingsTab({ state }: { state: AssessmentState }) {
  const [catFilter, setCatFilter] = useState('all')
  const [sevFilter, setSevFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showPassed, setShowPassed] = useState(false)

  function exportHtml() {
    const html = generateHTMLReport({
      orgName: state.orgName,
      score: state.score,
      results: state.results,
      wavePlan: state.wavePlan,
      normalised: state.normalised,
    })
    downloadBlob(html, `migrateready-${state.orgName.toLowerCase().replace(/\s+/g, '-')}.html`, 'text/html')
  }

  function exportMd() {
    const md = generateMarkdownReport({
      orgName: state.orgName,
      score: state.score,
      results: state.results,
      wavePlan: state.wavePlan,
      normalised: state.normalised,
    })
    downloadBlob(md, `migrateready-${state.orgName.toLowerCase().replace(/\s+/g, '-')}.md`, 'text/markdown')
  }

  const categories = [...new Set(state.results.map(r => r.category))]
  const filtered = state.results
    .filter(r => catFilter === 'all' || r.category === catFilter)
    .filter(r => sevFilter === 'all' || r.severity === sevFilter)
    .filter(r => showPassed || !r.passed)
    .sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    })

  return (
    <div className="space-y-5 py-4">
      {/* Score + summary row */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center gap-2 min-w-[200px]">
          <ScoreGauge score={state.score} />
          {state.score.cappedByBlocker && (
            <span className="text-xs text-red-600 font-medium">Score capped by blockers</span>
          )}
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Assessment Summary</h3>
          <p className="text-slate-800"><strong>{state.orgName}</strong></p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs">Total users</div>
              <div className="font-bold text-lg">{state.normalised.users.length.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs">Groups</div>
              <div className="font-bold text-lg">{state.normalised.groups.length.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs">Computers</div>
              <div className="font-bold text-lg">{state.normalised.computers.length.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-500 text-xs">Checks passed</div>
              <div className="font-bold text-lg">{state.score.passedCount}/{state.score.totalChecks}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={sevFilter}
          onChange={e => setSevFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700"
        >
          <option value="all">All severities</option>
          {['blocker', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 ml-2 cursor-pointer">
          <input type="checkbox" checked={showPassed} onChange={e => setShowPassed(e.target.checked)} className="rounded" />
          Show passed
        </label>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button onClick={exportHtml} className="text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors">
            Export HTML
          </button>
          <button onClick={exportMd} className="text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors">
            Export MD
          </button>
        </div>
      </div>

      {/* Findings list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">No findings match the current filters.</div>
        )}
        {filtered.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
            >
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[r.severity]}`}>
                {r.severity}
              </span>
              <span className={`flex-1 text-sm font-medium ${r.passed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {r.title}
              </span>
              {!r.passed && r.affectedCount > 0 && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {r.affectedCount.toLocaleString()} affected
                </span>
              )}
              {r.passed && <span className="text-xs text-green-600 font-medium">✓ passed</span>}
              <span className="text-slate-400 text-xs ml-1">{expanded === r.id ? '▲' : '▼'}</span>
            </button>

            {expanded === r.id && (
              <div className="border-t border-slate-100 px-5 py-4 space-y-4 text-sm">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Remediation</span>
                  <p className="mt-1 text-slate-600 leading-relaxed">{r.remediation}</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-slate-500">Effort: <strong>{r.effortEstimate}</strong></span>
                  <a href={r.docsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Microsoft Docs →
                  </a>
                </div>
                {r.sampleObjects.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sample objects</span>
                    <div className="mt-2 space-y-1.5">
                      {r.sampleObjects.map(obj => (
                        <div key={obj.id} className="bg-slate-50 rounded-lg px-3 py-2 font-mono text-xs text-slate-700 flex flex-wrap gap-x-4">
                          <span className="font-semibold">{obj.label}</span>
                          {Object.entries(obj.details ?? {}).map(([k, v]) => (
                            <span key={k} className="text-slate-500">{k}: <span className="text-slate-700">{String(v)}</span></span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Wave Board Tab ───────────────────────────────────────────────────────────

const RISK_BADGE: Record<string, string> = {
  privileged: 'bg-red-100 text-red-700',
  'service-account': 'bg-orange-100 text-orange-700',
  'spn-linked': 'bg-amber-100 text-amber-700',
  stale: 'bg-yellow-100 text-yellow-700',
  'non-routable-upn': 'bg-purple-100 text-purple-700',
  'it-department': 'bg-blue-100 text-blue-700',
}

function WaveMemberCard({
  member,
  onDragStart,
}: {
  member: WaveMember
  onDragStart: (e: React.DragEvent, sam: string) => void
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, member.sAMAccountName)}
      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="font-semibold text-slate-700 truncate">{member.displayName}</div>
      <div className="text-slate-400 truncate">{member.department ?? '—'}</div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {member.riskFlags.map(f => (
          <span key={f} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${RISK_BADGE[f] ?? 'bg-slate-100 text-slate-500'}`}>
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}

function WaveBoard({ state }: { state: AssessmentState }) {
  const [plan, setPlan] = useState<WavePlan>(state.wavePlan)
  const [dragSam, setDragSam] = useState<string | null>(null)
  const [overWave, setOverWave] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [expandedWave, setExpandedWave] = useState<Set<number>>(
    new Set(state.wavePlan.waves.map(w => w.waveNumber))
  )

  function handleDragStart(e: React.DragEvent, sam: string) {
    setDragSam(sam)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent, targetWave: number) {
    e.preventDefault()
    if (!dragSam) return
    setPlan(p => reassignMember(p, dragSam, targetWave))
    setDragSam(null)
    setOverWave(null)
  }

  function toggleWave(n: number) {
    setExpandedWave(prev => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }

  const searchLower = search.toLowerCase()

  function exportCsv() {
    const rows = [['wave', 'displayName', 'sAMAccountName', 'department', 'upn', 'riskScore', 'riskFlags']]
    for (const wave of plan.waves) {
      for (const m of wave.members) {
        rows.push([String(wave.waveNumber), m.displayName, m.sAMAccountName, m.department ?? '', m.upn, String(m.riskScore), m.riskFlags.join('|')])
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'migration-waves.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="search"
            placeholder="Filter users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={exportCsv}
          className="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
        >
          Export CSV
        </button>
      </div>

      <p className="text-xs text-slate-400">Drag user cards between waves to reassign. Changes are local only.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plan.waves.map(wave => {
          const members = search
            ? wave.members.filter(m =>
                m.displayName.toLowerCase().includes(searchLower) ||
                m.sAMAccountName.toLowerCase().includes(searchLower) ||
                (m.department ?? '').toLowerCase().includes(searchLower)
              )
            : wave.members
          const isOver = overWave === wave.waveNumber
          const isExpanded = expandedWave.has(wave.waveNumber)
          const waveColor =
            wave.waveNumber === 0 ? 'border-blue-300 bg-blue-50'
            : wave.name.includes('Privileged') ? 'border-red-300 bg-red-50'
            : 'border-slate-200 bg-slate-50'

          return (
            <div
              key={wave.waveNumber}
              onDragOver={e => { e.preventDefault(); setOverWave(wave.waveNumber) }}
              onDragLeave={() => setOverWave(null)}
              onDrop={e => handleDrop(e, wave.waveNumber)}
              className={`rounded-xl border-2 transition-colors ${waveColor} ${isOver ? 'border-blue-500 ring-2 ring-blue-200' : ''}`}
            >
              <button
                onClick={() => toggleWave(wave.waveNumber)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="text-left">
                  <div className="font-semibold text-slate-800 text-sm">{wave.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{wave.members.length} users · {wave.criteria.join(', ')}</div>
                </div>
                <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-1.5 max-h-72 overflow-y-auto">
                  {members.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">No users match the filter</div>
                  )}
                  {members.map(m => (
                    <WaveMemberCard key={m.sAMAccountName} member={m} onDragStart={handleDragStart} />
                  ))}
                  {!search && members.length === 5 && wave.members.length > 5 && (
                    <p className="text-center text-xs text-slate-400 pt-1">Showing all {wave.members.length} users</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Compare Tab ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  resolved:  'bg-green-50 text-green-700 border-green-200',
  improved:  'bg-blue-50 text-blue-600 border-blue-200',
  worsened:  'bg-orange-50 text-orange-700 border-orange-200',
  regressed: 'bg-red-50 text-red-700 border-red-200',
  new:       'bg-purple-50 text-purple-700 border-purple-200',
  unchanged: 'bg-slate-50 text-slate-500 border-slate-200',
}

const STATUS_ICON: Record<string, string> = {
  resolved: '✅', improved: '↓', worsened: '↑', regressed: '🔴', new: '★', unchanged: '=',
}

function CompareTab({ baseline }: { baseline: AssessmentState }) {
  const [current, setCurrent] = useState<AssessmentState | null>(null)
  const [diff, setDiff] = useState<DiffReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setLoading(true); setError(null)
    try {
      const json = await file.text()
      const raw = JSON.parse(json)
      const parsed = parseADExport(raw)
      if (!parsed.success) { setError('Parse failed'); setLoading(false); return }
      const normalised = normalise(parsed.data)
      const results = runAllChecks({ normalised })
      const score = computeReadinessScore(results)
      const wavePlan = planWaves(normalised)
      const newState: AssessmentState = { normalised, results, score, wavePlan, orgName: file.name.replace('.json','') }
      setCurrent(newState)
      setDiff(computeDiff(baseline.results, results))
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid file') }
    setLoading(false)
  }

  if (!current || !diff) {
    return (
      <div className="max-w-xl mx-auto py-10 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-slate-800">Compare with another export</h2>
          <p className="text-slate-500 text-sm">Load a second AD export to see what changed — which findings improved, worsened, or resolved.</p>
        </div>
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="text-3xl">📂</div>
          <p className="text-slate-700 font-medium">Drop second export here</p>
          <p className="text-slate-400 text-sm">Current baseline: <strong>{baseline.orgName}</strong> (score {baseline.score.score})</p>
          <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
        {loading && <p className="text-center text-slate-500 text-sm">Analysing…</p>}
        {error && <p className="text-center text-red-600 text-sm">{error}</p>}
      </div>
    )
  }

  const scoreDelta = current.score.score - baseline.score.score
  const scoreDeltaColor = scoreDelta > 0 ? 'text-green-600' : scoreDelta < 0 ? 'text-red-600' : 'text-slate-500'

  return (
    <div className="space-y-5 py-4">
      {/* Score comparison bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row gap-6 items-center">
        <div className="flex-1 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Baseline — {baseline.orgName}</div>
          <div className="text-4xl font-bold text-slate-700">{baseline.score.score}</div>
          <div className="text-sm text-slate-400">{baseline.score.band}</div>
        </div>
        <div className="text-center px-6">
          <div className={`text-3xl font-bold ${scoreDeltaColor}`}>{scoreDelta > 0 ? '+' : ''}{scoreDelta}</div>
          <div className="text-xs text-slate-400 mt-1">score change</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Current — {current.orgName}</div>
          <div className="text-4xl font-bold text-slate-700">{current.score.score}</div>
          <div className="text-sm text-slate-400">{current.score.band}</div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Resolved', count: diff.resolved, cls: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Improved', count: diff.improved, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Worsened', count: diff.worsened, cls: 'bg-orange-50 text-orange-700 border-orange-200' },
          { label: 'Regressed', count: diff.regressed, cls: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Unchanged', count: diff.unchanged, cls: 'bg-slate-50 text-slate-500 border-slate-200' },
        ].map(({ label, count, cls }) => (
          <span key={label} className={`border px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
            {label}: {count}
          </span>
        ))}
      </div>

      {/* Delta rows */}
      <div className="space-y-2">
        {diff.deltas.map(d => (
          <div key={d.id} className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[d.status]}`}>
              {STATUS_ICON[d.status]} {d.status}
            </span>
            <span className="flex-1 text-sm text-slate-700">{d.title}</span>
            <span className="text-xs text-slate-400 font-mono">
              {d.baselineCount ?? '—'} → {d.currentCount ?? '—'}
              {d.delta !== null && d.delta !== 0 && (
                <span className={d.delta < 0 ? 'text-green-600' : 'text-red-600'}>
                  {' '}({d.delta > 0 ? '+' : ''}{d.delta})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => { setCurrent(null); setDiff(null) }}
        className="text-sm text-slate-400 hover:text-slate-600 underline"
      >
        Load a different export
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

import { Suspense } from 'react'

function AssessApp() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('upload')
  const [state, setState] = useState<AssessmentState | null>(null)

  useEffect(() => {
    if (searchParams.get('demo') === '1') {
      // Auto-trigger demo load after mount
      fetch('/demo/minertech-export.json')
        .then(r => r.text())
        .then(async json => {
          const raw = JSON.parse(json)
          const { parseADExport } = await import('@/domain/parser')
          const { normalise } = await import('@/domain/parser/normaliser')
          const { runAllChecks } = await import('@/domain/checks/registry')
          const { computeReadinessScore } = await import('@/domain/checks/scoring')
          const { planWaves } = await import('@/domain/waves/planner')
          const parsed = parseADExport(raw)
          if (!parsed.success) return
          const normalised = normalise(parsed.data)
          const results = runAllChecks({ normalised })
          const score = computeReadinessScore(results)
          const wavePlan = planWaves(normalised)
          setState({ normalised, results, score, wavePlan, orgName: 'MinerTech Australia' })
          setTab('findings')
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAssess(s: AssessmentState) {
    setState(s)
    setTab('findings')
  }

  const tabs: { key: Tab; label: string; disabled: boolean }[] = [
    { key: 'upload', label: '1. Upload', disabled: false },
    { key: 'findings', label: '2. Findings', disabled: !state },
    { key: 'waves', label: '3. Wave Plan', disabled: !state },
    { key: 'compare', label: '4. Compare', disabled: !state },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <a href="/" className="text-blue-600 font-bold text-lg tracking-tight hover:opacity-80">MigrateReady</a>
          {state && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600 text-sm font-medium">{state.orgName}</span>
              <span className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full border ${
                state.score.band === 'excellent' ? 'bg-green-50 text-green-700 border-green-200'
                : state.score.band === 'good' ? 'bg-blue-50 text-blue-700 border-blue-200'
                : state.score.band === 'fair' ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                Score: {state.score.score} · {state.score.band}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-0">
            {tabs.map(t => (
              <button
                key={t.key}
                disabled={t.disabled}
                onClick={() => setTab(t.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-700'
                    : t.disabled
                    ? 'border-transparent text-slate-300 cursor-not-allowed'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pb-12">
        {tab === 'upload' && <UploadTab onAssess={handleAssess} />}
        {tab === 'findings' && state && <FindingsTab state={state} />}
        {tab === 'waves' && state && <WaveBoard state={state} />}
        {tab === 'compare' && state && <CompareTab baseline={state} />}
      </main>
    </div>
  )
}

export default function AssessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-slate-400">Loading…</div>}>
      <AssessApp />
    </Suspense>
  )
}
