import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import Busboy from 'busboy'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { analyzePatternWithFrames } from '../../server/services/screen/openaiScreenService'

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

function toMovementPattern(p: string): 'squat'|'hinge'|'push'|'pull'|'lunge'|'carry'|'core' {
  const s = (p || 'squat').toLowerCase()
  const allowed = ['squat','hinge','push','pull','lunge','carry','core'] as const
  return (allowed.includes(s as any) ? s : 'squat') as any
}

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
  const pattern = toMovementPattern(fields['pattern'] || 'squat')
  const cameraView = fields['camera_view'] || 'front'
  if (!clientId) return { statusCode: 400, body: JSON.stringify({ error: 'clientId required' }), headers: CORS_HEADERS }

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
  const entries = fs.readdirSync(dir)
    .filter((f) => f.startsWith(path.basename(base)) || f.startsWith(path.basename(base.replace(/-\d+$/, ''))))
    .filter((f) => f.includes(path.basename(base.split('/').pop() || base)))

  const frameFiles = entries
    .filter((f) => f.startsWith(path.basename(base)))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(dir, f))

  const frames: string[] = frameFiles.map((fp) => `data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}`)

  const movement = await analyzePatternWithFrames(pattern, frames)

  const SCORE_BY_STATUS: Record<'ok' | 'warn' | 'fail', 1 | 2 | 3> = { ok: 3, warn: 2, fail: 1 }
  const toTitle = (p: string): 'Squat'|'Lunge'|'Hinge'|'Push'|'Pull' => {
    const t = (p[0]?.toUpperCase() ?? 'S') + (p.slice(1) || 'quat')
    return (['Squat','Lunge','Hinge','Push','Pull'].includes(t) ? t : 'Squat') as any
  }
  const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const KPI_WHY: Record<string,(k:any)=>string> = {
    depth: (k:any)=>`Average depth at ${k.value}° versus goal ${k.target}. Stable depth indicates solid range control.`,
    knee_valgus_degrees: (k:any)=>`Average knee valgus at ${k.value}°, compared with target ${k.target}. Monitor alignment to avoid collapse.`,
    tempo_seconds: (k:any)=>`Average tempo recorded at ${k.value}s per rep against target ${k.target}s. Maintain smooth pacing.`,
    heel_contact_ratio: (k:any)=>`Heel contact ratio ${k.value} vs target ${k.target}. Consistent heel contact supports stability.`
  }
  const KPI_CUES: Record<string,string[]> = {
    depth: ['Stay patient in the bottom position','Keep brace engaged through ascent'],
    knee_valgus_degrees: ['Press knees out over toes','Maintain even foot pressure'],
    tempo_seconds: ['Match eccentric and concentric rhythm','Keep breathing rhythm steady'],
    heel_contact_ratio: ['Drive through mid-foot and heel','Avoid rocking forward onto toes']
  }
  const analysis = {
    pattern: toTitle(movement.pattern),
    overall_score_0_3: movement.pass_fail === 'pass' ? 3 : 1,
    priority_order: movement.kpis.map((k:any)=>k.name),
    kpis: movement.kpis.map((k:any)=>({
      key: slugify(k.name),
      pass: String(k.status).toLowerCase() === 'ok',
      pass_original: String(k.status).toLowerCase() === 'ok',
      pass_override: null,
      score_0_3: SCORE_BY_STATUS[String(k.status).toLowerCase() as 'ok'|'warn'|'fail'],
      why: KPI_WHY[slugify(k.name)]?.(k) ?? `Result ${k.status} vs target ${k.target}. Recorded ${k.value}.`,
      cues: KPI_CUES[slugify(k.name)] ?? [],
      regression: null,
      progression: null,
      confidence: 0.5
    }) )
  }

  const ext = fileMime.includes('mp4') ? 'mp4' : 'webm'
  const storageKey = `clips/${clientId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .upload(storageKey, fs.readFileSync(filePath), { contentType: fileMime || `video/${ext}`, upsert: true })
  if (uploadErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Upload failed', detail: uploadErr.message }), headers: CORS_HEADERS }
  }

  const durationEstimate = Math.min(frames.length, 20) / 4

  return {
    statusCode: 200,
    body: JSON.stringify({
      clientId,
      coachId,
      pattern,
      camera_view: cameraView,
      storageKey,
      clip_duration_s_est: durationEstimate,
      frames_count: frames.length,
      analysis,
      thumbnails: frames.slice(0, 4) // sample a few for previews if desired
    }),
    headers: CORS_HEADERS
  }
}

export { handler }
