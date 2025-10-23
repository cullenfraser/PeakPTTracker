import type { MovementResult } from './schema'

type Status = 'ok' | 'warn' | 'fail'

export type LoadReadinessLevel = 'ready_to_load' | 'load_with_oversight' | 'build_foundation'

export interface LoadReadinessInfo {
  level: LoadReadinessLevel
  label: string
  summary: string
  callout: string
}

export const SUPPORTED_PATTERNS: readonly MovementResult['pattern'][] = ['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core']

const SCORE_BY_STATUS: Record<Status, number> = {
  ok: 3,
  warn: 2,
  fail: 1,
}

const LEVEL_LABELS: Record<LoadReadinessLevel, string> = {
  ready_to_load: 'Ready to load',
  load_with_oversight: 'Load with oversight',
  build_foundation: 'Build foundation',
}

const LEVEL_BASE_SUMMARY: Record<LoadReadinessLevel, string> = {
  ready_to_load: 'Positions are organized and consistent. Progress loading per plan.',
  load_with_oversight: 'Keep loading but reinforce tempo, setup, and coaching cues each set.',
  build_foundation: 'Address foundational mechanics before increasing load intensity.',
}

const PATTERN_CALL_OUT: Record<MovementResult['pattern'], Record<LoadReadinessLevel, string>> = {
  squat: {
    ready_to_load: 'Progress squat loading 5–10% if RPE ≤7 while keeping depth and brace locked in.',
    load_with_oversight: 'Hold current squat load; use 3-1-1 tempo and focus on knee tracking cues.',
    build_foundation: 'Regress to tempo or goblet squats to rebuild depth and bracing strategy.',
  },
  hinge: {
    ready_to_load: 'Progress hinge loading with controlled descent and tight lats.',
    load_with_oversight: 'Keep hinge load steady; emphasize hip-back reach and rib cage bracing.',
    build_foundation: 'Use hip-wall taps or block pulls to restore hinge pattern before loading heavier.',
  },
  push: {
    ready_to_load: 'Progress pressing with long eccentrics and clean lockout mechanics.',
    load_with_oversight: 'Retain load; reinforce plank line and elbow path each rep.',
    build_foundation: 'Use tempo push-ups or dumbbell work to rebuild pressing positions.',
  },
  pull: {
    ready_to_load: 'Increase pulling load while keeping scaps sequenced and torso steady.',
    load_with_oversight: 'Stay at current load; cue scap set and reduce torso sway.',
    build_foundation: 'Return to chest-supported or single-arm rows to rebuild positioning.',
  },
  lunge: {
    ready_to_load: 'Progress split stance loading with maintained balance and pelvis stack.',
    load_with_oversight: 'Keep load level; slow tempo and coach knee track each stride.',
    build_foundation: 'Use split-squat isometrics and dowel support to rebuild the pattern.',
  },
  carry: {
    ready_to_load: 'Progress carry load while keeping posture tall and gait even.',
    load_with_oversight: 'Maintain load; cue rib cage stacking and slower steps.',
    build_foundation: 'Use lighter suitcase carries and posture drills before increasing load.',
  },
  core: {
    ready_to_load: 'Progress core tension with longer holds and anti-rotation work.',
    load_with_oversight: 'Hold the current drill load; cue breathing cadence and rib position.',
    build_foundation: 'Return to short-duration holds and positional breathwork to rebuild brace.',
  },
}

const formatList = (items: string[]): string => {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export const normalizePattern = (
  value: string | undefined,
  fallback: MovementResult['pattern'] = 'squat'
): MovementResult['pattern'] => {
  const key = (value ?? '').toLowerCase()
  return SUPPORTED_PATTERNS.includes(key as MovementResult['pattern'])
    ? (key as MovementResult['pattern'])
    : fallback
}

export const deriveLoadReadiness = (
  pattern: MovementResult['pattern'],
  kpis: Array<{ name: string; status: Status }>,
): LoadReadinessInfo => {
  const failNames = kpis.filter((k) => k.status === 'fail').map((k) => k.name)
  const warnNames = kpis.filter((k) => k.status === 'warn').map((k) => k.name)
  const scores = kpis.map((k) => SCORE_BY_STATUS[k.status])
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3

  let level: LoadReadinessLevel
  if (failNames.length > 0 || avgScore < 2.0) {
    level = 'build_foundation'
  } else if (warnNames.length >= 2 || avgScore < 2.5) {
    level = 'load_with_oversight'
  } else {
    level = 'ready_to_load'
  }

  let summary = LEVEL_BASE_SUMMARY[level]
  if (failNames.length > 0) {
    summary += ` Key rebuild areas: ${formatList(failNames)}.`
  } else if (warnNames.length > 0) {
    summary += ` Keep eyes on ${formatList(warnNames)}.`
  }

  const callout = PATTERN_CALL_OUT[pattern]?.[level] ?? LEVEL_BASE_SUMMARY[level]

  return {
    level,
    label: LEVEL_LABELS[level],
    summary,
    callout,
  }
}
