import type { Handler } from '@netlify/functions'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

type Pattern = 'Squat' | 'Lunge' | 'Hinge' | 'Push' | 'Pull'

interface RepMetrics {
  rep: number
  tempo_ecc_s?: number
  tempo_con_s?: number
  rom_ok?: boolean
  depth_deg?: number
  knee_valgus_deg?: number
  trunk_flex_deg?: number
  pelvis_shift_cm?: number
  lr_depth_diff_deg?: number
  heels_down?: boolean
  hip_flex_deg?: number
  knee_flex_deg?: number
  hinge_ratio?: number
  lumbar_var_deg?: number
  implement_dist_cm?: number
  elbow_min_deg?: number
  torso_line_r2?: number
  scap_set_flag?: boolean
  torso_sway_deg?: number
  scap_timing_ok?: boolean
  elbow_path_deg?: number
  wrist_dev_deg?: number
}

interface FeaturePayload {
  pattern: Pattern
  clientId: string
  fps: number
  camera_view: 'front' | 'front45' | 'side'
  reps: RepMetrics[]
  aggregates: Record<string, number | boolean>
  flags: Record<string, boolean>
  thumbnails?: string[]
}

interface GeminiKpiResult {
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

interface GeminiMovementResponse {
  pattern: Pattern
  overall_score_0_3: 0 | 1 | 2 | 3
  priority_order: string[]
  global_notes?: string
  kpis: GeminiKpiResult[]
}

const REQUIRED_KPIS: Record<Pattern, string[]> = {
  Squat: ['squat_depth_control', 'squat_knee_tracking', 'squat_trunk_brace', 'squat_foot_stability'],
  Lunge: ['lunge_front_knee_path', 'lunge_pelvis_control', 'lunge_depth_symmetry', 'lunge_push_back_drive'],
  Hinge: ['hinge_hip_ratio', 'hinge_spine_neutral', 'hinge_midfoot_pressure', 'hinge_lockout_finish'],
  Push: ['push_setup_brace', 'push_range_control', 'push_tempo_bracing', 'push_symmetry_stability'],
  Pull: ['pull_torso_brace', 'pull_scap_timing', 'pull_elbow_path', 'pull_grip_control']
}

const validateFeaturePayload = (payload: any): FeaturePayload | null => {
  if (!payload || typeof payload !== 'object') return null
  const { pattern, clientId, fps, camera_view, reps, aggregates, flags } = payload
  if (!['Squat', 'Lunge', 'Hinge', 'Push', 'Pull'].includes(pattern)) return null
  if (typeof clientId !== 'string' || !clientId) return null
  if (typeof fps !== 'number') return null
  if (!['front', 'front45', 'side'].includes(camera_view)) return null
  if (!Array.isArray(reps) || reps.length === 0) return null
  if (!aggregates || typeof aggregates !== 'object') return null
  if (!flags || typeof flags !== 'object') return null
  return payload as FeaturePayload
}

const buildPrompt = (payload: FeaturePayload) => {
  const template = {
    pattern: payload.pattern,
    required_kpis: REQUIRED_KPIS[payload.pattern],
    instructions: 'Score each KPI from 0-3. Provide pass field (true/false) and cues. Regression/progression may be null. Confidence is 0-1 float.',
    feature_payload: payload
  }
  return `Analyze the movement screen feature payload and respond with JSON that matches the schema: {
    "pattern": "${payload.pattern}",
    "overall_score_0_3": 0|1|2|3,
    "priority_order": string[],
    "global_notes": string (optional),
    "kpis": [
      {
        "key": string (one of required_kpis),
        "pass": boolean,
        "pass_original": boolean,
        "pass_override": null,
        "score_0_3": 0|1|2|3,
        "why": string,
        "cues": string[],
        "regression": string|null,
        "progression": string|null,
        "confidence": number between 0 and 1
      }
    ]
  }.
  Respond with exactly one JSON object and no additional text. Here is the feature payload:
  ${JSON.stringify(template)}`
}

const parseGeminiResponse = (raw: any): GeminiMovementResponse | null => {
  const text = raw?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join('').trim()
  if (!text) return null
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    console.error('[gemini-interpret] Failed to parse JSON', error, text)
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  if (!['Squat', 'Lunge', 'Hinge', 'Push', 'Pull'].includes(parsed.pattern)) return null
  if (!Array.isArray(parsed.kpis) || parsed.kpis.length !== REQUIRED_KPIS[parsed.pattern as Pattern].length) return null
  const kpis = parsed.kpis.map((kpi: any) => ({
    key: String(kpi.key),
    pass: !!kpi.pass,
    pass_original: typeof kpi.pass_original === 'boolean' ? kpi.pass_original : !!kpi.pass,
    pass_override: typeof kpi.pass_override === 'boolean' ? kpi.pass_override : null,
    score_0_3: (kpi.score_0_3 ?? 0) as 0 | 1 | 2 | 3,
    why: String(kpi.why ?? ''),
    cues: Array.isArray(kpi.cues) ? kpi.cues.map((c: any) => String(c)) : [],
    regression: kpi.regression ? String(kpi.regression) : null,
    progression: kpi.progression ? String(kpi.progression) : null,
    confidence: typeof kpi.confidence === 'number' ? Math.min(Math.max(kpi.confidence, 0), 1) : 0.5
  }))
  return {
    pattern: parsed.pattern as Pattern,
    overall_score_0_3: (parsed.overall_score_0_3 ?? 0) as 0 | 1 | 2 | 3,
    priority_order: Array.isArray(parsed.priority_order) ? parsed.priority_order.map((p: any) => String(p)) : REQUIRED_KPIS[parsed.pattern as Pattern],
    global_notes: parsed.global_notes ? String(parsed.global_notes) : undefined,
    kpis
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }), headers: CORS_HEADERS }
  }
  if (!GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Gemini API key' }), headers: CORS_HEADERS }
  }

  try {
    const payload = JSON.parse(event.body || '{}')
    const featurePayload = validateFeaturePayload(payload)
    if (!featurePayload) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid FeaturePayload' }), headers: CORS_HEADERS }
    }

    const prompt = buildPrompt(featurePayload)
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.15,
          topP: 0.9,
          topK: 32,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[gemini-interpret] Gemini API error', response.status, errorText)
      return { statusCode: 502, body: JSON.stringify({ error: 'Gemini API error' }), headers: CORS_HEADERS }
    }

    const raw = await response.json()
    const parsed = parseGeminiResponse(raw)
    if (!parsed) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to parse Gemini response' }), headers: CORS_HEADERS }
    }

    const normalized: GeminiMovementResponse = {
      ...parsed,
      kpis: parsed.kpis.map((kpi) => ({
        ...kpi,
        pass_original: typeof kpi.pass_original === 'boolean' ? kpi.pass_original : kpi.pass,
        pass_override: null
      }))
    }

    return { statusCode: 200, body: JSON.stringify(normalized), headers: CORS_HEADERS }
  } catch (error: any) {
    console.error('[gemini-interpret] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error' }), headers: CORS_HEADERS }
  }
}

export { handler }
