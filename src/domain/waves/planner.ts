import type { NormalisedExport } from '../parser/normalised-types'
import type { WaveConfig, WaveMember, Wave, WavePlan, RiskFlag } from './types'
import { DEFAULT_WAVE_CONFIG } from './types'

function scoreUser(user: NormalisedExport['users'][number]): { score: number; flags: RiskFlag[] } {
  const flags: RiskFlag[] = []
  let score = 0

  if (user.isPrivileged) { flags.push('privileged'); score += 50 }
  if (user.isServiceAccount) { flags.push('service-account'); score += 40 }
  if (user.servicePrincipalNames.length > 0) { flags.push('spn-linked'); score += 20 }
  if (user.isStale) { flags.push('stale'); score += 15 }
  if (user.hasNonRoutableUPN) { flags.push('non-routable-upn'); score += 10 }

  return { score, flags }
}

function isItDepartment(dept: string | null, keywords: string[]): boolean {
  if (!dept) return false
  const lower = dept.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export function planWaves(
  normalised: NormalisedExport,
  overrides: Partial<WaveConfig> = {}
): WavePlan {
  const config: WaveConfig = { ...DEFAULT_WAVE_CONFIG, ...overrides }

  // Only plan enabled users
  const users = normalised.users.filter(u => u.enabled)

  // Score every user
  const scored = users.map(u => {
    const { score, flags } = scoreUser(u)
    const isIt = isItDepartment(u.department, config.pilotDepartmentKeywords)
    if (isIt) flags.push('it-department')
    return {
      user: u,
      score: isIt ? Math.max(0, score - 20) : score,
      flags,
    }
  })

  // Separate into three buckets — stable sort (Array.sort is stable in V8)
  const finalBucket = scored.filter(s => s.flags.includes('privileged') || s.flags.includes('service-account'))
  const remaining = scored.filter(s => !s.flags.includes('privileged') && !s.flags.includes('service-account'))

  // Pilot: IT-department users with score < 20, capped at pilotMaxSize
  const pilotCandidates = remaining
    .filter(s => s.flags.includes('it-department') && s.score < 20)
    .sort((a, b) => a.score - b.score)
    .slice(0, config.pilotMaxSize)

  const pilotSAMs = new Set(pilotCandidates.map(s => s.user.sAMAccountName))
  const bulk = remaining.filter(s => !pilotSAMs.has(s.user.sAMAccountName))

  // Group bulk by department, sort by risk score within each group
  const byDept = new Map<string, typeof bulk>()
  for (const s of bulk) {
    const key = s.user.department ?? '(No Department)'
    if (!byDept.has(key)) byDept.set(key, [])
    byDept.get(key)!.push(s)
  }

  // Sort departments alphabetically for determinism, then sort users within each dept by score
  const sortedDepts = [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b))

  // Flatten and chunk into waves
  const allBulk: typeof bulk = []
  for (const [, members] of sortedDepts) {
    members.sort((a, b) => a.score - b.score)
    allBulk.push(...members)
  }
  const bulkChunks = chunkArray(allBulk, config.maxWaveSize)

  const toMember = (s: typeof scored[number], waveNum: number): WaveMember => ({
    sAMAccountName: s.user.sAMAccountName,
    displayName: s.user.displayName,
    department: s.user.department,
    upn: s.user.userPrincipalName,
    enabled: s.user.enabled,
    riskScore: s.score,
    riskFlags: s.flags,
    wave: waveNum,
  })

  const waves: Wave[] = []

  // Wave 0 — Pilot
  if (pilotCandidates.length > 0) {
    waves.push({
      waveNumber: 0,
      name: 'Wave 0 — Pilot',
      members: pilotCandidates.map(s => toMember(s, 0)),
      criteria: ['IT / helpdesk staff', 'Risk score < 20', `Max ${config.pilotMaxSize} users`],
    })
  }

  // Waves 1..N — Bulk
  bulkChunks.forEach((chunk, idx) => {
    const waveNum = idx + 1
    const depts = [...new Set(chunk.map(s => s.user.department ?? '(No Department)'))]
    waves.push({
      waveNumber: waveNum,
      name: `Wave ${waveNum}`,
      members: chunk.map(s => toMember(s, waveNum)),
      criteria: depts.slice(0, 3).concat(depts.length > 3 ? [`+${depts.length - 3} more`] : []),
    })
  })

  // Final wave — Privileged + Service accounts
  if (finalBucket.length > 0) {
    const finalNum = waves.length === 0 ? 1 : waves[waves.length - 1].waveNumber + 1
    finalBucket.sort((a, b) => b.score - a.score) // highest risk last (manual touch required)
    waves.push({
      waveNumber: finalNum,
      name: `Wave ${finalNum} — Privileged & Service Accounts`,
      members: finalBucket.map(s => toMember(s, finalNum)),
      criteria: ['Domain Admins', 'Service accounts (SPNs)', 'Requires manual cutover'],
    })
  }

  return { waves, totalUsers: users.length, config }
}

export function reassignMember(
  plan: WavePlan,
  sAMAccountName: string,
  targetWaveNumber: number
): WavePlan {
  const allMembers = plan.waves.flatMap(w => w.members)
  const member = allMembers.find(m => m.sAMAccountName === sAMAccountName)
  if (!member) return plan

  const updated = { ...member, wave: targetWaveNumber }

  return {
    ...plan,
    waves: plan.waves.map(w => {
      const withoutMoved = w.members.filter(m => m.sAMAccountName !== sAMAccountName)
      if (w.waveNumber === targetWaveNumber) {
        return { ...w, members: [...withoutMoved, updated] }
      }
      return { ...w, members: withoutMoved }
    }).filter(w => w.members.length > 0 || w.waveNumber === targetWaveNumber),
  }
}
