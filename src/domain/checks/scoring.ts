import type { CheckResult, CheckSeverity } from './types'

const SEVERITY_WEIGHTS: Record<CheckSeverity, number> = {
  blocker: 25,
  high: 10,
  medium: 4,
  low: 1,
}

const BLOCKER_SCORE_CAP = 49

export interface ReadinessScore {
  score: number
  blockerCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  passedCount: number
  totalChecks: number
  cappedByBlocker: boolean
  band: 'critical' | 'poor' | 'fair' | 'good' | 'excellent'
}

export function computeReadinessScore(results: CheckResult[]): ReadinessScore {
  const failed = results.filter((r) => !r.passed)
  const blockers = failed.filter((r) => r.severity === 'blocker')

  const deduction = failed.reduce((sum, r) => sum + SEVERITY_WEIGHTS[r.severity], 0)
  const rawScore = Math.max(0, 100 - deduction)
  const cappedByBlocker = blockers.length > 0
  const score = cappedByBlocker ? Math.min(rawScore, BLOCKER_SCORE_CAP) : rawScore

  return {
    score,
    blockerCount: blockers.length,
    highCount: failed.filter((r) => r.severity === 'high').length,
    mediumCount: failed.filter((r) => r.severity === 'medium').length,
    lowCount: failed.filter((r) => r.severity === 'low').length,
    passedCount: results.filter((r) => r.passed).length,
    totalChecks: results.length,
    cappedByBlocker,
    band: scoreBand(score),
  }
}

function scoreBand(score: number): ReadinessScore['band'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  if (score >= 30) return 'poor'
  return 'critical'
}
