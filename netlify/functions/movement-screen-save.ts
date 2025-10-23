import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn('[movement-screen-save] Missing Supabase env vars; requests will fail with 500 until configured.')
}

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }), headers: CORS_HEADERS }
  }
  if (!supabaseAdmin) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase admin client not configured' }), headers: CORS_HEADERS }
  }

  try {
    const body = JSON.parse(event.body || '{}') as any
    const { clientId, pattern, featurePayload, analysis, coachAnalysis, cameraView, storageKey, clipDuration } = body

    if (!clientId || typeof clientId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'clientId required' }), headers: CORS_HEADERS }
    }
    if (!pattern || typeof pattern !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'pattern required' }), headers: CORS_HEADERS }
    }
    if (!featurePayload || typeof featurePayload !== 'object') {
      return { statusCode: 400, body: JSON.stringify({ error: 'featurePayload required' }), headers: CORS_HEADERS }
    }
    if (!analysis || typeof analysis !== 'object' || !Array.isArray(analysis.kpis)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'analysis result required' }), headers: CORS_HEADERS }
    }

    const analysisPassCount = Array.isArray(analysis?.kpis)
      ? (analysis.kpis as any[]).filter((k) => !!k.pass).length
      : 0
    const overallPass = typeof coachAnalysis?.overall_pass === 'boolean'
      ? coachAnalysis.overall_pass
      : analysisPassCount >= 3

    const detectedVariation = coachAnalysis?.detected_variation
      ?? analysis?.coach_variation_override
      ?? analysis?.detected_variation
      ?? null
    const detectedVariationOriginal = coachAnalysis?.detected_variation_original
      ?? analysis?.detected_variation_original
      ?? null
    const coachVariationOverride = coachAnalysis?.coach_variation_override
      ?? analysis?.coach_variation_override
      ?? null

    const repInsights = (analysis?.rep_insights && Array.isArray(analysis.rep_insights))
      ? analysis.rep_insights
      : undefined
    const repSummary = analysis?.rep_summary ?? undefined

    const { data: screenData, error: screenError } = await supabaseAdmin
      .from('movement_screen')
      .insert({
        client_id: clientId,
        pattern,
        detected_variation: detectedVariation,
        detected_variation_original: detectedVariationOriginal,
        coach_variation_override: coachVariationOverride,
        camera_view: cameraView ?? null,
        overall_score_0_3: analysis.overall_score_0_3 ?? 0,
        overall_pass: overallPass,
        priority_order: analysis.priority_order ?? [],
        priority_json: coachAnalysis?.priority_order ?? analysis.priority_order ?? [],
        gemini_json: analysis,
        model_json: coachAnalysis ?? null,
        storage_path: storageKey ?? null,
        clip_duration_s: typeof clipDuration === 'number' ? Math.round(clipDuration) : null,
        rep_summary_json: repSummary ?? null,
        rep_insights_json: repInsights ?? null,
      })
      .select('id')
      .single()

    if (screenError || !screenData) {
      console.error('[movement-screen-save] insert screen error', screenError)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to store movement screen' }), headers: CORS_HEADERS }
    }

    const screenId = screenData.id

    const kpiRows = (analysis.kpis as any[]).map((kpi, idx) => ({
      screen_id: screenId,
      client_id: clientId,
      key: kpi.key,
      kpi_name: (coachAnalysis?.kpis?.[idx]?.name) ?? null,
      pass: !!kpi.pass,
      pass_original: typeof kpi.pass_original === 'boolean' ? kpi.pass_original : !!kpi.pass,
      pass_override: typeof kpi.pass_override === 'boolean' ? kpi.pass_override : null,
      score_0_3: kpi.score_0_3 ?? 0,
      why: kpi.why ?? '',
      cues: kpi.cues ?? [],
      frame_refs: (coachAnalysis?.kpis?.[idx]?.frame_refs) ? JSON.stringify(coachAnalysis.kpis[idx].frame_refs) : null,
      regression: kpi.regression ?? null,
      progression: kpi.progression ?? null,
      confidence: kpi.confidence ?? 0,
    }))

    const { error: kpiError } = await supabaseAdmin.from('movement_kpi_logs').insert(kpiRows)
    if (kpiError) {
      console.error('[movement-screen-save] insert kpis error', kpiError)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to store KPI rows' }), headers: CORS_HEADERS }
    }

    const { error: featuresError } = await supabaseAdmin.from('movement_features_raw').insert({
      screen_id: screenId,
      feature_payload: featurePayload,
      thumbnails: featurePayload.thumbnails ?? null,
    })
    if (featuresError) {
      console.warn('[movement-screen-save] features insert warning', featuresError)
    }

    if (storageKey && typeof storageKey === 'string') {
      const { error: clipErr } = await supabaseAdmin.from('movement_clips').insert({
        screen_id: screenId,
        storage_path: storageKey,
        duration_s: typeof clipDuration === 'number' ? clipDuration : null,
        fps: 4
      })
      if (clipErr) {
        console.warn('[movement-screen-save] clip insert warning', clipErr)
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'saved', screenId }),
      headers: CORS_HEADERS,
    }
  } catch (error: any) {
    console.error('[movement-screen-save] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error' }), headers: CORS_HEADERS }
  }
}

export { handler }
