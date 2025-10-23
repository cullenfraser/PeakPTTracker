import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Busboy from 'busboy'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { openai } from '../../server/services/screen/openaiClient'
import { MovementKPIsZ } from '../../server/services/screen/coachSchema'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'movement-clips'

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as string)

const JSON_SCHEMA = {
  name: 'MovementKPIs',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      detected_variation: { type: 'string' },
      subject: {
        type: 'object',
        properties: {
          selection_method: { type: 'string' },
          confidence_0_1: { type: 'number' },
          notes: { type: 'string' }
        },
        required: ['selection_method','confidence_0_1']
      },
      camera_limits: { type: 'array', items: { type: 'string' } },
      overall_score_0_3: { type: 'integer' },
      overall_pass: { type: 'boolean' },
      global_notes: { type: 'string' },
      kpis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            score_0_3: { type: 'integer' },
            pass: { type: 'boolean' },
            why: { type: 'string' },
            frame_refs: { type: 'array', items: { type: 'integer' } },
            cues: { type: 'array', items: { type: 'string' } },
            regression: { type: 'string' },
            progression: { type: 'string' }
          },
          required: ['key','name','score_0_3','pass','why','cues']
        }
      },
      priority_order: { type: 'array', items: { type: 'string' } },
      briefing: {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' } },
          improvements: { type: 'array', items: { type: 'string' } },
          consequences_positive: { type: 'string' },
          consequences_negative: { type: 'string' },
          action_plan: {
            type: 'object',
            properties: {
              focus_this_week: { type: 'string' },
              drills: { type: 'array', items: { type: 'string' } },
              loading_guidance: { type: 'string' }
            },
            required: ['focus_this_week','drills']
          }
        },
        required: ['strengths','improvements','consequences_positive','consequences_negative','action_plan']
      }
    ,
      reps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rep_index: { type: 'integer' },
            status: { type: 'string' },
            key_findings: { type: 'string' },
            focus_next_rep: { type: 'string' }
          },
          required: ['rep_index','status','key_findings']
        }
      }
    },
    required: ['pattern','detected_variation','subject','overall_score_0_3','overall_pass','kpis','priority_order','briefing'],
    additionalProperties: false
  },
  strict: true
} as const

const SYS_PROMPT = `ROLE\nYou are a professional strength coach for general-population and performance clients. Your philosophy is foundational and functional first, with the ability to apply powerlifting standards when the movement variation calls for it. You do not provide medical advice or diagnoses; you give training-focused, actionable coaching only.\nINFLUENCE & METHOD\nDraw on evidence-based barbell and functional coaching practices commonly seen among elite coaches (e.g., Squat University fundamentals, Dave Tate/TSS/TTP style barbell mechanics, The Strength Guys’ data-informed approach, Ed Coan’s technical simplicity, Chad Wesley Smith’s principles of bracing and bar path). Do NOT imitate any specific person’s voice or claim affiliation; use a neutral, professional coaching tone.\nSCOPE OF ANALYSIS\nMovement family: {pattern} (one of: Squat, Push, Pull, Hinge, Lunge).\nDetect the specific variation (e.g., Squat: bodyweight/goblet/front/back; Hinge: DB/KB RDL, conventional/sumo/trap-bar deadlift, good morning, KB swing; Lunge: split squat, forward/reverse/walking, DB front rack; Push: push-up variants, DB bench/incline; Pull: seated cable row underhand variants).\nFocus on a single primary subject and IGNORE background people. If multiple movers appear, select the person centered and most persistent across frames; note confidence.\nEVALUATION PRIORITIES (in order)\nSafety & load-readiness: spinal neutrality/bracing, joint control, ownership of range.\nEffective force production: bar/implement path, balance over mid-foot (as applicable), sequencing.\nConsistency: repeatable reps, stable tempo, symmetrical control where expected.\nSpecificity overlay: if the variation is a strength-sport pattern, add relevant powerlifting standards without ignoring general-pop needs.\nRUBRIC & DECISION POLICY\nUse the 4 KPIs for the selected family (provided in the user message) and score each 0–3.\nKPI pass = score ≥ 2 AND no red-flag note for that KPI.\noverall_pass = all 4 KPIs pass AND no global red flags (obvious pain behavior, severe loss of position).\nIf camera/view limits a KPI, lower confidence and state the limitation.\nIf uncertain between variations, provide the most likely and a second-best with confidence.\nOUTPUT STYLE & TONE\nStrength-coach voice: concise, constructive, plain language, external-focus cues when possible.\nProvide what’s working (strengths), what to improve (1–3 items), likely consequences (positive if strengths persist; negative if faults persist), and a short action plan with 1–2 drills and basic loading guidance.\nNo medical or diagnostic language. Suggest “flag for coach review” rather than diagnoses.\nCONSTRAINTS\nReturn STRICT JSON that matches the schema provided by the user; NO prose outside the JSON.\nCite frame references where relevant to justify KPI scores (e.g., where valgus or flexion appears).\nAcknowledge uncertainty explicitly when view/occlusion prevents confident judgment.`

const RUBRIC_PROMPT = (pattern: string, camera: string) => `CONTEXT\nPattern family selected by coach: ${pattern}\nCamera view: ${camera}\nAssume a single athlete is the target; ignore other people in background.\nFRAMES\nYou will receive up to 20 frames (frame_id: 1..N), evenly spaced at ~4 fps from a ≤30s clip.\nRUBRIC — KPIs & 0–3 SCORING\nSQUAT (bodyweight / goblet / front / back)\nDepth control: 0 collapse/no depth; 1 partial w/ bounce; 2 parallel controlled; 3 parallel+ smooth & consistent.\nKnee tracking: 0 valgus & wobble; 1 occasional valgus; 2 mostly over mid-foot; 3 clean over toes.\nFoot pressure & bracing: 0 heels lift/arch collapse; 1 inconsistent tripod; 2 tripod mostly maintained; 3 stable tripod + braced trunk.\nTempo & stability: 0 erratic; 1 inconsistent; 2 steady; 3 smooth, no sticking.\nHINGE (DB/KB RDL, conventional/sumo/trap-bar deadlift, good morning, KB swing)\nLumbar neutrality: 0 flexed; 1 occasional flex; 2 neutral maintained; 3 neutral + crisp hinge.\nHinge mechanics: 0 squatty; 1 mixed; 2 clear hinge to mid-shin; 3 optimal posterior-chain load.\nImplement/path & balance: 0 drifting; 1 small drift; 2 close path; 3 vertical path over mid-foot.\nLats/upper back set: 0 loose; 1 intermittent; 2 set most reps; 3 locked throughout.\nLUNGE (split squat, forward/reverse/walking, DB front rack)\nFrontal plane control: 0 torso/pelvic shift; 1 occasional; 2 mostly stacked; 3 stacked & stable.\nKnee travel/track: 0 collapse/inside; 1 inconsistent; 2 over 2nd–3rd toe; 3 clean consistent.\nStep/return balance: 0 wobbles; 1 occasional; 2 controlled; 3 crisp entries/exits.\nDepth & shin angle symmetry: 0 shallow/uneven; 1 inconsistent; 2 adequate; 3 optimal & even.\nPUSH (push-up variants, DB bench/incline)\nScap control: 0 winging; 1 intermittent; 2 controlled; 3 smooth pro/retraction rhythm.\nTrunk line/bracing: 0 sag/pike; 1 intermittent; 2 straight; 3 rigid plank under load.\nROM & touch points: 0 partial; 1 inconsistent; 2 full ROM; 3 full & repeatable.\nElbow path: 0 flared; 1 variable; 2 ~45–60°; 3 optimal consistent.\nPULL (seated underhand cable row variants)\nMidline control: 0 trunk sway; 1 intermittent; 2 steady; 3 stable with slight chest lead.\nScap retraction/depression: 0 shrug/arm-only; 1 partial; 2 coordinated scap; 3 clear scap rhythm.\nElbow path & finish: 0 flared/wrist bend; 1 variable; 2 elbows back to ribs; 3 strong finish neutral wrist.\nTempo & range: 0 jerky; 1 inconsistent; 2 smooth full; 3 smooth with controlled eccentrics.\nPASS/FAIL\nKPI pass if score ≥2 and no red-flag note.\noverall_pass = all 4 KPIs pass AND no global red flags.\nOUTPUT\nReturn STRICT JSON per the schema (no prose). Use frame_id references to justify scores when possible.`

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }), headers: CORS_HEADERS }
  if (!supabaseAdmin) return { statusCode: 500, body: JSON.stringify({ error: 'Supabase admin not configured' }), headers: CORS_HEADERS }

  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || ''
  if (!String(contentType).toLowerCase().includes('multipart/form-data')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Expected multipart/form-data' }), headers: CORS_HEADERS }
  }

  const bodyBuf = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8')

  const tmpDir = '/tmp'
  const filePath = path.join(tmpDir, `upload-${Date.now()}.bin`)
  let fileMime = 'application/octet-stream'
  const fields: Record<string, string> = {}

  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: { 'content-type': contentType as string } })
    bb.on('file', (_name: any, file: any, info: any) => {
      const { mimeType } = info as any
      if (mimeType) fileMime = mimeType
      const ws = fs.createWriteStream(filePath)
      file.pipe(ws)
      ws.on('finish', () => {})
      ws.on('error', reject)
    })
    bb.on('field', (name: any, val: any) => { fields[name] = String(val) })
    bb.on('error', reject)
    bb.on('finish', () => resolve())
    Readable.from(bodyBuf).pipe(bb)
  })

  const clientId = fields['clientId']
  const coachId = fields['coachId']
  const pattern = (fields['pattern'] || 'Squat').trim()
  const cameraView = (fields['camera_view'] || 'front').trim()
  const overrideVariation = (fields['override_variation'] || '').trim()
  if (!clientId) return { statusCode: 400, body: JSON.stringify({ error: 'clientId required' }), headers: CORS_HEADERS }

  // Extract frames at 4 fps, width <= 640px, cap 20 frames
  const outPrefix = path.join(tmpDir, `frames-${Date.now()}`)
  const outPattern = `${outPrefix}-%02d.jpg`

  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions(['-vf', 'fps=4,scale=640:-2', '-frames:v', '20'])
      .output(outPattern)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .run()
  })

  const dir = path.dirname(outPrefix)
  const base = path.basename(outPrefix)
  const frameFiles = fs.readdirSync(dir)
    .filter((f) => f.startsWith(base))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(dir, f))

  const frames: string[] = frameFiles.map((fp) => `data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}`)
  const framesLimited = frames.slice(0, 20)

  // Upload original clip to Supabase Storage
  const ext = fileMime.includes('mp4') ? 'mp4' : 'webm'
  const storagePath = `clips/${clientId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, fs.readFileSync(filePath), { contentType: fileMime || `video/${ext}`, upsert: true })
  if (uploadErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Upload failed', detail: uploadErr.message }), headers: CORS_HEADERS }
  }

  // Build OpenAI request
  const messages: any[] = [
    { role: 'system', content: SYS_PROMPT.replace('{pattern}', pattern) },
    {
      role: 'user',
      content: [
        { type: 'text', text: RUBRIC_PROMPT(pattern, cameraView) },
        ...(overrideVariation
          ? [{ type: 'text', text: `Coach override: Analyze this set as variation = ${overrideVariation}. Use that variation specificity for KPI interpretation.` }]
          : []),
        ...framesLimited.flatMap((url, idx) => ([
          { type: 'text', text: `frame_id: ${idx + 1}` },
          { type: 'image_url', image_url: { url, detail: 'low' } }
        ]))
      ]
    }
  ]

  let rawText = ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
      messages,
    })
    rawText = res.choices?.[0]?.message?.content || ''
  } catch (err: any) {
    console.error('[screen-analyze] OpenAI error', err?.message || err)
    return { statusCode: 502, body: JSON.stringify({ error: 'Model request failed' }), headers: CORS_HEADERS }
  }

  let parsed: any
  try {
    parsed = JSON.parse(rawText)
  } catch (e: any) {
    console.error('[screen-analyze] parse error', e?.message)
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to parse model output' }), headers: CORS_HEADERS }
  }

  // Validate and enforce overall_pass
  const safe = MovementKPIsZ.safeParse(parsed)
  if (!safe.success) {
    console.error('[screen-analyze] schema error', safe.error.flatten())
    return { statusCode: 502, body: JSON.stringify({ error: 'Model returned invalid JSON' }), headers: CORS_HEADERS }
  }
  const analysis = safe.data
  if (overrideVariation) {
    (analysis as any).detected_variation_original = analysis.detected_variation
    ;(analysis as any).coach_variation_override = overrideVariation
    ;(analysis as any).detected_variation = overrideVariation
  }
  const passCount = analysis.kpis.filter((k) => k.pass === true).length
  const serverOverallPass = passCount >= 3
  if (analysis.overall_pass !== serverOverallPass) {
    (analysis as any).overall_pass = serverOverallPass
  }

  // Estimate duration from frames (4 fps)
  const clip_duration_s_est = Math.round((Math.min(framesLimited.length, 20) / 4) * 10) / 10

  return {
    statusCode: 200,
    body: JSON.stringify({
      clientId,
      coachId,
      pattern,
      camera_view: cameraView,
      storage_path: storagePath,
      frames_sent: framesLimited.length,
      clip_duration_s_est,
      analysis,
    }),
    headers: CORS_HEADERS,
  }
}

export { handler }
