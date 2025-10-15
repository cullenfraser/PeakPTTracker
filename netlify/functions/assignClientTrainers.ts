import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn('[assignClientTrainers] Missing Supabase env vars; function will return 500 if invoked')
}

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

type AssignmentInput = { trainer_id: string; allocated_sessions: number }

const isoToday = () => new Date().toISOString().slice(0, 10)

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
    const body = JSON.parse(event.body || '{}') as {
      clientId?: string
      assignments?: AssignmentInput[]
      updateCalendar?: boolean
      replaceAssignments?: boolean
    }

    const clientId = body.clientId?.trim()
    if (!clientId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientId' }), headers: CORS_HEADERS }
    }

    const assignments: AssignmentInput[] = Array.isArray(body.assignments) ? body.assignments : []
    const cleaned = assignments
      .filter(a => a && a.trainer_id && typeof a.allocated_sessions === 'number' && a.allocated_sessions >= 0)
      .slice(0, 3)

    // Resolve client email for contract discovery
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('email')
      .eq('id', clientId)
      .maybeSingle()
    if (clientErr) throw clientErr
    const clientEmail = clientRow?.email?.trim().toLowerCase() || null

    // Find related contract IDs (by customer_email and by participant email)
    const contractIds = new Set<string>()
    if (clientEmail) {
      const { data: byCustomer, error: c1Err } = await supabaseAdmin
        .from('contracts')
        .select('id')
        .eq('customer_email', clientEmail)
      if (c1Err) throw c1Err
      for (const r of byCustomer ?? []) contractIds.add(r.id)

      const { data: byParticipant, error: c2Err } = await supabaseAdmin
        .from('contracts')
        .select('id, participant_contracts!inner(participant_email)')
        .eq('participant_contracts.participant_email', clientEmail)
      if (c2Err) throw c2Err
      for (const r of byParticipant ?? []) contractIds.add(r.id)
    }

    // Compute remaining sessions across those contracts
    let totalSessions = 0
    if (contractIds.size > 0) {
      const ids = Array.from(contractIds)
      const { data: totals, error: totErr } = await supabaseAdmin
        .from('contracts')
        .select('id,total_sessions')
        .in('id', ids)
      if (totErr) throw totErr
      totalSessions = (totals ?? []).reduce((sum, r) => sum + (r.total_sessions || 0), 0)

      const { data: sess, error: sErr } = await supabaseAdmin
        .from('training_sessions')
        .select('contract_id, status')
        .in('contract_id', ids)
      if (sErr) throw sErr
      const completedCount = (sess ?? []).filter(s => (s.status || '').toLowerCase() === 'completed').length
      const remaining = Math.max(0, totalSessions - completedCount)

      const requested = cleaned.reduce((sum, a) => sum + (a.allocated_sessions || 0), 0)
      if (requested > remaining) {
        return { statusCode: 400, body: JSON.stringify({ error: `Requested ${requested} exceeds remaining ${remaining}` }), headers: CORS_HEADERS }
      }
    }

    // Upsert client_trainer_assignments (activate included, optionally deactivate missing)
    const today = isoToday()

    if (body.replaceAssignments) {
      // Deactivate any active not-included trainers
      const keepIds = cleaned.map(a => a.trainer_id)
      const { error: deactErr } = await supabaseAdmin
        .from('client_trainer_assignments')
        .update({ unassigned_date: today })
        .eq('client_id', clientId)
        .is('unassigned_date', null)
        .not('trainer_id', 'in', `(${keepIds.join(',') || 'null'})`)
      if (deactErr && deactErr.code !== 'PGRST116') {
        // Ignore no-rows-updated error
        throw deactErr
      }
    }

    // Ensure active assignments for provided trainers
    for (const a of cleaned) {
      // If already active, skip; else insert a new row
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('client_trainer_assignments')
        .select('id')
        .eq('client_id', clientId)
        .eq('trainer_id', a.trainer_id)
        .is('unassigned_date', null)
        .maybeSingle()
      if (exErr) throw exErr
      if (!existing) {
        const { error: insErr } = await supabaseAdmin
          .from('client_trainer_assignments')
          .insert({ client_id: clientId, trainer_id: a.trainer_id })
        if (insErr) throw insErr
      }
    }

    // Close previous active splits, insert new splits
    const { error: closeErr } = await supabaseAdmin
      .from('client_trainer_session_splits')
      .update({ effective_to: today })
      .eq('client_id', clientId)
      .is('effective_to', null)
    if (closeErr && closeErr.code !== 'PGRST116') throw closeErr

    if (cleaned.length > 0) {
      const payload = cleaned.map(a => ({ client_id: clientId, trainer_id: a.trainer_id, allocated_sessions: a.allocated_sessions }))
      const { error: insSplitErr } = await supabaseAdmin
        .from('client_trainer_session_splits')
        .insert(payload)
      if (insSplitErr) throw insSplitErr
    }

    // Optionally update upcoming calendar sessions
    let updatedSessions = 0
    if (body.updateCalendar && contractIds.size > 0 && cleaned.length > 0) {
      const ids = Array.from(contractIds)
      const todayStr = isoToday()
      const { data: upcoming, error: upErr } = await supabaseAdmin
        .from('training_sessions')
        .select('id, contract_id, session_date, start_time, trainer_id, status')
        .in('contract_id', ids)
        .gte('session_date', todayStr)
        .eq('status', 'scheduled')
      if (upErr) throw upErr

      const sessions = (upcoming ?? []).sort((a, b) => {
        const da = `${a.session_date} ${a.start_time || '00:00'}`
        const db = `${b.session_date} ${b.start_time || '00:00'}`
        return da.localeCompare(db)
      })

      const quotas = cleaned.map(a => ({ trainer_id: a.trainer_id, remaining: a.allocated_sessions }))
      let qi = 0
      for (const s of sessions) {
        // Find next trainer with remaining quota
        let tries = 0
        while (tries < quotas.length && quotas[qi].remaining <= 0) {
          qi = (qi + 1) % quotas.length
          tries += 1
        }
        if (quotas[qi].remaining <= 0) break // quotas exhausted

        const chosen = quotas[qi]
        if (s.trainer_id !== chosen.trainer_id) {
          const { error: updErr } = await supabaseAdmin
            .from('training_sessions')
            .update({ trainer_id: chosen.trainer_id })
            .eq('id', s.id)
          if (updErr) throw updErr
          updatedSessions += 1
        }
        quotas[qi].remaining -= 1
        qi = (qi + 1) % quotas.length
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: 'Assignments saved', updatedSessions }),
      headers: CORS_HEADERS,
    }
  } catch (error: any) {
    console.error('[assignClientTrainers]', error)
    return { statusCode: 500, body: JSON.stringify({ error: error?.message || 'Unknown error' }), headers: CORS_HEADERS }
  }
}

export { handler }
