import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export const config = {
  schedule: '0 9 * * *' // Run daily at 09:00 UTC; Netlify Scheduled Functions
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const handler: Handler = async () => {
  if (!supabaseAdmin) {
    return { statusCode: 500, body: 'Supabase admin not configured' }
  }
  try {
    // Pull latest checkins ordered by date desc
    const { data: rows, error } = await supabaseAdmin
      .from('checkins')
      .select('client_id,date')
      .order('date', { ascending: false })

    if (error) throw error
    if (!rows || rows.length === 0) return { statusCode: 200, body: 'No checkins' }

    const seen = new Set<string>()
    const lastByClient: Record<string, string> = {}
    for (const r of rows as any[]) {
      const cid = r.client_id as string
      if (!cid) continue
      if (seen.has(cid)) continue
      seen.add(cid)
      lastByClient[cid] = r.date
    }

    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000

    for (const [clientId, lastISO] of Object.entries(lastByClient)) {
      const lastMs = new Date(lastISO).getTime()
      const days = (now - lastMs) / DAY
      if (days < 28) continue

      // Avoid duplicate recent reminders (past 7 days)
      const { data: existing } = await supabaseAdmin
        .from('alerts')
        .select('id,date')
        .eq('client_id', clientId)
        .eq('type', 'pulse_reminder')
        .eq('resolved', false)
        .order('date', { ascending: false })
        .limit(1)

      let skip = false
      if (existing && existing.length > 0) {
        const lastAlertMs = new Date(existing[0].date).getTime()
        if ((now - lastAlertMs) / DAY < 7) skip = true
      }
      if (skip) continue

      await supabaseAdmin.from('alerts').insert({
        client_id: clientId,
        type: 'pulse_reminder',
        severity: 'info',
        message: 'Time for this month\'s Pulse check-in.'
      })
    }

    return { statusCode: 200, body: 'OK' }
  } catch (err) {
    console.error('[pulse-scheduler] error', err)
    return { statusCode: 500, body: 'Error' }
  }
}

export { handler }
