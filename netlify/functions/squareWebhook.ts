import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK_SECRET = process.env.SQUARE_WEBHOOK_SECRET || process.env.VITE_SQUARE_WEBHOOK_SECRET
const WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || process.env.VITE_SQUARE_WEBHOOK_SIGNATURE_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

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

// Extract invoice info from common Square webhook shapes without assuming a specific schema version
const extractInvoicePayload = (body: any) => {
  // Square commonly nests under body.data.object.invoice
  const invoice = body?.data?.object?.invoice || body?.data?.object || body?.invoice || null
  if (!invoice) return null
  const id: string | null = invoice.id ?? null
  const status: string | null = invoice.status ?? null
  const number: string | null = invoice.invoice_number ?? invoice.invoiceNumber ?? null
  const publicUrl: string | null = invoice.public_url ?? invoice.publicUrl ?? null
  return { id, status, number, publicUrl }
}

// Payment webhook may include the related invoice id
const extractPaymentInvoiceId = (body: any) => {
  const payment = body?.data?.object?.payment || body?.payment || null
  if (!payment) return null
  return payment.invoice_id || payment.invoiceId || null
}

const safeEqual = (a: string, b: string) => {
  const abuf = Buffer.from(a)
  const bbuf = Buffer.from(b)
  if (abuf.length !== bbuf.length) return false
  return crypto.timingSafeEqual(abuf, bbuf)
}

const buildRawUrl = (event: any) => {
  if (event.rawUrl) return event.rawUrl as string
  const proto = event.headers?.['x-forwarded-proto'] || event.headers?.['x-forwarded-protocol'] || 'https'
  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || 'localhost'
  const path = event.path || '/.netlify/functions/squareWebhook'
  const qs = event.rawQuery || event.rawQueryString || (event.queryStringParameters
    ? Object.entries(event.queryStringParameters)
        .map(([k, v]) => `${encodeURIComponent(String(k))}=${encodeURIComponent(String(v ?? ''))}`).join('&')
    : '')
  return qs ? `${proto}://${host}${path}?${qs}` : `${proto}://${host}${path}`
}

const getRawBody = (event: any): string => {
  if (!event || typeof event.body !== 'string') return ''
  if (event.isBase64Encoded) {
    try {
      return Buffer.from(event.body, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
  return event.body
}

const verifySquareSignature = (event: any, signatureKey: string) => {
  try {
    const rawUrl = buildRawUrl(event)
    const body = getRawBody(event)

    // Square historically used x-square-signature (HMAC-SHA1) and now supports x-square-hmacsha256-signature
    const sigSha256 = event.headers?.['x-square-hmacsha256-signature'] || event.headers?.['X-Square-Hmacsha256-Signature']
    const sigLegacy = event.headers?.['x-square-signature'] || event.headers?.['X-Square-Signature']

    // Compute expected signatures
    const base = rawUrl + body
    const expected256 = crypto.createHmac('sha256', signatureKey).update(base).digest('base64')
    const expectedSha1 = crypto.createHmac('sha1', signatureKey).update(base).digest('base64')

    if (sigSha256 && safeEqual(sigSha256, expected256)) return true
    if (sigLegacy && safeEqual(sigLegacy, expectedSha1)) return true
    return false
  } catch {
    return false
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: 'OK', headers: CORS_HEADERS }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST for webhook' }), headers: CORS_HEADERS }
  }
  if (!supabaseAdmin) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase admin not configured' }), headers: CORS_HEADERS }
  }

  try {
    // Prefer HMAC verification if a signature key is configured; otherwise fall back to shared secret
    if (WEBHOOK_SIGNATURE_KEY) {
      const ok = verifySquareSignature(event, WEBHOOK_SIGNATURE_KEY)
      if (!ok) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }), headers: CORS_HEADERS }
      }
    } else {
      const secretOk = WEBHOOK_SECRET && event.queryStringParameters?.secret === WEBHOOK_SECRET
      if (!secretOk) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }), headers: CORS_HEADERS }
      }
    }

    let body: any = null
    try {
      body = JSON.parse(getRawBody(event) || '{}')
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }), headers: CORS_HEADERS }
    }

    // Try to handle invoice-style webhook first
    const invoicePayload = extractInvoicePayload(body)
    let processed = 0

    if (invoicePayload?.id) {
      const updates: any = {}
      if (invoicePayload.number) updates.square_invoice_number = invoicePayload.number
      if (invoicePayload.publicUrl) updates.square_public_url = invoicePayload.publicUrl
      const normalized = normalizeStatus(invoicePayload.status)
      if (normalized) updates.status = normalized

      if (Object.keys(updates).length > 0) {
        const { data: rows, error: findErr } = await supabaseAdmin
          .from('contract_invoice_instances')
          .select('id, contract_id, participant_contract_id')
          .eq('square_invoice_id', invoicePayload.id)
        if (findErr) throw findErr

        for (const row of rows ?? []) {
          const { error: upErr } = await supabaseAdmin
            .from('contract_invoice_instances')
            .update(updates)
            .eq('id', row.id)
          if (!upErr) {
            processed += 1
            if (normalized === 'paid' || normalized === 'sent') {
              let displayName: string | null = null
              const { data: p } = await supabaseAdmin
                .from('participant_contracts')
                .select('participant_name')
                .eq('id', row.participant_contract_id)
                .maybeSingle()
              displayName = p?.participant_name ?? null
              if (!displayName) {
                const { data: c } = await supabaseAdmin
                  .from('contracts')
                  .select('customer_name')
                  .eq('id', row.contract_id)
                  .maybeSingle()
                displayName = c?.customer_name ?? null
              }
              const who = displayName?.trim() || 'Client'
              const invNum = invoicePayload.number ?? null
              const message = normalized === 'paid'
                ? `${who} has paid Invoice ${invNum ? `#${invNum}` : ''}`.trim()
                : `${who}'s Invoice ${invNum ? `#${invNum}` : ''} sent`.trim()

              await supabaseAdmin
                .from('invoice_notifications')
                .upsert({
                  invoice_instance_id: row.id,
                  contract_id: row.contract_id,
                  status: normalized,
                  message,
                  metadata: { square_invoice_id: invoicePayload.id, square_invoice_number: invoicePayload.number } as any,
                }, { onConflict: 'invoice_instance_id,status' })
            }
          }
        }
      }
    } else {
      // Try payment webhook path: mark invoice as paid
      const invoiceId = extractPaymentInvoiceId(body)
      if (invoiceId) {
        const { data: rows, error: findErr } = await supabaseAdmin
          .from('contract_invoice_instances')
          .select('id, contract_id, participant_contract_id')
          .eq('square_invoice_id', invoiceId)
        if (findErr) throw findErr

        for (const row of rows ?? []) {
          const { error: upErr } = await supabaseAdmin
            .from('contract_invoice_instances')
            .update({ status: 'paid' })
            .eq('id', row.id)
          if (!upErr) {
            processed += 1
            await supabaseAdmin
              .from('invoice_notifications')
              .upsert({
                invoice_instance_id: row.id,
                contract_id: row.contract_id,
                status: 'paid',
                message: 'Client has paid invoice',
                metadata: { square_invoice_id: invoiceId } as any,
              }, { onConflict: 'invoice_instance_id,status' })
          }
        }
      }
    }

    if (processed > 0) {
      console.log('[squareWebhook] processed updates:', processed)
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }), headers: CORS_HEADERS }
  } catch (error: any) {
    console.error('[squareWebhook] error', error)
    return { statusCode: 500, body: JSON.stringify({ error: error?.message || 'Unknown error' }), headers: CORS_HEADERS }
  }
}

export { handler }
