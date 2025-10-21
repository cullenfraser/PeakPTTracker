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
    const applyToPlan: boolean = !!payload?.applyToPlan
    if (!clientId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'clientId is required' }), headers: CORS_HEADERS }
    }

    const [sessionsRes, latestScreenRes, inbodyRes] = await Promise.all([
      supabaseAdmin
        .from('elevate_session')
        .select('id, created_at, clearance_level, ex, nu, sl, st')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabaseAdmin
        .from('movement_screen')
        .select('id, recorded_at, overall_score_0_3, movement_kpi_logs(key,pass,score_0_3,why,cues,regression,progression)')
        .eq('client_id', clientId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('inbody_history')
        .select('created_at, body_fat_pct')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(2)
    ])

    const sessionRows: any[] = Array.isArray(sessionsRes.data) ? sessionsRes.data : []
    const latestSession = sessionRows[0] ?? null
    const prevSession = sessionRows[1] ?? null
    const latestScreen = latestScreenRes.data ?? null
    const inbodyRows: any[] = Array.isArray(inbodyRes.data) ? inbodyRes.data : []

    const [{ data: latestGrip }, { data: goalsRow }] = await Promise.all([
      latestSession
        ? supabaseAdmin.from('elevate_grip').select('sum_best_kgf').eq('session_id', latestSession.id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      latestSession
        ? supabaseAdmin.from('elevate_goals').select('goal_type').eq('session_id', latestSession.id).maybeSingle()
        : Promise.resolve({ data: null } as any)
    ])

    const safeNumber = (value: any) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

    const clearance = (latestSession?.clearance_level as string | null) ?? null
    const safetyStatus = clearance === 'cleared_all' ? 'clear' : clearance === 'needs_clearance' ? 'needs_clearance' : clearance ? 'watch' : 'unknown'

    const habitScores = [latestSession?.ex, latestSession?.nu, latestSession?.sl, latestSession?.st]
      .map((v) => (typeof v === 'number' ? v : null))
      .filter((v): v is number => v !== null)
    const habitsPct = habitScores.length ? Math.round((habitScores.reduce((a, b) => a + b, 0) / habitScores.length) * 25) : null

    let gripDeltaPct: number | null = null
    if (latestSession && prevSession) {
      const { data: prevGrip } = await supabaseAdmin.from('elevate_grip').select('sum_best_kgf').eq('session_id', prevSession.id).maybeSingle()
      const currentGrip = safeNumber(latestGrip?.sum_best_kgf)
      const priorGrip = safeNumber(prevGrip?.sum_best_kgf)
      if (currentGrip != null && priorGrip != null && priorGrip !== 0) {
        gripDeltaPct = ((currentGrip - priorGrip) / priorGrip) * 100
      }
    }

    let bodyCompDelta: number | null = null
    if (inbodyRows.length >= 2) {
      const current = safeNumber(inbodyRows[0]?.body_fat_pct)
      const prior = safeNumber(inbodyRows[1]?.body_fat_pct)
      if (current != null && prior != null) {
        bodyCompDelta = current - prior
      }
    }

    const kpis: any[] = Array.isArray((latestScreen as any)?.movement_kpi_logs) ? (latestScreen as any).movement_kpi_logs : []
    const failing: any[] = kpis.filter((k: any) => !k.pass)
    const orderedByScore: any[] = [...kpis].sort((a: any, b: any) => (safeNumber(a.score_0_3) ?? 99) - (safeNumber(b.score_0_3) ?? 99))
    const topPriorities = orderedByScore.slice(0, 3).map((k: any) => k.key)

    const tiles = {
      safety: {
        status: safetyStatus,
        notes: null
      },
      goals: {
        status: goalsRow?.goal_type ? 'active' : 'Not set',
        notes: null
      },
      habits: {
        consistency_pct: habitsPct,
        commentary: null
      },
      grip: {
        delta_pct: gripDeltaPct,
        commentary: null
      },
      body_comp: {
        delta: bodyCompDelta,
        commentary: null
      },
      movement: {
        quality_score: safeNumber(latestScreen?.overall_score_0_3),
        priorities: topPriorities,
        failing_kpis: failing.map((k: any) => ({ key: k.key, why: k.why ?? null, cues: Array.isArray(k.cues) ? k.cues : [] }))
      }
    }

    const plan = applyToPlan
      ? {
          actions: topPriorities.map((kpiKey: string) => ({
            kpi: kpiKey,
            focus: failing.find((k: any) => k.key === kpiKey)?.why ?? 'Reinforce fundamentals',
            regression: null,
            progression: null
          })),
          notes: null
        }
      : null

    const priorities = {
      highlights: topPriorities,
      rationale: failing.slice(0, 3).map((k: any) => ({ key: k.key, why: k.why ?? 'Focus next', cues: Array.isArray(k.cues) ? k.cues : [] }))
    }

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('elevation_map_snapshots')
      .insert({ client_id: clientId, tiles, priorities, plan })
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
