import { describe, it, expect } from 'vitest'
import { computeReadinessScore } from './scoring'
import type { CheckResult } from './types'

const makeCheck = (overrides: Partial<CheckResult>): CheckResult => ({
  id: 'test-check',
  category: 'identity-hygiene',
  title: 'Test Check',
  severity: 'low',
  affectedCount: 0,
  sampleObjects: [],
  remediation: 'Fix it',
  effortEstimate: 'hours',
  docsUrl: 'https://learn.microsoft.com',
  passed: true,
  ...overrides,
})

describe('computeReadinessScore', () => {
  it('returns 100 when all checks pass', () => {
    const results = [
      makeCheck({ id: 'a', passed: true }),
      makeCheck({ id: 'b', passed: true }),
    ]
    const score = computeReadinessScore(results)
    expect(score.score).toBe(100)
    expect(score.band).toBe('excellent')
    expect(score.cappedByBlocker).toBe(false)
  })

  it('caps score at 49 when there is a blocker', () => {
    const results = [
      makeCheck({ id: 'a', passed: false, severity: 'blocker' }),
    ]
    const score = computeReadinessScore(results)
    expect(score.score).toBeLessThanOrEqual(49)
    expect(score.cappedByBlocker).toBe(true)
    expect(score.blockerCount).toBe(1)
  })

  it('cap still applies even when raw score would be higher', () => {
    // Only one blocker, score would be 100-25=75 without cap
    const results = [
      makeCheck({ id: 'a', passed: false, severity: 'blocker' }),
      makeCheck({ id: 'b', passed: true }),
      makeCheck({ id: 'c', passed: true }),
    ]
    const score = computeReadinessScore(results)
    expect(score.score).toBe(49)
  })

  it('does not cap when only high severity fails', () => {
    const results = [
      makeCheck({ id: 'a', passed: false, severity: 'high' }),
    ]
    const score = computeReadinessScore(results)
    expect(score.score).toBe(90)
    expect(score.cappedByBlocker).toBe(false)
  })

  it('score floor is 0', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeCheck({ id: `b${i}`, passed: false, severity: 'blocker' })
    )
    const score = computeReadinessScore(results)
    expect(score.score).toBeGreaterThanOrEqual(0)
  })

  it('counts severities correctly', () => {
    const results = [
      makeCheck({ id: 'a', passed: false, severity: 'blocker' }),
      makeCheck({ id: 'b', passed: false, severity: 'high' }),
      makeCheck({ id: 'c', passed: false, severity: 'medium' }),
      makeCheck({ id: 'd', passed: false, severity: 'low' }),
      makeCheck({ id: 'e', passed: true }),
    ]
    const score = computeReadinessScore(results)
    expect(score.blockerCount).toBe(1)
    expect(score.highCount).toBe(1)
    expect(score.mediumCount).toBe(1)
    expect(score.lowCount).toBe(1)
    expect(score.passedCount).toBe(1)
    expect(score.totalChecks).toBe(5)
  })

  it('returns correct band labels', () => {
    const cases: [number, ReturnType<typeof computeReadinessScore>['band']][] = [
      [90, 'excellent'],
      [75, 'good'],
      [60, 'fair'],
      [40, 'poor'],
      [10, 'critical'],
    ]
    for (const [expectedScore, expectedBand] of cases) {
      // Build a result set that yields approximately the right score
      const passed = Array.from({ length: expectedScore }, (_, i) =>
        makeCheck({ id: `p${i}`, passed: true, severity: 'low' })
      )
      const failed = Array.from({ length: 100 - expectedScore }, (_, i) =>
        makeCheck({ id: `f${i}`, passed: false, severity: 'low' })
      )
      const score = computeReadinessScore([...passed, ...failed])
      expect(score.band).toBe(expectedBand)
    }
  })

  it('handles empty results', () => {
    const score = computeReadinessScore([])
    expect(score.score).toBe(100)
    expect(score.totalChecks).toBe(0)
  })
})
