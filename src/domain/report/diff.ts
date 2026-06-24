import type { CheckResult } from '../checks/types'

export type DeltaStatus = 'resolved' | 'improved' | 'worsened' | 'new' | 'unchanged' | 'regressed'

export interface FindingDelta {
  id: string
  title: string
  severity: CheckResult['severity']
  category: CheckResult['category']
  baselineCount: number | null
  currentCount: number | null
  baselinePassed: boolean | null
  currentPassed: boolean | null
  delta: number | null
  status: DeltaStatus
  docsUrl: string
}

export interface DiffReport {
  deltas: FindingDelta[]
  resolved: number
  improved: number
  worsened: number
  regressed: number
  unchanged: number
  newChecks: number
}

export function computeDiff(
  baseline: CheckResult[],
  current: CheckResult[]
): DiffReport {
  const baselineMap = new Map(baseline.map(r => [r.id, r]))
  const currentMap = new Map(current.map(r => [r.id, r]))

  const allIds = new Set([...baselineMap.keys(), ...currentMap.keys()])
  const deltas: FindingDelta[] = []

  for (const id of allIds) {
    const b = baselineMap.get(id) ?? null
    const c = currentMap.get(id) ?? null

    const bCount = b ? b.affectedCount : null
    const cCount = c ? c.affectedCount : null
    const bPassed = b ? b.passed : null
    const cPassed = c ? c.passed : null

    let status: DeltaStatus
    if (!b) {
      status = 'new'
    } else if (!c) {
      // check was in baseline but not current — treat as resolved
      status = 'resolved'
    } else if (b.passed && !c.passed) {
      status = 'regressed'
    } else if (!b.passed && c.passed) {
      status = 'resolved'
    } else if (bCount !== null && cCount !== null) {
      const delta = cCount - bCount
      if (delta < 0) status = 'improved'
      else if (delta > 0) status = 'worsened'
      else status = 'unchanged'
    } else {
      status = 'unchanged'
    }

    const delta = bCount !== null && cCount !== null ? cCount - bCount : null
    const result = c ?? b!

    deltas.push({
      id,
      title: result.title,
      severity: result.severity,
      category: result.category,
      baselineCount: bCount,
      currentCount: cCount,
      baselinePassed: bPassed,
      currentPassed: cPassed,
      delta,
      status,
      docsUrl: result.docsUrl,
    })
  }

  // Sort: regressed first, then worsened, new, unchanged, improved, resolved
  const order: Record<DeltaStatus, number> = {
    regressed: 0, worsened: 1, new: 2, unchanged: 3, improved: 4, resolved: 5,
  }
  deltas.sort((a, b) => {
    const sevOrder = { blocker: 0, high: 1, medium: 2, low: 3 }
    const orderDiff = order[a.status] - order[b.status]
    if (orderDiff !== 0) return orderDiff
    return sevOrder[a.severity] - sevOrder[b.severity]
  })

  return {
    deltas,
    resolved: deltas.filter(d => d.status === 'resolved').length,
    improved: deltas.filter(d => d.status === 'improved').length,
    worsened: deltas.filter(d => d.status === 'worsened').length,
    regressed: deltas.filter(d => d.status === 'regressed').length,
    unchanged: deltas.filter(d => d.status === 'unchanged').length,
    newChecks: deltas.filter(d => d.status === 'new').length,
  }
}
