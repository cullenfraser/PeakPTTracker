import type { Handler } from '@netlify/functions'
import { analyzePatternWithFrames } from '../../server/services/screen/openaiScreenService'
import { MovementResultZ, type MovementResult } from '../../server/services/screen/schema'
import { openai } from '../../server/services/screen/openaiClient'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const normalizeStatus = (s: any): 'ok' | 'warn' | 'fail' => {
  const v = String(s || '').toLowerCase()
  if (v === 'ok' || v === 'pass') return 'ok'
  if (v === 'warn') return 'warn'
  return 'fail'
}

const coerceMovementResult = (raw: any, fallbackPattern: MovementResult['pattern']): any => {
  const supported = ['squat','hinge','push','pull','lunge','carry','core']
  const patt = String(raw?.pattern ?? fallbackPattern ?? 'squat').toLowerCase()
  const pattern = (supported.includes(patt) ? patt : 'squat') as MovementResult['pattern']
  const kpisIn: any[] = Array.isArray(raw?.kpis) ? raw.kpis : []
  const kpis = kpisIn.slice(0, 4).map((k) => {
    const name = String(k?.name ?? '')
    let value: any = (k?.value ?? k?.numeric_value)
    if (typeof value === 'string') {
      const n = parseFloat(value)
      value = Number.isFinite(n) ? n : 0
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) value = 0
    const target = String(k?.target ?? '')
    const status = normalizeStatus(k?.status)
    return { name, value, target, status }
  })
  const passFailRaw = String(raw?.pass_fail ?? '')
  const pass_fail: 'pass' | 'fail' = passFailRaw === 'pass' || passFailRaw === 'fail'
    ? passFailRaw
    : (kpis.some((k) => k.status === 'fail') ? 'fail' : 'pass')
  return { pattern, pass_fail, kpis }
}

const toMovementPattern = (p: string): MovementResult['pattern'] => {
  const s = (p || 'squat').toLowerCase()
  return (['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core'].includes(s) ? s : 'squat') as MovementResult['pattern']
}

const sampleMovementResult = (pattern: string): MovementResult => {
  const p = toMovementPattern(pattern)
  return {
    pattern: p,
    pass_fail: 'pass',
    kpis: [
      { name: 'Depth', value: 92, target: '≥ 90°', status: 'ok' },
      { name: 'Knee valgus', value: 6, target: '≤ 5°', status: 'warn' },
      { name: 'Trunk flex', value: 28, target: '≤ 30°', status: 'ok' },
      { name: 'Tempo', value: 3.0, target: '≈ 2–3s/rep', status: 'ok' },
    ],
  }
}

const SUPPORTED_PATTERNS = ['squat', 'hinge', 'push', 'pull', 'lunge', 'carry', 'core'] as const

const SCORE_BY_STATUS: Record<'ok' | 'warn' | 'fail', 1 | 2 | 3> = {
  ok: 3,
  warn: 2,
  fail: 1,
}

type Pattern = 'Squat' | 'Lunge' | 'Hinge' | 'Push' | 'Pull'

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
  kpis: MovementAnalysisKpi[]
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
  tempo_seconds: (k) => `Average tempo recorded at ${k.value}s per rep against target ${k.target}s. Maintain smooth pacing throughout.`,
  heel_contact_ratio: (k) => `Heel contact ratio measured at ${k.value} (${k.target} target). Consistent heel contact supports stability.`,
}

const KPI_DEFAULT_CUES: Record<string, string[]> = {
  depth: ['Stay patient in the bottom position', 'Keep brace engaged through ascent'],
  knee_valgus_degrees: ['Press knees out over toes', 'Maintain even foot pressure'],
  tempo_seconds: ['Match eccentric and concentric rhythm', 'Keep breathing rhythm steady'],
  heel_contact_ratio: ['Drive through mid-foot and heel', 'Avoid rocking forward onto toes'],
}

const mapMovementResult = (movement: MovementResult): MovementAnalysisResponse => {
  return {
    pattern: toTitlePattern(movement.pattern),
    overall_score_0_3: movement.pass_fail === 'pass' ? 3 : 1,
    priority_order: movement.kpis.map((kpi) => kpi.name),
    global_notes: undefined,
    kpis: movement.kpis.map((kpi) => ({
      key: slugify(kpi.name),
      pass: kpi.status === 'ok',
      pass_original: kpi.status === 'ok',
      pass_override: null,
      score_0_3: SCORE_BY_STATUS[kpi.status],
      why: (KPI_WHY_GENERATORS[slugify(kpi.name)]?.(kpi)) ?? `Result is ${statusLabel(kpi.status)} relative to target ${kpi.target}. Recorded value ${kpi.value}.`,
      cues: KPI_DEFAULT_CUES[slugify(kpi.name)] ?? [],
      regression: null,
      progression: null,
      confidence: 0.5,
    })),
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
    if (body?.flags?.sample === true) {
      const movement = sampleMovementResult(body?.pattern ?? 'squat')
      const normalized = mapMovementResult(movement)
      return { statusCode: 200, body: JSON.stringify(normalized), headers: CORS_HEADERS }
    }

    if (Array.isArray(body.frames) && typeof body.pattern === 'string') {
      const pattern = String(body.pattern).toLowerCase()
      if (!SUPPORTED_PATTERNS.includes(pattern as (typeof SUPPORTED_PATTERNS)[number])) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported pattern' }), headers: CORS_HEADERS }
      }

      const movement = await analyzePatternWithFrames(pattern as MovementResult['pattern'], body.frames as string[])
      const normalized = mapMovementResult(movement)
      return { statusCode: 200, body: JSON.stringify(normalized), headers: CORS_HEADERS }
    }

    const featurePayload = body
    const prompt = `You are a professional movement analyst. Analyze this movement feature payload and return ONLY JSON matching schema {pattern, pass_fail, kpis:[{name,value,target,status}] (exactly 4 items)}:\n\n${JSON.stringify(featurePayload)}`

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
    return { statusCode: 200, body: JSON.stringify(normalizedResponse), headers: CORS_HEADERS }
  } catch (error: any) {
    console.error('[movement-analyze] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error', detail: String(error?.message || error) }), headers: CORS_HEADERS }
  }
}

export { handler }
