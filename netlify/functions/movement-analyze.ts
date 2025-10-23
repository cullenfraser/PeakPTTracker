import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { analyzePatternWithFrames } from '../../server/services/screen/openaiScreenService'
import { MovementResultZ, type MovementResult } from '../../server/services/screen/schema'
import { deriveLoadReadiness, type LoadReadinessInfo } from '../../server/services/screen/loadReadiness'
import { openai } from '../../server/services/screen/openaiClient'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const normalizeStatus = (s: any): 'ok' | 'warn' | 'fail' => {
  const v = String(s || '').toLowerCase()
  if (v === 'ok' || v === 'pass') return 'ok'
  if (v === 'warn') return 'warn'
  return 'fail'
}

const coerceMovementResult = (raw: any, fallbackPattern: MovementResult['pattern']): any => {
  const supported = ['squat','hinge','push','pull','lunge','carry','core']
  const patt = String(raw?.pattern ?? fallbackPattern ?? 'squat').toLowerCase()
  const pattern = supported.includes(patt) ? patt : fallbackPattern
  const pass_fail = (raw?.pass_fail === 'pass' || raw?.pass_fail === 'fail') ? raw.pass_fail : 'pass'
  const detected_variation = typeof raw?.detected_variation === 'string' ? raw.detected_variation : undefined
  const kpis = Array.isArray(raw?.kpis) ? raw.kpis.slice(0, 4).map((k: any) => ({
    name: String(k?.name ?? ''),
    value: Number(k?.value ?? 0),
    target: String(k?.target ?? ''),
    status: normalizeStatus(k?.status),
  })) : []
  return { pattern, pass_fail, detected_variation, kpis }
}

const toMovementPattern = (p: string): MovementResult['pattern'] => {
  const s = (p || 'squat').toLowerCase()
  return (['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core'].includes(s) ? s : 'squat') as MovementResult['pattern']
}

const SAMPLE_VARIANTS: Record<MovementResult['pattern'], Array<MovementResult & { detected_variation?: string }>> = {
  squat: [
    {
      pattern: 'squat',
      pass_fail: 'pass',
      detected_variation: 'Back squat (high bar)',
      kpis: [
        { name: 'Depth', value: 92, target: '\u2265 90\u00b0', status: 'ok' },
        { name: 'Knee valgus', value: 6, target: '\u2264 5\u00b0', status: 'warn' },
        { name: 'Trunk flex', value: 28, target: '\u2264 30\u00b0', status: 'ok' },
        { name: 'Tempo', value: 3.0, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'squat',
      pass_fail: 'fail',
      detected_variation: 'Goblet squat',
      kpis: [
        { name: 'Depth', value: 78, target: '\u2265 90\u00b0', status: 'fail' },
        { name: 'Knee valgus', value: 9, target: '\u2264 5\u00b0', status: 'fail' },
        { name: 'Trunk flex', value: 35, target: '\u2264 30\u00b0', status: 'warn' },
        { name: 'Tempo', value: 2.4, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
    {
      pattern: 'squat',
      pass_fail: 'pass',
      detected_variation: 'Front squat',
      kpis: [
        { name: 'Depth', value: 95, target: '\u2265 90\u00b0', status: 'ok' },
        { name: 'Knee valgus', value: 4, target: '\u2264 5\u00b0', status: 'ok' },
        { name: 'Trunk flex', value: 32, target: '\u2264 30\u00b0', status: 'warn' },
        { name: 'Tempo', value: 2.0, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
  ],
  hinge: [
    {
      pattern: 'hinge',
      pass_fail: 'pass',
      detected_variation: 'Conventional deadlift',
      kpis: [
        { name: 'Hip hinge ratio', value: 1.05, target: '\u2264 1.1', status: 'ok' },
        { name: 'Lumbar control', value: 4, target: '\u2264 5\u00b0', status: 'ok' },
        { name: 'Bar path drift', value: 3.5, target: '\u2264 3cm', status: 'warn' },
        { name: 'Tempo', value: 2.8, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'hinge',
      pass_fail: 'fail',
      detected_variation: 'Trap-bar deadlift',
      kpis: [
        { name: 'Hip hinge ratio', value: 1.2, target: '\u2264 1.1', status: 'fail' },
        { name: 'Lumbar control', value: 8, target: '\u2264 5\u00b0', status: 'fail' },
        { name: 'Bar path drift', value: 5.5, target: '\u2264 3cm', status: 'fail' },
        { name: 'Tempo', value: 2.2, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
    {
      pattern: 'hinge',
      pass_fail: 'pass',
      detected_variation: 'Romanian deadlift',
      kpis: [
        { name: 'Hip hinge ratio', value: 1.08, target: '\u2264 1.1', status: 'warn' },
        { name: 'Lumbar control', value: 5.5, target: '\u2264 5\u00b0', status: 'warn' },
        { name: 'Bar path drift', value: 2.5, target: '\u2264 3cm', status: 'ok' },
        { name: 'Tempo', value: 3.1, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
  ],
  push: [
    {
      pattern: 'push',
      pass_fail: 'pass',
      kpis: [
        { name: 'Lockout depth', value: 100, target: 'Full lockout', status: 'ok' },
        { name: 'Elbow path', value: 18, target: '\u2264 15\u00b0 flare', status: 'warn' },
        { name: 'Tempo', value: 2.6, target: '\u2248 2\u20133s/rep', status: 'ok' },
        { name: 'Trunk line', value: 6, target: '\u2264 8\u00b0', status: 'ok' },
      ],
    },
    {
      pattern: 'push',
      pass_fail: 'fail',
      kpis: [
        { name: 'Lockout depth', value: 88, target: 'Full lockout', status: 'fail' },
        { name: 'Elbow path', value: 24, target: '\u2264 15\u00b0 flare', status: 'fail' },
        { name: 'Tempo', value: 1.8, target: '\u2248 2\u20133s/rep', status: 'warn' },
        { name: 'Trunk line', value: 12, target: '\u2264 8\u00b0', status: 'warn' },
      ],
    },
    {
      pattern: 'push',
      pass_fail: 'pass',
      kpis: [
        { name: 'Lockout depth', value: 97, target: 'Full lockout', status: 'ok' },
        { name: 'Elbow path', value: 15, target: '\u2264 15\u00b0 flare', status: 'ok' },
        { name: 'Tempo', value: 3.2, target: '\u2248 2\u20133s/rep', status: 'warn' },
        { name: 'Trunk line', value: 9, target: '\u2264 8\u00b0', status: 'warn' },
      ],
    },
  ],
  pull: [
    {
      pattern: 'pull',
      pass_fail: 'pass',
      detected_variation: 'Seated cable row (overhand)',
      kpis: [
        { name: 'Scap timing', value: 0.85, target: '\u2265 0.8', status: 'ok' },
        { name: 'Elbow path', value: 14, target: '\u2264 15\u00b0 drift', status: 'ok' },
        { name: 'Torso sway', value: 6, target: '\u2264 8\u00b0', status: 'ok' },
        { name: 'Tempo', value: 2.9, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'pull',
      pass_fail: 'fail',
      detected_variation: 'Bent-over row (barbell)',
      kpis: [
        { name: 'Scap timing', value: 0.6, target: '\u2265 0.8', status: 'fail' },
        { name: 'Elbow path', value: 22, target: '\u2264 15\u00b0 drift', status: 'fail' },
        { name: 'Torso sway', value: 12, target: '\u2264 8\u00b0', status: 'fail' },
        { name: 'Tempo', value: 2.1, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
    {
      pattern: 'pull',
      pass_fail: 'pass',
      detected_variation: 'Single-arm dumbbell row',
      kpis: [
        { name: 'Scap timing', value: 0.82, target: '\u2265 0.8', status: 'ok' },
        { name: 'Elbow path', value: 17, target: '\u2264 15\u00b0 drift', status: 'warn' },
        { name: 'Torso sway', value: 9, target: '\u2264 8\u00b0', status: 'warn' },
        { name: 'Tempo', value: 3.1, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
  ],
  lunge: [
    {
      pattern: 'lunge',
      pass_fail: 'pass',
      kpis: [
        { name: 'Front knee track', value: 4, target: '\u2264 5\u00b0 valgus', status: 'ok' },
        { name: 'Trail hip control', value: 6, target: '\u2264 8\u00b0 drift', status: 'ok' },
        { name: 'Pelvic stability', value: 7, target: '\u2264 8\u00b0 tilt', status: 'ok' },
        { name: 'Tempo', value: 2.7, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'lunge',
      pass_fail: 'fail',
      kpis: [
        { name: 'Front knee track', value: 9, target: '\u2264 5\u00b0 valgus', status: 'fail' },
        { name: 'Trail hip control', value: 11, target: '\u2264 8\u00b0 drift', status: 'fail' },
        { name: 'Pelvic stability', value: 13, target: '\u2264 8\u00b0 tilt', status: 'fail' },
        { name: 'Tempo', value: 2.0, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
    {
      pattern: 'lunge',
      pass_fail: 'pass',
      kpis: [
        { name: 'Front knee track', value: 5, target: '\u2264 5\u00b0 valgus', status: 'warn' },
        { name: 'Trail hip control', value: 8, target: '\u2264 8\u00b0 drift', status: 'warn' },
        { name: 'Pelvic stability', value: 9, target: '\u2264 8\u00b0 tilt', status: 'warn' },
        { name: 'Tempo', value: 3.3, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
  ],
  carry: [
    {
      pattern: 'carry',
      pass_fail: 'pass',
      kpis: [
        { name: 'Torso stack', value: 6, target: '\u2264 8\u00b0 tilt', status: 'ok' },
        { name: 'Grip integrity', value: 1, target: '\u2264 2\u00b0 slip', status: 'ok' },
        { name: 'Path sway', value: 4, target: '\u2264 5cm', status: 'warn' },
        { name: 'Tempo', value: 2.5, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'carry',
      pass_fail: 'fail',
      kpis: [
        { name: 'Torso stack', value: 14, target: '\u2264 8\u00b0 tilt', status: 'fail' },
        { name: 'Grip integrity', value: 5, target: '\u2264 2\u00b0 slip', status: 'fail' },
        { name: 'Path sway', value: 9, target: '\u2264 5cm', status: 'fail' },
        { name: 'Tempo', value: 1.9, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
  ],
  core: [
    {
      pattern: 'core',
      pass_fail: 'pass',
      detected_variation: 'Front plank',
      kpis: [
        { name: 'Plank alignment', value: 5, target: '\u2264 6\u00b0 drop', status: 'ok' },
        { name: 'Hip drift', value: 3, target: '\u2264 4cm', status: 'ok' },
        { name: 'Breathing cadence', value: 2.8, target: '\u2248 3s cycle', status: 'ok' },
        { name: 'Tempo', value: 2.9, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
    {
      pattern: 'core',
      pass_fail: 'fail',
      detected_variation: 'Side plank',
      kpis: [
        { name: 'Plank alignment', value: 12, target: '\u2264 6\u00b0 drop', status: 'fail' },
        { name: 'Hip drift', value: 8, target: '\u2264 4cm', status: 'fail' },
        { name: 'Breathing cadence', value: 2.0, target: '\u2248 3s cycle', status: 'warn' },
        { name: 'Tempo', value: 1.7, target: '\u2248 2\u20133s/rep', status: 'warn' },
      ],
    },
    {
      pattern: 'core',
      pass_fail: 'pass',
      detected_variation: 'Hollow body hold',
      kpis: [
        { name: 'Plank alignment', value: 7, target: '\u2264 6\u00b0 drop', status: 'warn' },
        { name: 'Hip drift', value: 4.5, target: '\u2264 4cm', status: 'warn' },
        { name: 'Breathing cadence', value: 2.3, target: '\u2248 3s cycle', status: 'ok' },
        { name: 'Tempo', value: 2.9, target: '\u2248 2\u20133s/rep', status: 'ok' },
      ],
    },
  ],
}

const hashString = (input: string): number => {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const sampleMovementResult = (pattern: string, variantKey?: string): MovementResult => {
  const p = toMovementPattern(pattern)
  const variants = SAMPLE_VARIANTS[p] ?? SAMPLE_VARIANTS.squat
  const available = variants.length ? variants : SAMPLE_VARIANTS.squat
  let index: number
  if (variantKey) {
    const digits = parseInt(variantKey.replace(/[^0-9]/g, ''), 10)
    const base = Number.isFinite(digits) ? digits : hashString(variantKey)
    index = Math.abs(base + Date.now()) % available.length
  } else {
    index = Math.floor(Math.random() * available.length)
  }
  const chosen = available[index] ?? available[0]
  return {
    pattern: p,
    pass_fail: chosen.pass_fail,
    detected_variation: chosen.detected_variation,
    kpis: chosen.kpis.map((kpi) => ({ ...kpi })),
  }
}

const applyVariationOverride = (
  response: MovementAnalysisResponse,
  override?: string | null
): MovementAnalysisResponse => {
  if (!override || !override.trim()) return response
  const value = override.trim()
  const original = response.detected_variation ?? value
  return {
    ...response,
    detected_variation: value,
    detected_variation_original: original,
    coach_variation_override: value,
  }
}

const SUPPORTED_PATTERNS = ['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core'] as const

const SCORE_BY_STATUS: Record<'ok' | 'warn' | 'fail', 1 | 2 | 3> = {
  ok: 3,
  warn: 2,
  fail: 1,
}

const STATUS_PRIORITY: Record<'ok' | 'warn' | 'fail', number> = { ok: 2, warn: 1, fail: 0 }

type Pattern = 'Squat' | 'Lunge' | 'Hinge' | 'Push' | 'Pull'

interface RepInsight {
  rep_index: number
  status: 'ok' | 'warn' | 'fail'
  key_findings: string
  focus_next_rep?: string
}

interface RepSummarySegment {
  segment: 'early' | 'middle' | 'late'
  dominant_status: 'ok' | 'warn' | 'fail'
  summary: string
}

interface RepSummary {
  overall: string
  segments: RepSummarySegment[]
}

interface MovementAnalysisKpi {
  key: string
  pass: boolean
  pass_original?: boolean
  pass_override?: boolean | null
  score_0_3: 0 | 1 | 2 | 3
  why: string
  cues: string[]
  regression?: string | null
  progression?: string | null
  confidence: number
}

interface MovementAnalysisResponse {
  pattern: Pattern
  overall_score_0_3: 0 | 1 | 2 | 3
  priority_order: string[]
  global_notes?: string
  detected_variation?: string
  detected_variation_original?: string
  coach_variation_override?: string
  load_readiness: LoadReadinessInfo
  kpis: MovementAnalysisKpi[]
  rep_insights?: RepInsight[]
  rep_summary?: RepSummary
  briefing: {
    load_readiness: LoadReadinessInfo
    strengths: string[]
    improvements: string[]
    consequences_positive: string
    consequences_negative: string
    action_plan: {
      focus_this_week: string
      drills: string[]
      loading_guidance?: string
    }
  }
}

const toTitlePattern = (pattern: MovementResult['pattern']): Pattern => {
  const [first, ...rest] = pattern
  const candidate = (first?.toUpperCase() ?? '') + rest.join('').toLowerCase()
  if (['Squat', 'Lunge', 'Hinge', 'Push', 'Pull'].includes(candidate)) {
    return candidate as Pattern
  }
  return 'Squat'
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const statusLabel = (status: 'ok' | 'warn' | 'fail') =>
  status === 'ok' ? 'on target' : status === 'warn' ? 'slightly off target' : 'needs attention'

const KPI_WHY_GENERATORS: Record<string, (kpi: MovementResult['kpis'][number]) => string> = {
  depth: (k) => `Average depth at ${k.value}° versus goal ${k.target}. Stable depth indicates solid range control.`,
  knee_valgus_degrees: (k) => `Average knee valgus at ${k.value}°, compared with target ${k.target}. Monitor alignment to avoid collapse.`,
  knee_valgus: (k) => `Average knee valgus measured at ${k.value}° with target ${k.target}. Reinforce even foot pressure and knee tracking.`,
  tempo_seconds: (k) => `Average tempo recorded at ${k.value}s per rep against target ${k.target}. Maintain smooth pacing throughout.`,
  tempo: (k) => `Current tempo is ${k.value} relative to goal ${k.target}. Smooth tempo builds consistent power output.`,
  trunk_flex: (k) => `Torso flexion averages ${k.value}° against target ${k.target}. Neutral spine and braced trunk keep load distributed.`,
  trunk_flexion: (k) => `Trunk angle measures ${k.value}° compared to ${k.target}. Stay tall and brace to limit forward collapse.`,
  heel_contact_ratio: (k) => `Heel contact ratio measured at ${k.value} (${k.target} target). Consistent heel contact supports stability.`,
  // Hinge-specific
  hip_hinge_ratio: (k) => `Hip-to-knee flexion ratio ${k.value} vs target ${k.target}. Maintain hinge dominance without excessive knee travel.`,
  lumbar_control: (k) => `Lumbar variance ~${k.value}° vs target ${k.target}. Keep ribs down and pelvis neutral to limit lumbar movement.`,
  bar_path_drift: (k) => `Implement path drift ~${k.value} vs target ${k.target}. Keep the load close to the mid-foot through the range.`,
  // Push-specific
  lockout_depth: (k) => `Lockout quality ${k.value} vs goal ${k.target}. Elbows reach terminal extension without losing shoulder position.`,
  elbow_path: (k) => `Elbow path deviation ~${k.value}° vs target ${k.target}. Keep elbows tracking in the intended groove.`,
  trunk_line: (k) => `Trunk line deviation ~${k.value}° vs target ${k.target}. Brace to keep a stable torso position.`,
  // Pull-specific
  scap_timing: (k) => `Scapular timing index ${k.value} vs target ${k.target}. Sequence scap set with the pull for clean finish.`,
  torso_sway: (k) => `Torso sway ~${k.value}° vs target ${k.target}. Maintain torso stillness while driving elbows.`,
  // Lunge-specific
  front_knee_track: (k) => `Front-knee tracking variance ${k.value} vs target ${k.target}. Keep knee stacked over mid-foot through stance.`,
  trail_hip_control: (k) => `Trail-hip control deviation ${k.value} vs target ${k.target}. Control pelvic position during transition.`,
  pelvic_stability: (k) => `Pelvic tilt variance ${k.value} vs target ${k.target}. Keep pelvis level to improve frontal-plane control.`,
  // Carry-specific
  torso_stack: (k) => `Torso stack deviation ${k.value} vs target ${k.target}. Keep ribs over pelvis with minimal lateral shift.`,
  grip_integrity: (k) => `Grip integrity ${k.value} vs target ${k.target}. Maintain wrist and handle alignment under load.`,
  path_sway: (k) => `Path sway ${k.value} vs target ${k.target}. Walk a straight line with steady steps.`,
  // Core-specific
  plank_alignment: (k) => `Plank alignment drop ${k.value}° vs target ${k.target}. Keep a long line from ear to ankle.`,
  hip_drift: (k) => `Hip drift ${k.value} vs target ${k.target}. Keep hips stacked over shoulders and ankles.`,
  breathing_cadence: (k) => `Breathing cadence ${k.value} vs target ${k.target}. Maintain diaphragmatic rhythm without rib flare.`,
}

const KPI_DEFAULT_CUES: Record<string, string[]> = {
  depth: ['Stay patient in the bottom position', 'Keep brace engaged through ascent'],
  knee_valgus_degrees: ['Press knees out over toes', 'Maintain even foot pressure'],
  knee_valgus: ['Screw feet into the floor to line knees over toes', 'Drive the floor apart as you stand'],
  tempo_seconds: ['Match eccentric and concentric rhythm', 'Keep breathing rhythm steady'],
  tempo: ['Count a smooth “3 down, 1 up” cadence', 'Stay tight through the change of direction'],
  trunk_flex: ['Brace ribs down before you move', 'Drive the crown of the head forward without collapsing'],
  trunk_flexion: ['Brace ribs down before you move', 'Drive the crown of the head forward without collapsing'],
  heel_contact_ratio: ['Drive through mid-foot and heel', 'Avoid rocking forward onto toes'],
}

const GENERIC_CUES: Record<'ok' | 'warn' | 'fail', string[]> = {
  ok: ['Maintain current technique focus; stay long through the spine.', 'Keep tension through the full range just like this.'],
  warn: ['Lock in your setup before each rep to stay stacked.', 'Slow the tempo slightly to feel balance under the bar.'],
  fail: ['Reset stance and brace, then groove reps with tempo work.', 'Break the pattern into pauses to rebuild position control.'],
}

const KPI_STRENGTHS: Record<string, string> = {
  depth: 'Depth is consistent and controlled rep-to-rep.',
  knee_valgus: 'Knee tracking stays stacked over the mid-foot.',
  knee_valgus_degrees: 'Lower body stayed aligned with even foot pressure.',
  tempo: 'Tempo is smooth and deliberate across the set.',
  tempo_seconds: 'Cadence stays locked in without rushing transitions.',
  trunk_flex: 'Torso stayed braced with minimal collapse.',
  trunk_flexion: 'Spine position remained organized under load.',
  hip_hinge_ratio: 'Hip hinge dominated and kept the pattern efficient.',
  lumbar_control: 'Lumbar stayed neutral with no noticeable flex.',
  bar_path_drift: 'Implement path stayed tight to the body.',
  lockout_depth: 'Each rep reached a strong lockout.',
  elbow_path: 'Elbows tracked the intended groove cleanly.',
  trunk_line: 'Core stayed stacked without sag or pike.',
  scap_timing: 'Scapular motion sequenced well with the pull.',
  torso_sway: 'Torso control kept the row locked in.',
  front_knee_track: 'Front knee stayed over the foot throughout.',
  trail_hip_control: 'Trail hip stayed stable through transitions.',
  pelvic_stability: 'Pelvis stayed level with minimal shift.',
  torso_stack: 'Torso stayed stacked over the stride.',
  grip_integrity: 'Grip stayed strong and neutral.',
  path_sway: 'Carry path stayed tight without drifting.',
  plank_alignment: 'Plank alignment held a straight line.',
  hip_drift: 'Hips stayed centered under tension.',
  breathing_cadence: 'Breathing rhythm complemented the brace.',
  heel_contact_ratio: 'Foot tripod contact stayed rooted.',
}

const KPI_IMPROVEMENTS: Record<string, string> = {
  depth: 'Dial in consistent depth by owning the bottom position.',
  knee_valgus: 'Keep knees tracking over the toes with active foot pressure.',
  knee_valgus_degrees: 'Drive knees out to eliminate valgus collapse.',
  tempo: 'Match eccentric and concentric timing to keep rhythm.',
  tempo_seconds: 'Smooth the cadence so each rep hits the same tempo.',
  trunk_flex: 'Brace harder to limit torso collapse forward.',
  trunk_flexion: 'Keep ribs stacked over hips to resist torso drop.',
  hip_hinge_ratio: 'Sit hips further back to emphasize hinge dominance.',
  lumbar_control: 'Lock lats and brace to keep lumbar from moving.',
  bar_path_drift: 'Keep the implement path closer to the mid-foot.',
  lockout_depth: 'Finish each rep with full elbow extension.',
  elbow_path: 'Guide elbows toward the back pocket each rep.',
  trunk_line: 'Hold a rigid plank line through the entire push.',
  scap_timing: 'Set scaps before pulling to sync the row.',
  torso_sway: 'Brace stronger to stop torso swinging with the row.',
  front_knee_track: 'Stack front knee over second toe through the lunge.',
  trail_hip_control: 'Squeeze trail glute to steady the pelvis.',
  pelvic_stability: 'Keep hips level by bracing the belt buckle to sternum.',
  torso_stack: 'Stack ribs over hips to remove lateral lean.',
  grip_integrity: 'Maintain neutral wrist by crushing the handle.',
  path_sway: 'Walk straight lines like on rails to eliminate sway.',
  plank_alignment: 'Push the floor away to keep plank alignment locked.',
  hip_drift: 'Keep hips stacked by staying long through heel to crown.',
  breathing_cadence: 'Own slow exhales while braced to control breathing.',
  heel_contact_ratio: 'Maintain heel pressure to stabilize the stance.',
}

const MOVEMENT_POSITIVE: Record<MovementResult['pattern'], string> = {
  squat: 'Controlled squats develop resilient lower-body strength and confidence under load.',
  hinge: 'Efficient hinging builds posterior-chain power for heavier pulls and cleans.',
  push: 'Solid pressing reinforces shoulder health and full-range strength.',
  pull: 'Clean rows strengthen the upper back and balance pushing volume.',
  lunge: 'Stable lunges improve unilateral strength and gait mechanics.',
  carry: 'Loaded carries reinforce total-body stability and grip capacity.',
  core: 'Braced core work protects the spine and transfers power to every lift.',
}

const MOVEMENT_NEGATIVE: Record<MovementResult['pattern'], string> = {
  squat: 'Unresolved squat issues can overload knees and limit strength progress.',
  hinge: 'Poor hinge mechanics stress the lumbar spine and stall deadlift gains.',
  push: 'Pressing breakdowns risk shoulder irritation and stalled progress.',
  pull: 'Row inconsistencies lead to upper-back imbalances and grip leaks.',
  lunge: 'Lunge instability carries over to running, change of direction, and balance.',
  carry: 'Carry breakdowns reduce trunk resilience and grip durability.',
  core: 'Weak core control limits expression of strength in every main lift.',
}

const MOVEMENT_FOCUS: Record<MovementResult['pattern'], string> = {
  squat: 'Own consistent depth with full-body brace every rep.',
  hinge: 'Load the hips while keeping the torso locked in.',
  push: 'Keep trunk rigid and elbows tracing the intended path.',
  pull: 'Lead with the scaps and finish elbows tight.',
  lunge: 'Stack pelvis and knees while controlling the step pattern.',
  carry: 'Walk tall—ribs over hips with each balanced stride.',
  core: 'Brace 360° and breathe under tension without losing position.',
}

const MOVEMENT_DRILLS: Record<MovementResult['pattern'], string[]> = {
  squat: ['Tempo squats 3-1-0 cadence', 'Pause squats at bottom position'],
  hinge: ['Rack-pull isometrics', 'Hip wall taps for hinge pattern'],
  push: ['Tempo push-ups', 'Board presses with tucked elbows'],
  pull: ['Chest-supported rows', 'Scapular pull-aparts with pauses'],
  lunge: ['Split-squat ISO holds', 'Tempo walking lunges with dowel'],
  carry: ['Suitcase carries with offset load', 'Farmer carries focusing on straight-line gait'],
  core: ['RKC plank holds', 'Dead bug breathing series'],
}

const MOVEMENT_LOADING: Record<MovementResult['pattern'], string> = {
  squat: 'Stay in RPE 6–7 while grooves become automatic.',
  hinge: 'Pull in the 65–75% range to reinforce braced hinging.',
  push: 'Press at moderate load with longer eccentrics.',
  pull: 'Use moderate rows with pauses to groove control.',
  lunge: 'Load split squats lightly until balance is automatic.',
  carry: 'Carry loads at RPE 6 focusing on posture before weight.',
  core: 'Train core drills daily with submaximal effort but crisp execution.',
}

const MOVEMENT_STRENGTH_FALLBACK: Record<MovementResult['pattern'], string> = {
  squat: 'Setup and brace are dialed—keep building on that foundation.',
  hinge: 'You establish tension quickly, setting up strong hinges.',
  push: 'Upper body stays organized from setup through finish.',
  pull: 'You own a solid base and consistent pull sequencing.',
  lunge: 'Balance and control are trending well across reps.',
  carry: 'Posture stays tall and composed under the load.',
  core: 'You lock in a reliable brace that supports every lift.',
}

const fetchCuesForKpi = async (
  pattern: MovementResult['pattern'],
  kpiKey: string,
  status: 'ok' | 'warn' | 'fail'
): Promise<string[] | null> => {
  if (!supabaseAdmin) return null
  try {
    const { data, error } = await supabaseAdmin
      .from('coaching_cues')
      .select('cue')
      .eq('active', true)
      .eq('pattern', pattern)
      .eq('kpi_key', kpiKey)
      .eq('status', status)
      .order('priority', { ascending: true })
      .limit(4)
    if (error) {
      console.warn('[movement-analyze] coaching_cues query error', error)
      return null
    }
    if (!data?.length) return null
    return data.map((row) => row.cue)
  } catch (err) {
    console.warn('[movement-analyze] coaching_cues fetch failed', err)
    return null
  }
}

const applyCueLookup = async (
  pattern: MovementResult['pattern'],
  response: MovementAnalysisResponse
): Promise<MovementAnalysisResponse> => {
  const enhanced = await Promise.all(
    response.kpis.map(async (kpi) => {
      const status: 'ok' | 'warn' | 'fail' = kpi.score_0_3 >= 3 ? 'ok' : kpi.score_0_3 >= 2 ? 'warn' : 'fail'
      const cues = await fetchCuesForKpi(pattern, kpi.key, status)
      return {
        ...kpi,
        cues: cues && cues.length ? cues : kpi.cues,
      }
    })
  )
  return { ...response, kpis: enhanced }
}

const summarizeReps = (reps: MovementResult['reps'] | undefined): { insights?: RepInsight[]; summary?: RepSummary } => {
  if (!reps || reps.length === 0) return {}
  const insights: RepInsight[] = reps.map((rep) => ({
    rep_index: rep.rep_index,
    status: rep.status,
    key_findings: rep.key_findings,
    focus_next_rep: rep.focus_next_rep || undefined,
  }))

  const segmentSize = Math.max(1, Math.floor(insights.length / 3))
  const segmentKeys: Array<'early' | 'middle' | 'late'> = ['early', 'middle', 'late']
  const segments: RepSummarySegment[] = segmentKeys.map((segment, idx) => {
    const start = idx * segmentSize
    const end = idx === 2 ? insights.length : Math.min(insights.length, start + segmentSize)
    const slice = insights.slice(start, end)
    const counts: Record<'ok' | 'warn' | 'fail', number> = { ok: 0, warn: 0, fail: 0 }
    slice.forEach((rep) => { counts[rep.status] += 1 })
    const dominant = (Object.keys(counts) as Array<'ok' | 'warn' | 'fail'>)
      .sort((a, b) => counts[b] - counts[a] || STATUS_PRIORITY[b] - STATUS_PRIORITY[a])[0]
    const summaryParts = slice.map((rep) => `Rep ${rep.rep_index}: ${rep.key_findings}`)
    return {
      segment,
      dominant_status: dominant,
      summary: summaryParts.join(' | ') || 'No notable findings',
    }
  })

  const overall = segments
    .map((seg) => `${seg.segment.toUpperCase()}: ${seg.dominant_status} (${seg.summary})`)
    .join(' \u2022 ')

  return { insights, summary: { overall, segments } }
}

const mapMovementResult = (movement: MovementResult): MovementAnalysisResponse => {
  const readiness = deriveLoadReadiness(
    movement.pattern,
    movement.kpis.map((kpi) => ({ name: kpi.name, status: kpi.status }))
  )
  const { insights, summary } = summarizeReps(movement.reps)
  return {
    pattern: toTitlePattern(movement.pattern),
    overall_score_0_3: movement.pass_fail === 'pass' ? 3 : 1,
    priority_order: movement.kpis.map((kpi) => kpi.name),
    global_notes: undefined,
    detected_variation: movement.detected_variation,
    load_readiness: readiness,
    kpis: movement.kpis.map((kpi) => {
      const slug = slugify(kpi.name)
      const why = (KPI_WHY_GENERATORS[slug]?.(kpi)) ?? `Result is ${statusLabel(kpi.status)} relative to target ${kpi.target}. Recorded value ${kpi.value}.`
      const cues = KPI_DEFAULT_CUES[slug] ?? GENERIC_CUES[kpi.status]
      return {
        key: slug,
        pass: kpi.status === 'ok',
        pass_original: kpi.status === 'ok',
        pass_override: null,
        score_0_3: SCORE_BY_STATUS[kpi.status],
        why,
        cues,
        regression: null,
        progression: null,
        confidence: 0.5,
      }
    }),
    ...(insights ? { rep_insights: insights } : {}),
    ...(summary ? { rep_summary: summary } : {}),
    briefing: {
      load_readiness: readiness,
      strengths: (() => {
        const positives = movement.kpis
          .filter((kpi) => kpi.status === 'ok')
          .map((kpi) => KPI_STRENGTHS[slugify(kpi.name)] ?? `${kpi.name}: execution on target.`)
        if (positives.length > 0) return positives
        return [MOVEMENT_STRENGTH_FALLBACK[movement.pattern] ?? 'Solid intent and setup—keep reinforcing these reps.']
      })(),
      improvements: movement.kpis
        .filter((kpi) => kpi.status !== 'ok')
        .map((kpi) => KPI_IMPROVEMENTS[slugify(kpi.name)] ?? `${kpi.name}: tighten mechanics to hit target range.`),
      consequences_positive: MOVEMENT_POSITIVE[movement.pattern] ?? 'Clean reps build capacity for heavier loading in this pattern.',
      consequences_negative: MOVEMENT_NEGATIVE[movement.pattern] ?? 'Address the noted issues before progressing load to avoid overuse.',
      action_plan: {
        focus_this_week: MOVEMENT_FOCUS[movement.pattern] ?? 'Refine fundamentals and own the standard positions.',
        drills: MOVEMENT_DRILLS[movement.pattern] ?? ['Tempo work', 'Isometric holds'],
        loading_guidance: MOVEMENT_LOADING[movement.pattern] ?? 'Train in RPE 6–7 zone while owning technique.',
      },
    },
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }), headers: CORS_HEADERS }
  }

  try {
    const body = JSON.parse(event.body || '{}') as any

    // Demo mode: return canned output without OpenAI
    const overrideVariation = typeof body?.overrideVariation === 'string' ? body.overrideVariation.trim() : ''

    if (body?.flags?.sample === true) {
      const flags = body?.flags ?? {}
      const variantKey = Object.keys(flags).find((k) => typeof k === 'string' && k.startsWith('run_')) || JSON.stringify(flags)
      const movement = sampleMovementResult(body?.pattern ?? 'squat', variantKey)
      const normalized = mapMovementResult(movement)
      const withOverride = applyVariationOverride(normalized, overrideVariation)
      const withCues = await applyCueLookup(movement.pattern, withOverride)
      return { statusCode: 200, body: JSON.stringify(withCues), headers: CORS_HEADERS }
    }

    if (Array.isArray(body.frames) && typeof body.pattern === 'string') {
      const pattern = String(body.pattern).toLowerCase()
      if (!SUPPORTED_PATTERNS.includes(pattern as (typeof SUPPORTED_PATTERNS)[number])) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported pattern' }), headers: CORS_HEADERS }
      }

      const movement = await analyzePatternWithFrames(pattern as MovementResult['pattern'], body.frames as string[])
      const normalized = mapMovementResult(movement)
      const withOverride = applyVariationOverride(normalized, overrideVariation)
      const withCues = await applyCueLookup(movement.pattern, withOverride)
      return { statusCode: 200, body: JSON.stringify(withCues), headers: CORS_HEADERS }
    }

    const featurePayload = body
    const prompt = `You are a professional movement analyst. Analyze this movement feature payload and return ONLY JSON matching schema {pattern, detected_variation: string, pass_fail, kpis:[{name,value,target,status}] (exactly 4 items)} (no additional keys). Use a specific variation name like "Back Squat (High Bar)" that best fits the reps.\n\n${JSON.stringify(featurePayload)}`

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON. No commentary.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    })
    const text = resp.choices?.[0]?.message?.content ?? ''
    console.info('[movement-analyze] raw response', text)
    let raw: any
    try {
      raw = JSON.parse(text)
    } catch (e: any) {
      console.error('[movement-analyze] json parse error', e?.message || e)
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to parse model output' }), headers: CORS_HEADERS }
    }
    const fallbackPattern = toMovementPattern((featurePayload?.pattern || 'squat'))
    const normalized = coerceMovementResult(raw, fallbackPattern)
    const parsed = MovementResultZ.safeParse(normalized)
    if (!parsed.success) {
      console.error('[movement-analyze] parse error', parsed.error.flatten())
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to parse model output' }), headers: CORS_HEADERS }
    }

    const normalizedResponse = mapMovementResult(parsed.data)
    const withOverride = applyVariationOverride(normalizedResponse, overrideVariation)
    const withCues = await applyCueLookup(parsed.data.pattern, withOverride)
    return { statusCode: 200, body: JSON.stringify(withCues), headers: CORS_HEADERS }
  } catch (error: any) {
    console.error('[movement-analyze] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error', detail: String(error?.message || error) }), headers: CORS_HEADERS }
  }
}

export { handler }
