import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { squareFetch } from './square'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn('[syncInvoices] Missing Supabase env vars; function will return 500 if invoked')
}

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

type ContractInvoiceInstance = {
  id: string
  contract_id: string
  square_invoice_id: string | null
  square_invoice_number: string | null
  square_public_url: string | null
  status: string
}

type SquareInvoice = {
  id?: string
  invoice_number?: string
  status?: string
  public_url?: string
}

const normalizeStatus = (value?: string | null) => {
  if (!value) return null
  const lower = value.toLowerCase()
  switch (lower) {
    case 'paid':
      return 'paid'
    case 'partially_paid':
      return 'partially_paid'
    case 'canceled':
      return 'cancelled'
    case 'draft':
      return 'draft'
    case 'scheduled':
    case 'unpaid':
    default:
      return lower
  }
}

const handler: Handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST to trigger invoice sync' }), headers: CORS_HEADERS }
  }

  if (!supabaseAdmin) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase admin client not configured' }), headers: CORS_HEADERS }
  }

  try {
    const { data: invoiceRows, error: fetchError } = await supabaseAdmin
      .from('contract_invoice_instances')
      .select('id, contract_id, square_invoice_id, square_invoice_number, square_public_url, status')
      .or('square_invoice_number.is.null,status.neq.paid')

    if (fetchError) {
      throw fetchError
    }

    const rows = (invoiceRows ?? []).filter((row): row is ContractInvoiceInstance => !!row.square_invoice_id)

    if (rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, updated: 0, message: 'No invoices required syncing.' }),
        headers: CORS_HEADERS,
      }
    }

    const invoiceIds = [...new Set(rows.map(row => row.square_invoice_id!).filter(Boolean))]
    const invoiceMeta = new Map<string, SquareInvoice>()
    const fetchErrors: { id: string; reason: string }[] = []

    for (const invoiceId of invoiceIds) {
      try {
        const response = (await squareFetch(`/v2/invoices/${invoiceId}`, { method: 'GET' })) as { invoice?: SquareInvoice; errors?: any[] }
        if (response?.invoice?.id) {
          invoiceMeta.set(response.invoice.id, response.invoice)
        } else if (Array.isArray(response?.errors) && response.errors.length > 0) {
          const first = response.errors[0]
          fetchErrors.push({ id: invoiceId, reason: first?.detail ?? first?.code ?? 'Unknown fetch error' })
        } else {
          fetchErrors.push({ id: invoiceId, reason: 'Invoice missing from response' })
        }
      } catch (error: any) {
        const detail = Array.isArray(error?.errors) && error.errors[0]?.detail ? error.errors[0].detail : error?.message ?? 'Unknown fetch error'
        fetchErrors.push({ id: invoiceId, reason: detail })
      }
    }

    let updatedCount = 0
    const updateErrors: { id: string; reason: string }[] = [...fetchErrors]

    for (const row of rows) {
      const invoiceId = row.square_invoice_id!
      const invoice = invoiceMeta.get(invoiceId)
      if (!invoice) {
        updateErrors.push({ id: invoiceId, reason: 'Square invoice not retrieved' })
        continue
      }

      const invoiceNumber = invoice.invoice_number ?? null
      const invoiceStatus = normalizeStatus(invoice.status) ?? normalizeStatus(row.status)
      const publicUrl = invoice.public_url ?? row.square_public_url ?? null

      const shouldUpdateNumber = invoiceNumber && invoiceNumber !== row.square_invoice_number
      const shouldUpdateStatus = invoiceStatus && invoiceStatus !== normalizeStatus(row.status)
      const shouldUpdateUrl = publicUrl && publicUrl !== row.square_public_url

      if (!shouldUpdateNumber && !shouldUpdateStatus && !shouldUpdateUrl) continue

      const updates: Partial<ContractInvoiceInstance> = {}
      if (shouldUpdateNumber) updates.square_invoice_number = invoiceNumber
      if (shouldUpdateStatus) updates.status = invoiceStatus!
      if (shouldUpdateUrl) updates.square_public_url = publicUrl

      const { error: updateError } = await supabaseAdmin
        .from('contract_invoice_instances')
        .update(updates)
        .eq('id', row.id)

      if (updateError) {
        updateErrors.push({ id: invoiceId, reason: updateError.message })
      } else {
        updatedCount += 1
        // Best-effort: enqueue a notification if status changed to sent/paid (trigger may also insert)
        if (shouldUpdateStatus && (invoiceStatus === 'paid' || invoiceStatus === 'sent')) {
          // Resolve a display name: participant name (if any) else contract customer_name
          let displayName: string | null = null
          if (row as any && (row as any).participant_contract_id) {
            const { data: p, error: pErr } = await supabaseAdmin!
              .from('participant_contracts')
              .select('participant_name, contract_id')
              .eq('id', (row as any).participant_contract_id)
              .maybeSingle()
            if (!pErr) displayName = p?.participant_name ?? null
          }
          if (!displayName) {
            const { data: c, error: cErr } = await supabaseAdmin!
              .from('contracts')
              .select('customer_name')
              .eq('id', row.contract_id)
              .maybeSingle()
            if (!cErr) displayName = c?.customer_name ?? null
          }

          const invNum = invoiceNumber ?? row.square_invoice_number ?? null
          const who = displayName?.trim() || 'Client'
          const message = invoiceStatus === 'paid'
            ? `${who} has paid Invoice ${invNum ? `#${invNum}` : ''}`.trim()
            : `${who}'s Invoice ${invNum ? `#${invNum}` : ''} sent`.trim()
          await supabaseAdmin
            .from('invoice_notifications')
            .upsert({
              invoice_instance_id: row.id,
              contract_id: row.contract_id,
              status: invoiceStatus,
              message,
              metadata: {
                square_invoice_id: invoiceId,
                square_invoice_number: invoiceNumber,
              } as any,
            }, { onConflict: 'invoice_instance_id,status' })
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: updatedCount, errors: updateErrors }),
      headers: CORS_HEADERS,
    }
  } catch (error: any) {
    console.error('[syncInvoices]', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message ?? 'Unknown error' }),
      headers: CORS_HEADERS,
    }
  }
}

export { handler }
