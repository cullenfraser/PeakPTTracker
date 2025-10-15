import { Handler } from '@netlify/functions'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'contract-pdfs'

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const currencyFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

const formatCurrency = (value: number | null | undefined) => {
  const amount = typeof value === 'number' ? value : Number(value ?? 0)
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0)
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const escapeHtml = (input: string | null | undefined) => {
  if (!input) return ''
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ParticipantContractRow = Database['public']['Tables']['participant_contracts']['Row']

type EmailRequest = {
  contract: ContractRow
  participantContracts: ParticipantContractRow[]
}

const buildContractHtml = (contract: ContractRow, participant: ParticipantContractRow) => {
  const processingShare = Math.max(
    0,
    (participant.total_amount ?? 0) - (participant.subtotal ?? 0) - (participant.tax_amount ?? 0),
  )

  const signatureImg = participant.signature_data
    ? `<img src="${participant.signature_data}" alt="Signature" style="max-height:120px; border:1px solid #333;" />`
    : '<div style="height:120px; border:1px dashed #999;"></div>'

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Contract ${escapeHtml(contract.contract_number)} - ${escapeHtml(participant.participant_name)}</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 24px; color: #111; }
        h1, h2, h3 { margin: 0; font-weight: 700; }
        h1 { font-size: 22px; margin-bottom: 16px; }
        h2 { font-size: 18px; margin-top: 32px; margin-bottom: 12px; }
        h3 { font-size: 16px; margin-top: 20px; margin-bottom: 8px; }
        p { line-height: 1.45; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
        .section { margin-bottom: 28px; }
        .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; font-size: 13px; }
        .signature-block { margin-top: 16px; }
        .footer { margin-top: 40px; font-size: 11px; color: #666; }
      </style>
    </head>
    <body>
      <header class="section">
        <h1>Peak Fitness Dieppe - Personal Training Agreement</h1>
        <div class="meta-grid">
          <div><strong>Contract Number:</strong> ${escapeHtml(contract.contract_number)}</div>
          <div><strong>Date:</strong> ${formatDate(new Date().toISOString())}</div>
          <div><strong>Participant:</strong> ${escapeHtml(participant.participant_name)}</div>
          <div><strong>Email:</strong> ${escapeHtml(participant.participant_email ?? '')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(participant.participant_phone ?? '')}</div>
          <div><strong>Schedule:</strong> ${escapeHtml(participant.payment_schedule ?? contract.payment_schedule)}</div>
          <div><strong>Start Date:</strong> ${formatDate(contract.start_date)}</div>
          <div><strong>End Date:</strong> ${formatDate(contract.end_date)}</div>
        </div>
      </header>

      <section class="section">
        <h2>Cost of Services</h2>
        <table>
          <tbody>
            <tr><th>Subtotal</th><td>${formatCurrency(participant.subtotal ?? 0)}</td></tr>
            <tr><th>Processing Fee (3.5%)</th><td>${formatCurrency(processingShare)}</td></tr>
            <tr><th>Taxes</th><td>${formatCurrency(participant.tax_amount ?? 0)}</td></tr>
            <tr><th>Total Owing</th><td>${formatCurrency(participant.total_amount ?? 0)}</td></tr>
            <tr><th>Payment Terms</th><td>${formatCurrency(contract.split_payment_amount ?? participant.total_amount ?? 0)} ${escapeHtml(contract.payment_schedule)}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Terms & Conditions</h2>
        <p>By signing this agreement, the participant acknowledges and agrees to the following terms:</p>
        <ul>
          <li>All training sessions must be booked in advance and cancellations require 24 hours notice.</li>
          <li>Late arrivals may result in a shortened session without refund.</li>
          <li>The participant is responsible for informing the trainer of any medical conditions or injuries.</li>
          <li>Peak Fitness Dieppe reserves the right to modify schedules and offerings with reasonable notice.</li>
          <li>Membership and training fees are non-refundable except where required by law.</li>
          <li>Participants agree to abide by the facility code of conduct and safety guidelines.</li>
        </ul>
      </section>

      <section class="section">
        <h2>Signature</h2>
        <p><strong>Signed by:</strong> ${escapeHtml(participant.participant_name)}</p>
        <p><strong>Date Signed:</strong> ${formatDate(participant.signed_date)}</p>
        <div class="signature-block">${signatureImg}</div>
      </section>

      <section class="footer">
        <p>Peak Fitness Dieppe • info@peakfitnessdieppe.ca • 506-962-6121</p>
        <p>This digital copy has been provided for your records. Please contact us if you have any questions.</p>
      </section>
    </body>
  </html>`
}

const emailParticipantContractsHandler: Handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: 'OK',
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  if (!supabaseAdmin) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing Supabase service role configuration' }),
    }
  }

  let payload: EmailRequest
  try {
    payload = JSON.parse(event.body ?? '{}') as EmailRequest
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    }
  }

  const { contract, participantContracts } = payload ?? {}
  if (!contract || !Array.isArray(participantContracts) || !participantContracts.length) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid contract or participant data' }),
    }
  }

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  })

  try {
    const storedResults: {
      participantId: string
      path: string
      publicUrl: string | null
    }[] = []

    for (const participant of participantContracts) {
      const page = await browser.newPage()
      const html = buildContractHtml(contract, participant)
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.7in',
          left: '0.5in',
        },
      })
      await page.close()

      const objectPath = `contracts/${contract.id}/participant-${participant.participant_index}.pdf`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(objectPath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        throw uploadError
      }

      const { data: publicData } = supabaseAdmin.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(objectPath)

      const publicUrl = publicData?.publicUrl ?? null

      const existingPayload = (participant.contract_payload as Record<string, any> | null) ?? {}
      const updatedPayload = {
        ...existingPayload,
        contract_pdf: {
          path: objectPath,
          publicUrl,
          updatedAt: new Date().toISOString(),
        },
      }

      const { error: updateError } = await supabaseAdmin
        .from('participant_contracts')
        .update({ contract_payload: updatedPayload })
        .eq('id', participant.id)

      if (updateError) {
        throw updateError
      }

      storedResults.push({
        participantId: participant.id,
        path: objectPath,
        publicUrl,
      })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, stored: storedResults }),
    }
  } catch (error) {
    console.error('[emailParticipantContracts] failed', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to generate or send contract PDFs' }),
    }
  } finally {
    await browser.close()
  }
}

export const handler = emailParticipantContractsHandler
