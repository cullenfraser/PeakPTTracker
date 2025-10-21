import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

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

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

function sleepTo0_4(hours: number | null | undefined) {
  if (hours == null || isNaN(hours as any)) return 2
  if (hours >= 8) return 4
  if (hours >= 7) return 3
  if (hours >= 6) return 2
  if (hours >= 5) return 1
  return 0
}

function isoRange(from?: string | null, to?: string | null): string[] {
  const out: string[] = []
  if (!from || !to) return out
  const start = new Date(from)
  const end = new Date(to)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out
  // normalize to midnight
  start.setHours(0,0,0,0)
  end.setHours(0,0,0,0)
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0,10))
  }
  return out
}

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
    const clientId: string | null = body.client_id || body.clientId || null
    if (!clientId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'client_id required' }), headers: CORS_HEADERS }
    }

    const cadence = String(body.cadence || 'monthly')
    const monthLabel: string | null = body.month_label || null
    const trainerName: string | null = body.trainer_name || null

    const energy_0_4 = clamp(Number(body.energy_0_4 ?? 0), 0, 4)
    const soreness_0_4 = clamp(Number(body.soreness_0_4 ?? 0), 0, 4)
    const sleep_hours = body.sleep_hours == null ? null : Number(body.sleep_hours)
    const stress_0_4 = clamp(Number(body.stress_0_4 ?? 0), 0, 4)

    const sessions_planned = body.sessions_planned == null ? null : Number(body.sessions_planned)
    const sessions_done = body.sessions_done == null ? null : Number(body.sessions_done)
    const attendance_pct = body.attendance_pct == null ? (sessions_planned ? Math.round(((sessions_done||0) / sessions_planned) * 100) : null) : Number(body.attendance_pct)

    const inbody_json = body.inbody_json || {}
    const weight_kg = body.weight_kg == null ? null : Number(body.weight_kg)
    const body_fat_pct = inbody_json.body_fat_pct == null ? null : Number(inbody_json.body_fat_pct)
    const skeletal_muscle_kg = inbody_json.skeletal_muscle_kg == null ? null : Number(inbody_json.skeletal_muscle_kg)
    const waist_cm = inbody_json.waist_cm == null ? null : Number(inbody_json.waist_cm)

    const vitals_json = body.vitals_json || {}
    const bp_sys = vitals_json.bp_sys == null ? null : Number(vitals_json.bp_sys)
    const bp_dia = vitals_json.bp_dia == null ? null : Number(vitals_json.bp_dia)
    const resting_hr = vitals_json.resting_hr == null ? null : Number(vitals_json.resting_hr)

    const grip_best_kg = body.grip_best_kg == null ? null : Number(body.grip_best_kg)

    const win_text: string | null = body.win_text || null
    const blocker_text: string | null = body.blocker_text || null
    const trainer_notes: string | null = body.trainer_notes || null

    // Compute readiness 0-100
    const sleep0_4 = sleepTo0_4(sleep_hours)
    const readiness_0_4 = (energy_0_4 + (4 - stress_0_4) + (4 - soreness_0_4) + sleep0_4) / 4
    const readiness_0_100 = Math.round(readiness_0_4 * 25)

    // Compute W:H if height available on clients table
    let waist_to_height: number | null = null
    try {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('height_cm')
        .eq('id', clientId)
        .maybeSingle()
      const height_cm = clientRow?.height_cm as number | undefined
      if (height_cm && waist_cm) waist_to_height = Number((waist_cm / height_cm).toFixed(2))
    } catch {}

    // Insert checkin
    const flags: any[] = []
    if (readiness_0_100 < 55) flags.push({ type: 'low_readiness', severity: 'warn', message: 'Low readiness this month' })
    if (attendance_pct != null && attendance_pct < 60) flags.push({ type: 'low_attendance', severity: 'warn', message: 'Attendance under 60%' })
    try {
      const goals = Array.isArray(body.goals_update) ? body.goals_update : []
      if (goals.some((g:any) => g?.status === 'at_risk')) {
        flags.push({ type: 'goal_at_risk', severity: 'info', message: 'One or more goals are at risk' })
      }
    } catch {}
    try {
      const kf = body.kpi_followups || {}
      const anyWorse = Object.values(kf).some((v:any) => v?.answer === 'worse')
      if (anyWorse) flags.push({ type: 'kpi_persist_fail', severity: 'info', message: 'Some movement KPIs worsened' })
    } catch {}

    // Check repeated low readiness (prior month <55)
    try {
      const { data: prev } = await supabaseAdmin
        .from('checkins')
        .select('readiness_0_100')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(1)
      if (Array.isArray(prev) && prev.length > 0) {
        const prior = Number(prev[0].readiness_0_100)
        if (readiness_0_100 < 55 && isFinite(prior) && prior < 55) {
          flags.push({ type: 'low_readiness_repeat', severity: 'warn', message: 'Repeated low readiness across months' })
        }
      }
    } catch {}

    const { data: checkinsData, error: checkinsErr } = await supabaseAdmin
      .from('checkins')
      .insert({
        client_id: clientId,
        cadence,
        month_label: monthLabel,
        trainer_name: trainerName,
        energy_0_4,
        soreness_0_4,
        sleep_hours,
        stress_0_4,
        sessions_planned,
        sessions_done,
        attendance_pct,
        goals_update: body.goals_update ?? null,
        pillars_json: body.pillars_json ?? null,
        parq_changes: body.parq_changes ?? null,
        kpi_followups: body.kpi_followups ?? null,
        weight_kg,
        inbody_json: { body_fat_pct, skeletal_muscle_kg, waist_cm, waist_to_height },
        vitals_json: { bp_sys, bp_dia, resting_hr },
        grip_best_kg,
        next_month_planned_sessions: body.next_month_planned_sessions ?? null,
        schedule_changes: body.schedule_changes ?? null,
        win_text,
        blocker_text,
        trainer_notes,
        readiness_0_100: readiness_0_100,
        flags
      })
      .select('id')
      .single()

    if (checkinsErr || !checkinsData) {
      console.error('[checkins-create] insert error', checkinsErr)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save checkin' }), headers: CORS_HEADERS }
    }

    // Apply scheduling changes to calendar sessions (cancel and hide from calendar)
    try {
      const sc = body.schedule_changes || null
      if (sc) {
        const dates = new Set<string>()
        if (sc.vacation_on && sc.vacation_from && sc.vacation_to) {
          for (const d of isoRange(sc.vacation_from, sc.vacation_to)) dates.add(d)
        }
        if (!sc.vacation_on && Array.isArray(sc.missed_dates)) {
          for (const raw of sc.missed_dates) {
            const d = typeof raw === 'string' ? raw : null
            if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) dates.add(d)
          }
        }
        if (dates.size > 0) {
          // Resolve related contract IDs by client email (as used elsewhere)
          const { data: clientRow } = await supabaseAdmin
            .from('clients')
            .select('email')
            .eq('id', clientId)
            .maybeSingle()
          const clientEmail = (clientRow?.email || '').toLowerCase()
          const contractIds = new Set<string>()
          if (clientEmail) {
            try {
              const { data: byCustomer } = await supabaseAdmin
                .from('contracts')
                .select('id')
                .eq('customer_email', clientEmail)
              for (const r of byCustomer ?? []) contractIds.add(r.id)
            } catch {}
            try {
              const { data: byParticipant } = await supabaseAdmin
                .from('contracts')
                .select('id, participant_contracts!inner(participant_email)')
                .eq('participant_contracts.participant_email', clientEmail)
              for (const r of byParticipant ?? []) contractIds.add(r.id)
            } catch {}
          }
          if (contractIds.size > 0) {
            const dateList = Array.from(dates)
            // Cancel any scheduled sessions on these dates
            const { error: updErr } = await supabaseAdmin
              .from('training_sessions')
              .update({ status: 'cancelled' })
              .in('contract_id', Array.from(contractIds))
              .in('session_date', dateList)
              .eq('status', 'scheduled')
            if (updErr) console.warn('[checkins-create] schedule_changes update error', updErr.message)
          }
        }
      }
    } catch (e) {
      console.warn('[checkins-create] schedule_changes apply error', (e as any)?.message)
    }

    // Append to history tables
    if (weight_kg != null || body_fat_pct != null || skeletal_muscle_kg != null || waist_cm != null || waist_to_height != null) {
      try {
        await supabaseAdmin.from('inbody_history').insert({
          client_id: clientId,
          weight_kg,
          body_fat_pct,
          skeletal_muscle_kg,
          waist_cm,
          waist_to_height
        })
      } catch {}
    }
    if (bp_sys != null || bp_dia != null || resting_hr != null) {
      try {
        await supabaseAdmin.from('vitals').insert({
          client_id: clientId,
          bp_sys,
          bp_dia,
          resting_hr
        })
      } catch {}
    }
    if (grip_best_kg != null) {
      try { await supabaseAdmin.from('grip_tests').insert({ client_id: clientId, best_kg: grip_best_kg }) } catch {}
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id: checkinsData.id, readiness_0_100 }),
      headers: CORS_HEADERS
    }
  } catch (error: any) {
    console.error('[checkins-create] Error', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error' }), headers: CORS_HEADERS }
  }
}

export { handler }
