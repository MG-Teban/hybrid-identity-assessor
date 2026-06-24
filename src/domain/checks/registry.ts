import type { CheckRunner, CheckResult, CheckInput } from './types'
import { hygieneChecks } from './categories/1-hygiene'
import { syncChecks } from './categories/2-sync'
import { authChecks } from './categories/3-auth'
import { privilegedChecks } from './categories/4-privileged'
import { groupChecks } from './categories/5-groups'
import { deviceGpoChecks } from './categories/6-device-gpo'

export const ALL_CHECKS: CheckRunner[] = [
  ...hygieneChecks,
  ...syncChecks,
  ...authChecks,
  ...privilegedChecks,
  ...groupChecks,
  ...deviceGpoChecks,
]

export function runAllChecks(input: CheckInput): CheckResult[] {
  return ALL_CHECKS.map(check => check(input))
}

export function runChecks(runners: CheckRunner[], input: CheckInput): CheckResult[] {
  return runners.map(check => check(input))
}
