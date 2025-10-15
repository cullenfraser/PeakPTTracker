const resolveFunctionsBase = () => {
  const configured = (import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE as string | undefined)?.trim()
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, '')
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:8888'
  }

  return ''
}

const baseUrl = resolveFunctionsBase()
const SQUARE_ENDPOINT = `${baseUrl}/.netlify/functions/square`

export class SquareClientError extends Error {
  constructor(message: string, public status?: number, public details?: unknown) {
    super(message)
    this.name = 'SquareClientError'
  }
}

type CreateCustomerRequest = {
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

type CreateInvoiceRequest = {
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

type CreateInvoiceOptions = CreateInvoiceRequest & {
  acceptedPaymentMethods?: AcceptedPaymentMethods
  scheduledAt?: string
}

async function callSquare<TResponse>(action: string, payload?: unknown): Promise<TResponse> {
  const response = await fetch(SQUARE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.error || `Square function request failed with status ${response.status}`
    throw new SquareClientError(message, response.status, data?.details)
  }

  return data as TResponse
}

export async function createSquareCustomer(payload: CreateCustomerRequest) {
  const data = await callSquare<{ customer: { id: string } | null }>('createCustomer', payload)
  if (!data.customer?.id) {
    throw new SquareClientError('Square customer creation succeeded but returned no customer ID')
  }
  return data.customer
}

export async function createSquareInvoice(payload: CreateInvoiceOptions) {
  const data = await callSquare<{ invoice: { id: string } | null; order?: { id?: string } }>('createInvoice', payload)
  if (!data.invoice?.id) {
    throw new SquareClientError('Square invoice creation succeeded but returned no invoice ID')
  }
  return data
}

export async function createSquareInvoices(payloads: CreateInvoiceOptions[]) {
  const data = await callSquare<{ invoices: { invoice: { id: string } | null }[] }>('createInvoices', payloads)
  if (!Array.isArray(data.invoices)) {
    throw new SquareClientError('Square invoice batch creation returned no invoices')
  }
  return data
}

export async function checkSquareHealth() {
  return callSquare<{ ok: boolean }>('health')
}

export type {
  CreateCustomerRequest,
  CreateInvoiceRequest,
  CreateInvoiceOptions,
  InvoiceLineItem,
  PaymentRequest,
  AcceptedPaymentMethods,
}
