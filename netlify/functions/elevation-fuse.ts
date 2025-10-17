import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn('[elevation-fuse] Missing Supabase env vars; requests will fail until configured.')
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
    const payload = JSON.parse(event.body || '{}') as any
    const clientId: string | undefined = payload?.clientId
    const screenId: string | undefined = payload?.screenId
    const applyToPlan: boolean = !!payload?.applyToPlan
    if (!clientId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'clientId is required' }), headers: CORS_HEADERS }
    }

    const [{ data: consultData, error: consultError }, { data: screenData, error: screenError }] = await Promise.all([
      supabaseAdmin.from('elevate_sessions').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin
        .from('movement_screen')
        .select('*, movement_kpi_logs(*), movement_features_raw(feature_payload)')
        .eq('client_id', clientId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (consultError) {
      console.error('[elevation-fuse] consult fetch error', consultError)
    }
    if (screenError) {
      console.error('[elevation-fuse] screen fetch error', screenError)
    }

    const latestScreen = screenData ?? null
    const latestConsult = consultData ?? null

    if (!latestScreen && !latestConsult) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No consult or movement data found' }), headers: CORS_HEADERS }
    }

    const safeNumber = (value: any) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const screenOverall = safeNumber(latestScreen?.overall_score_0_3) ?? null
    const screenPriorityOrder = Array.isArray(latestScreen?.priority_order) ? latestScreen?.priority_order : []
    const kpiLogs = Array.isArray(latestScreen?.movement_kpi_logs) ? latestScreen?.movement_kpi_logs : []

    const movementQuality = screenOverall !== null ? Math.min(Math.max(screenOverall, 0), 3) : null
    const topPriorities = screenPriorityOrder.slice(0, 3)
    const failingKpis = kpiLogs.filter((kpi: any) => !kpi.pass)

    const consultSafety = latestConsult?.safety_status ?? 'unknown'
    const consultHabits = safeNumber(latestConsult?.habit_consistency_pct)
    const consultGripDelta = safeNumber(latestConsult?.grip_delta_pct)
    const consultBodyCompDelta = safeNumber(latestConsult?.body_comp_delta)
    const consultGoalStatus = latestConsult?.goal_status ?? 'pending'

    const tiles = {
      safety: {
        status: consultSafety,
        notes: latestConsult?.safety_notes ?? null
      },
      goals: {
        status: consultGoalStatus,
        notes: latestConsult?.goal_notes ?? null
      },
      habits: {
        consistency_pct: consultHabits,
        commentary: latestConsult?.habit_notes ?? null
      },
      grip: {
        delta_pct: consultGripDelta,
        commentary: latestConsult?.grip_notes ?? null
      },
      body_comp: {
        delta: consultBodyCompDelta,
        commentary: latestConsult?.body_comp_notes ?? null
      },
      movement: {
        quality_score: movementQuality,
        priorities: topPriorities,
        failing_kpis: failingKpis.map((kpi: any) => ({ key: kpi.key, why: kpi.why, cues: kpi.cues }))
      }
    }

    const plan = applyToPlan
      ? {
          actions: topPriorities.map((kpiKey: string) => ({
            kpi: kpiKey,
            focus: failingKpis.find((kpi: any) => kpi.key === kpiKey)?.why ?? 'Reinforce fundamentals',
            regression: failingKpis.find((kpi: any) => kpi.key === kpiKey)?.regression ?? null,
            progression: failingKpis.find((kpi: any) => kpi.key === kpiKey)?.progression ?? null
          })),
          notes: latestConsult?.plan_notes ?? null
        }
      : null

    const priorities = {
      highlights: topPriorities,
      rationale: failingKpis.slice(0, 3).map((kpi: any) => ({ key: kpi.key, why: kpi.why, cues: kpi.cues }))
    }

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('elevation_map_snapshots')
      .insert({
        client_id: clientId,
        tiles,
        priorities,
        plan
      })
      .select('id, created_at')
      .single()

    if (snapshotError) {
      console.error('[elevation-fuse] snapshot insert error', snapshotError)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to store elevation snapshot' }), headers: CORS_HEADERS }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'fused',
        snapshotId: snapshot?.id,
        createdAt: snapshot?.created_at,
        tiles,
        priorities,
        plan
      }),
      headers: CORS_HEADERS
    }
  } catch (error: any) {
    console.error('[elevation-fuse] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error' }), headers: CORS_HEADERS }
  }
}

export { handler }
