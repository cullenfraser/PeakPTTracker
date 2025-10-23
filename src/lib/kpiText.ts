export type KpiStatus = 'ok' | 'warn' | 'fail'

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const statusLabel = (status: KpiStatus) =>
  status === 'ok' ? 'on target' : status === 'warn' ? 'slightly off target' : 'needs attention'

const WHY: Record<string, (value: number, target: string) => string> = {
  depth: (v, t) => `Average depth at ${v}° versus goal ${t}. Stable depth indicates solid range control.`,
  knee_valgus_degrees: (v, t) => `Average knee valgus at ${v}°, compared with target ${t}. Monitor alignment to avoid collapse.`,
  knee_valgus: (v, t) => `Average knee valgus measured at ${v}° with target ${t}. Reinforce even foot pressure and knee tracking.`,
  tempo_seconds: (v, t) => `Average tempo recorded at ${v}s per rep against target ${t}. Maintain smooth pacing throughout.`,
  tempo: (v, t) => `Current tempo is ${v} relative to goal ${t}. Smooth tempo builds consistent power output.`,
  trunk_flex: (v, t) => `Torso flexion averages ${v}° against target ${t}. Neutral spine and braced trunk keep load distributed.`,
  trunk_flexion: (v, t) => `Trunk angle measures ${v}° compared to ${t}. Stay tall and brace to limit forward collapse.`,
  heel_contact_ratio: (v, t) => `Heel contact ratio measured at ${v} (${t} target). Consistent heel contact supports stability.`,
}

const CUES: Record<string, string[]> = {
  depth: ['Stay patient in the bottom position', 'Keep brace engaged through ascent'],
  knee_valgus_degrees: ['Press knees out over toes', 'Maintain even foot pressure'],
  knee_valgus: ['Screw feet into the floor to line knees over toes', 'Drive the floor apart as you stand'],
  tempo_seconds: ['Match eccentric and concentric rhythm', 'Keep breathing rhythm steady'],
  tempo: ['Count a smooth “3 down, 1 up” cadence', 'Stay tight through the change of direction'],
  trunk_flex: ['Brace ribs down before you move', 'Drive the crown of the head forward without collapsing'],
  trunk_flexion: ['Brace ribs down before you move', 'Drive the crown of the head forward without collapsing'],
  heel_contact_ratio: ['Drive through mid-foot and heel', 'Avoid rocking forward onto toes'],
}

const GENERIC_CUES: Record<KpiStatus, string[]> = {
  ok: ['Maintain current technique focus; stay long through the spine.', 'Keep tension through the full range just like this.'],
  warn: ['Lock in your setup before each rep to stay stacked.', 'Slow the tempo slightly to feel balance under the bar.'],
  fail: ['Reset stance and brace, then groove reps with tempo work.', 'Break the pattern into pauses to rebuild position control.'],
}

export function buildWhy(name: string, value: number, target: string, status: KpiStatus) {
  const key = slugify(name)
  const make = WHY[key]
  return make ? make(value, target) : `Result is ${statusLabel(status)} relative to target ${target}. Recorded value ${value}.`
}

export function buildCues(name: string, status: KpiStatus) {
  const key = slugify(name)
  return CUES[key] ?? GENERIC_CUES[status]
}

export function statusFromScore(score: number): KpiStatus {
  if (score >= 3) return 'ok'
  if (score >= 2) return 'warn'
  return 'fail'
}

const BASIC_WHY: Record<string, string> = {
  depth: 'Depth achieved relative to target range; sufficient ROM maintained.',
  knee_valgus_degrees: 'Knee tracking over the foot; minimize inward collapse (valgus).',
  knee_valgus: 'Knee tracking over the foot; minimize inward collapse (valgus).',
  tempo_seconds: 'Eccentric and concentric pacing; smooth control across phases.',
  tempo: 'Eccentric and concentric pacing; smooth control across phases.',
  trunk_flex: 'Torso inclination and bracing; maintain a neutral, controlled spine.',
  trunk_flexion: 'Torso inclination and bracing; maintain a neutral, controlled spine.',
  heel_contact_ratio: 'Foot pressure management; maintain a stable tripod and heel contact.',
}

export function buildWhyFromScore(name: string, score: number) {
  const key = slugify(name)
  const base = BASIC_WHY[key] ?? 'Result evaluated against standard rubric for this KPI.'
  return `${base} Score ${score}/3.`
}

const POSITIVES: Record<string, { ok: string; warn: string; fail: string }> = {
  depth: {
    ok: 'You consistently hit target depth across reps with smooth control.',
    warn: 'Depth improved on several reps; control is trending the right way.',
    fail: 'Setup looks organized and you’re building range; keep practicing the pattern.'
  },
  knee_valgus_degrees: {
    ok: 'Knees tracked well over the mid-foot with even pressure.',
    warn: 'Foot pressure awareness is improving; stance tension is developing.',
    fail: 'You kept balance through most reps; continue focusing on foot connection.'
  },
  knee_valgus: {
    ok: 'Knees tracked well over the mid-foot with even pressure.',
    warn: 'Foot pressure awareness is improving; stance tension is developing.',
    fail: 'You kept balance through most reps; continue focusing on foot connection.'
  },
  tempo_seconds: {
    ok: 'Tempo was smooth and repeatable across the set.',
    warn: 'Pacing is close—your rhythm is developing well.',
    fail: 'Effort and cadence were steady; good foundation to build from.'
  },
  tempo: {
    ok: 'Tempo was smooth and repeatable across the set.',
    warn: 'Pacing is close—your rhythm is developing well.',
    fail: 'Effort and cadence were steady; good foundation to build from.'
  },
  trunk_flex: {
    ok: 'Brace and torso angle stayed organized under movement.',
    warn: 'Bracing improved during mid-reps; tension is building.',
    fail: 'Upper body stayed composed; keep bracing and tall posture work.'
  },
  trunk_flexion: {
    ok: 'Brace and torso angle stayed organized under movement.',
    warn: 'Bracing improved during mid-reps; tension is building.',
    fail: 'Upper body stayed composed; keep bracing and tall posture work.'
  },
  heel_contact_ratio: {
    ok: 'Foot tripod stayed grounded, giving you stable force transfer.',
    warn: 'You found the floor better as the set progressed.',
    fail: 'You maintained balance and contact through most of the set.'
  },
}

export function buildPositive(name: string, status: KpiStatus) {
  const key = slugify(name)
  const found = POSITIVES[key]
  if (found) return found[status]
  return status === 'ok'
    ? 'Solid execution—keep doing this.'
    : status === 'warn'
    ? 'Good direction—elements of the pattern are coming together.'
    : 'Composed effort—foundation is there; keep grooving the pattern.'
}
