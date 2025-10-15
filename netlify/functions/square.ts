import { Handler } from '@netlify/functions'
import { randomUUID } from 'crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const getSquareBaseUrl = () => {
  const env = process.env.SQUARE_ENVIRONMENT || 'sandbox'
  return env === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
}

type CreateCustomerPayload = {
  givenName: string
  familyName?: string
  emailAddress?: string
  phoneNumber?: string
  companyName?: string
  note?: string
  address?: {
    addressLine1?: string
    addressLine2?: string
    locality?: string
    administrativeDistrictLevel1?: string
    postalCode?: string
    country?: string
  }
}

type InvoiceLineItem = {
  name: string
  quantity: number
  amount: number
  currency?: string
  note?: string
}

type PaymentRequest = {
  requestType?: 'BALANCE' | 'DEPOSIT'
  dueDate: string
  percentageRequested?: number
  fixedAmount?: number
}

type CreateInvoicePayload = {
  customerId: string
  locationId?: string
  lineItems: InvoiceLineItem[]
  paymentRequests: PaymentRequest[]
  title?: string
  description?: string
  deliveryMethod?: 'EMAIL' | 'SHARE_MANUALLY'
  sendInvoice?: boolean
}

type AcceptedPaymentMethods = {
  card?: boolean
  bankAccount?: boolean
  buyNowPayLater?: boolean
  squareGiftCard?: boolean
}

type CreateInvoicePayloadWithOptions = CreateInvoicePayload & {
  acceptedPaymentMethods?: AcceptedPaymentMethods
  scheduledAt?: string
}

type FetchInvoicesPayload = {
  invoiceIds: string[]
}

type SquareAction =
  | { action: 'health' }
  | { action: 'createCustomer'; payload: CreateCustomerPayload }
  | { action: 'createInvoice'; payload: CreateInvoicePayloadWithOptions }
  | { action: 'createInvoices'; payload: CreateInvoicePayloadWithOptions[] }
  | { action: 'getInvoices'; payload: FetchInvoicesPayload }

const resolveAccessToken = () => {
  const token = process.env.SQUARE_ACCESS_TOKEN || process.env.VITE_SQUARE_ACCESS_TOKEN
  if (!token) {
    throw new Error('Missing Square access token environment variable (SQUARE_ACCESS_TOKEN)')
  }
  return token
}

const resolveApplicationId = () => {
  const id = process.env.SQUARE_APPLICATION_ID || process.env.VITE_SQUARE_APPLICATION_ID
  if (!id) {
    throw new Error('Missing Square application ID environment variable (SQUARE_APPLICATION_ID)')
  }
  return id
}

const resolveLocationId = () => {
  const id = process.env.SQUARE_LOCATION_ID || process.env.VITE_SQUARE_LOCATION_ID
  if (!id) {
    throw new Error('Missing Square location ID environment variable (SQUARE_LOCATION_ID)')
  }
  return id
}

export const squareFetch = async (endpoint: string, options: RequestInit = {}) => {
  const baseUrl = getSquareBaseUrl()
  const accessToken = resolveAccessToken()
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Square-Version': '2024-10-17',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw { statusCode: response.status, errors: data.errors || [data] }
  }

  return data
}

const createInvoiceWithOrder = async (payload: CreateInvoicePayloadWithOptions, defaultLocation: string) => {
  const effectiveLocation = payload.locationId || defaultLocation
  const currency = payload.lineItems[0]?.currency || 'CAD'

  const orderResponse = await squareFetch('/v2/orders', {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      order: {
        location_id: effectiveLocation,
        customer_id: payload.customerId,
        line_items: payload.lineItems.map(item => ({
          name: item.name,
          quantity: item.quantity.toString(),
          note: item.note,
          base_price_money: {
            amount: Math.round(item.amount * 100),
            currency,
          },
        })),
      },
    }),
  })

  const order = orderResponse.order
  if (!order || !order.id) {
    throw new Error('Failed to create Square order')
  }

  const paymentRequests = payload.paymentRequests.map(request => {
    const paymentRequest: Record<string, unknown> = {
      request_type: request.requestType ?? 'BALANCE',
      due_date: request.dueDate,
    }

    if (request.percentageRequested !== undefined) {
      paymentRequest.percentage_requested = request.percentageRequested.toString()
    }

    if (request.fixedAmount !== undefined) {
      paymentRequest.fixed_amount_requested_money = {
        amount: Math.round(request.fixedAmount * 100),
        currency,
      }
    }

    return paymentRequest
  })

  const acceptedPayments = payload.acceptedPaymentMethods ?? {}

  const invoicePayload: Record<string, unknown> = {
    location_id: effectiveLocation,
    order_id: order.id,
    title: payload.title,
    description: payload.description,
    delivery_method: payload.deliveryMethod ?? 'EMAIL',
    primary_recipient: {
      customer_id: payload.customerId,
    },
    accepted_payment_methods: {
      card: acceptedPayments.card ?? true,
      bank_account: acceptedPayments.bankAccount ?? false,
      buy_now_pay_later: acceptedPayments.buyNowPayLater ?? false,
      square_gift_card: acceptedPayments.squareGiftCard ?? false,
    },
    payment_requests: paymentRequests,
  }

  if (payload.scheduledAt) {
    invoicePayload.schedule = {
      start_at: payload.scheduledAt,
    }
  }

  const invoiceResponse = await squareFetch('/v2/invoices', {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      invoice: invoicePayload,
    }),
  })

  let invoice = invoiceResponse.invoice
  if (!invoice || !invoice.id) {
    throw new Error('Failed to create Square invoice')
  }

  if (payload.sendInvoice !== false) {
    try {
      const publishResponse = await squareFetch(`/v2/invoices/${invoice.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          version: invoice.version,
        }),
      })
      invoice = publishResponse.invoice ?? invoice
    } catch (error) {
      console.error('[square-function] publishInvoice failed', error)
    }
  }

  return { invoice, order }
}

const parseAction = (body: string | null): SquareAction => {
  if (!body) {
    throw new Error('Missing request body')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    throw new Error('Invalid JSON payload')
  }

  if (!parsed || typeof parsed !== 'object' || !('action' in parsed)) {
    throw new Error('Missing action in payload')
  }

  const { action } = parsed as { action: string }
  switch (action) {
    case 'health':
      return { action: 'health' }
    case 'createCustomer':
      return parsed as { action: 'createCustomer'; payload: CreateCustomerPayload }
    case 'createInvoice':
      return parsed as { action: 'createInvoice'; payload: CreateInvoicePayloadWithOptions }
    case 'createInvoices':
      return parsed as { action: 'createInvoices'; payload: CreateInvoicePayloadWithOptions[] }
    case 'getInvoices':
      return parsed as { action: 'getInvoices'; payload: FetchInvoicesPayload }
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}

const squareHandler: Handler = async (event) => {
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

  try {
    resolveApplicationId()
    const locationId = resolveLocationId()
    const action = parseAction(event.body)

    if (action.action === 'health') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true }),
      }
    }

    if (action.action === 'createCustomer') {
      const payload = action.payload

      const response = await squareFetch('/v2/customers', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          given_name: payload.givenName,
          family_name: payload.familyName,
          email_address: payload.emailAddress,
          phone_number: payload.phoneNumber,
          company_name: payload.companyName,
          note: payload.note,
          address: payload.address ? {
            address_line_1: payload.address.addressLine1,
            address_line_2: payload.address.addressLine2,
            locality: payload.address.locality,
            administrative_district_level_1: payload.address.administrativeDistrictLevel1,
            postal_code: payload.address.postalCode,
            country: payload.address.country,
          } : undefined,
        }),
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ customer: response.customer }),
      }
    }

    if (action.action === 'createInvoice') {
      const invoice = await createInvoiceWithOrder(action.payload, locationId)

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(invoice),
      }
    }

    if (action.action === 'createInvoices') {
      if (!Array.isArray(action.payload)) {
        throw new Error('Payload for createInvoices must be an array')
      }

      const results: unknown[] = []
      for (const payload of action.payload) {
        const result = await createInvoiceWithOrder(payload, locationId)
        results.push(result)
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ invoices: results }),
      }
    }

    if (action.action === 'getInvoices') {
      const invoiceIds = action.payload?.invoiceIds ?? []
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'invoiceIds array required' }),
        }
      }

      const invoices = await Promise.all(
        invoiceIds.map(async invoiceId => {
          try {
            const response = await squareFetch(`/v2/invoices/${invoiceId}`, { method: 'GET' })
            return response.invoice ?? null
          } catch (error) {
            console.error('[square-function] failed to fetch invoice', invoiceId, error)
            return { id: invoiceId, error: true }
          }
        }),
      )

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ invoices }),
      }
    }

    throw new Error('Unsupported action')
  } catch (error) {
    console.error('[square-function]', error)

    if (error && typeof error === 'object' && 'errors' in error) {
      return {
        statusCode: (error as any).statusCode ?? 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Square API error',
          details: (error as any).errors,
        }),
      }
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

export const handler = squareHandler
