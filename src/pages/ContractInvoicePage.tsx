import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { createSquareCustomer, createSquareInvoice, createSquareInvoices, SquareClientError } from '@/lib/squareClient'
import { emailParticipantContracts } from '@/lib/notifications'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Database } from '@/types/database'
import { ArrowLeft, DollarSign, Loader2 } from 'lucide-react'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ParticipantContractRow = Database['public']['Tables']['participant_contracts']['Row']
type ContractParticipantRow = Database['public']['Tables']['contract_participants']['Row']

interface InvoiceFormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  province: string
  postalCode: string
  country: string
  companyName: string
}

export default function ContractInvoicePage() {
  const { contractId } = useParams<{ contractId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const locationState = location.state as {
    contract?: ContractRow
    participants?: ParticipantContractRow[]
    invoicePrepared?: boolean
  } | undefined

  const contractFromState = locationState?.contract && locationState.contract.id === contractId
    ? locationState.contract
    : null

  const participantsFromState = contractFromState && locationState?.participants
    ? locationState.participants
    : []

  const invoicePreparedFromState = locationState?.invoicePrepared ?? (contractFromState?.square_invoice_id ? true : false)

  const createFormState = useCallback((contractData: ContractRow | null): InvoiceFormState | null => {
    if (!contractData) return null
    const [firstName, ...rest] = (contractData.customer_name || '').trim().split(' ')
    const lastName = rest.join(' ')
    return {
      firstName: contractData.first_name || firstName || '',
      lastName: contractData.last_name || lastName || '',
      email: contractData.customer_email || '',
      phone: contractData.customer_phone || '',
      addressLine1: contractData.address_line1 || '',
      addressLine2: contractData.address_line2 || '',
      city: contractData.city || '',
      province: contractData.province || 'NB',
      postalCode: contractData.postal_code || '',
      country: contractData.country || 'CA',
      companyName: contractData.company_name || '',
    }
  }, [])

  const [contract, setContract] = useState<ContractRow | null>(contractFromState)
  const [participants, setParticipants] = useState<ParticipantContractRow[]>(participantsFromState)
  const [participantContacts, setParticipantContacts] = useState<ContractParticipantRow[]>([])
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [formData, setFormData] = useState<InvoiceFormState | null>(createFormState(contractFromState))
  const [loading, setLoading] = useState(!contractFromState)
  const [saving, setSaving] = useState(false)
  const [invoicePrepared, setInvoicePrepared] = useState(invoicePreparedFromState)

  const contractDefaults = useMemo(() => createFormState(contract), [contract, createFormState])

  useEffect(() => {
    if (!contractId) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const [
          { data: contractData, error: contractError },
          { data: participantData, error: participantError },
          { data: participantContactData, error: participantContactError },
        ] = await Promise.all([
          supabase
            .from('contracts')
            .select('*')
            .eq('id', contractId)
            .single(),
          supabase
            .from('participant_contracts')
            .select('*')
            .eq('contract_id', contractId)
            .order('participant_index', { ascending: true }),
          supabase
            .from('contract_participants')
            .select('*')
            .eq('contract_id', contractId)
            .order('participant_index', { ascending: true }),
        ])

        if (contractError) throw contractError
        if (participantError) throw participantError
        if (participantContactError) throw participantContactError

        setContract(contractData)
        setParticipants(participantData || [])
        setParticipantContacts(participantContactData || [])
        setFormData(createFormState(contractData))
        setSelectedParticipantId(null)
        setInvoicePrepared(!!contractData?.square_invoice_id)
      } catch (error: any) {
        toast({
          title: 'Error loading contract',
          description: error.message || 'Unable to load contract details.',
          variant: 'destructive',
        })
        navigate('/calculator')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [contractId, navigate, toast, createFormState])

  function splitIntoShares(totalCents: number, parts: number) {
    if (parts <= 0) return []
    const baseShare = Math.floor(totalCents / parts)
    const remainder = totalCents - baseShare * parts
    return Array.from({ length: parts }, (_, index) => (index < remainder ? baseShare + 1 : baseShare))
  }

  function splitCurrency(amount: number, parts: number) {
    if (parts <= 0) return []
    const cents = Math.round((amount || 0) * 100)
    return splitIntoShares(cents, parts).map(share => share / 100)
  }

  const perParticipantLineItems = useMemo(() => {
    if (!participants.length) return []

    const participantCount = participants.length || contract?.participants || 1
    const schedule = contract?.payment_schedule ?? participants[0]?.payment_schedule ?? 'full'
    const packageLength = contract?.package_length ?? 1

    let paymentCount = 1
    if (schedule === 'monthly') {
      paymentCount = Math.max(1, Math.round(packageLength))
    } else if (schedule === 'bi_weekly') {
      paymentCount = Math.max(1, Math.round(packageLength * 2))
    }

    const isRecurring = schedule !== 'full' && paymentCount > 1

    const perPaymentSubtotalShares = isRecurring
      ? splitCurrency((contract?.subtotal ?? 0) / paymentCount, participantCount)
      : null
    const perPaymentProcessingShares = isRecurring
      ? splitCurrency((contract?.processing_fee ?? 0) / paymentCount, participantCount)
      : null
    const perPaymentTotalShares = isRecurring
      ? splitCurrency(
          contract?.payment_amount
            ?? ((contract?.total_amount ?? 0) / Math.max(1, paymentCount)),
          participantCount,
        )
      : null

    return participants.map((participant, index) => {
      const subtotal = isRecurring
        ? perPaymentSubtotalShares?.[index] ?? 0
        : Number(participant.subtotal ?? 0)
      const processing = isRecurring
        ? perPaymentProcessingShares?.[index] ?? 0
        : Math.max(0, Number(participant.total_amount ?? 0) - Number(participant.subtotal ?? 0) - Number(participant.tax_amount ?? 0))
      const total = isRecurring
        ? Number((perPaymentTotalShares?.[index] ?? subtotal + processing).toFixed(2))
        : Number(participant.total_amount ?? subtotal + processing + Number(participant.tax_amount ?? 0))
      const tax = isRecurring
        ? Math.max(0, Number((total - subtotal - processing).toFixed(2)))
        : Number(participant.tax_amount ?? 0)

      return {
        id: participant.id,
        name: participant.participant_name,
        email: participant.participant_email,
        total,
        subtotal,
        tax,
        processing,
        schedule: participant.payment_schedule,
        startDate: participant.start_date,
        endDate: participant.end_date,
      }
    })
  }, [participants, contract])

  const handleChange = (field: keyof InvoiceFormState, value: string) => {
    setFormData(prev => (prev ? { ...prev, [field]: value } : prev))
  }

  const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return 0
    return typeof value === 'number' ? value : Number(value)
  }

  const roundCents = (amount: number) => Math.round(amount)

  const formatDateOnly = (date: Date) => date.toISOString().split('T')[0]

  const parseDate = (value: string | null | undefined) => {
    if (!value) return new Date()
    return new Date(`${value}T00:00:00Z`)
  }

  const addMonthsUTC = (date: Date, months: number) => {
    const clone = new Date(date)
    clone.setUTCMonth(clone.getUTCMonth() + months)
    return clone
  }

  const addDaysUTC = (date: Date, days: number) => {
    const clone = new Date(date)
    clone.setUTCDate(clone.getUTCDate() + days)
    return clone
  }

  const buildDueDates = (
    schedule: string | null | undefined,
    startDate: string | null | undefined,
    count: number,
    fallbackEnd: string | null | undefined,
  ) => {
    if (count <= 0) return []
    const todayStr = formatDateOnly(new Date())
    const today = parseDate(todayStr)
    const initialBase = parseDate(startDate ?? fallbackEnd ?? todayStr)
    const baseDate = initialBase <= today ? addDaysUTC(today, 1) : initialBase

    if (schedule === 'monthly') {
      return Array.from({ length: count }, (_, index) => formatDateOnly(addMonthsUTC(baseDate, index)))
    }
    if (schedule === 'bi_weekly') {
      return Array.from({ length: count }, (_, index) => formatDateOnly(addDaysUTC(baseDate, index * 14)))
    }
    return Array.from({ length: count }, () => formatDateOnly(baseDate))
  }

  const prepareSplitInvoices = async () => {
    if (!contractId || !contract || !formData) return

    const sortedParticipants = [...participants].sort((a, b) => a.participant_index - b.participant_index)
    if (!sortedParticipants.length) {
      toast({
        title: 'No participants found',
        description: 'Cannot split invoices without participant records.',
        variant: 'destructive',
      })
      return
    }

    const missingEmail = sortedParticipants.find(participant => !participant.participant_email)
    if (missingEmail) {
      toast({
        title: 'Participant email required',
        description: `Provide an email for ${missingEmail.participant_name} to send their invoice.`,
        variant: 'destructive',
      })
      return
    }

    const participantContactMap = new Map(participantContacts.map(contact => [contact.participant_index, contact]))
    let primaryCustomerId = contract.square_customer_id ?? null

    const ensureSquareCustomerForParticipant = async (
      participant: ParticipantContractRow,
      participantIndex: number,
    ) => {
      if (participantIndex === 1) {
        if (primaryCustomerId) return primaryCustomerId
      } else {
        const contactRow = participantContactMap.get(participantIndex)
        if (contactRow?.square_customer_id) {
          return contactRow.square_customer_id
        }
      }

      if (!participant.participant_email) {
        throw new Error(`Participant ${participant.participant_name} is missing an email address.`)
      }

      const [firstName, ...rest] = (participant.participant_name || '').trim().split(' ')
      const lastName = rest.join(' ')

      const customer = await createSquareCustomer({
        givenName: firstName || participant.participant_name,
        familyName: lastName || undefined,
        emailAddress: participant.participant_email || undefined,
        phoneNumber: participant.participant_phone || undefined,
      })

      if (participantIndex === 1) {
        await supabase
          .from('contracts')
          .update({ square_customer_id: customer.id })
          .eq('id', contract.id)
        setContract(prev => (prev ? { ...prev, square_customer_id: customer.id } : prev))
        primaryCustomerId = customer.id
      } else {
        const contactRow = participantContactMap.get(participantIndex)
        if (contactRow) {
          await supabase
            .from('contract_participants')
            .update({ square_customer_id: customer.id })
            .eq('id', contactRow.id)
          const updatedContact = { ...contactRow, square_customer_id: customer.id }
          participantContactMap.set(participantIndex, updatedContact)
          setParticipantContacts(prev =>
            prev.map(item => (item.id === contactRow.id ? updatedContact : item)),
          )
        }
      }

      return customer.id
    }
    const participantCount = sortedParticipants.length
    const schedule = contract.payment_schedule || 'full'
    const packageLength = Math.max(1, Math.round(toNumber(contract.package_length)))
    let paymentCount = 1

    if (schedule === 'monthly') {
      paymentCount = packageLength
    } else if (schedule === 'bi_weekly') {
      paymentCount = Math.max(1, Math.round(packageLength * 2))
    }

    const dueDates = buildDueDates(schedule, contract.start_date, paymentCount, contract.end_date)

    const downPaymentTotalCents = roundCents(toNumber(contract.down_payment) * 100)
    const downShares = splitIntoShares(downPaymentTotalCents, participantCount)

    type InvoiceTask = {
      participantContractId: string
      participantIndex: number
      shareCents: number
      installmentIndex: number
      dueDate: string
      customerId: string
      payload: Parameters<typeof createSquareInvoices>[0][number]
    }

    const tasks: InvoiceTask[] = []
    const totalsByInstallment = new Map<number, number>()

    for (let index = 0; index < sortedParticipants.length; index += 1) {
      const participant = sortedParticipants[index]
      const participantIndex = participant.participant_index
      const customerId = await ensureSquareCustomerForParticipant(participant, participantIndex)

      const totalShareCents = roundCents(toNumber(participant.total_amount) * 100)
      const participantDownShare = downShares[index] ?? 0
      const remainderCents = Math.max(0, totalShareCents - participantDownShare)

      let installmentShares = splitIntoShares(remainderCents, paymentCount)
      if (!installmentShares.length) {
        installmentShares = [0]
      }
      installmentShares[0] += participantDownShare

      for (let installmentIndex = 0; installmentIndex < installmentShares.length; installmentIndex += 1) {
        const shareCents = installmentShares[installmentIndex]
        if (shareCents <= 0) continue

        const dueDate = dueDates[installmentIndex] ?? dueDates[dueDates.length - 1]
        const amountDollars = Number((shareCents / 100).toFixed(2))

        totalsByInstallment.set(
          installmentIndex,
          (totalsByInstallment.get(installmentIndex) ?? 0) + shareCents,
        )

        const payload = {
          customerId,
          lineItems: [
            {
              name: `Training Contract ${contract.contract_number} - Installment ${installmentIndex + 1}`,
              quantity: 1,
              amount: amountDollars,
              currency: 'CAD',
              note: `Participant: ${participant.participant_name}`,
            },
          ],
          paymentRequests: [
            {
              requestType: 'BALANCE' as const,
              dueDate,
            },
          ],
          title: `Installment ${installmentIndex + 1} - ${participant.participant_name}`,
          description: `Personal training package installment for ${participant.participant_name}`,
          deliveryMethod: 'EMAIL' as const,
          sendInvoice: true,
          acceptedPaymentMethods: { card: true },
        }

        tasks.push({
          participantContractId: participant.id,
          participantIndex,
          shareCents,
          installmentIndex,
          dueDate,
          customerId,
          payload,
        })
      }
    }

    if (!tasks.length) {
      toast({
        title: 'Nothing to invoice',
        description: 'Split payment calculation produced no invoiceable amounts.',
        variant: 'destructive',
      })
      return
    }

    const batchResult = await createSquareInvoices(tasks.map(task => task.payload))
    const invoices = batchResult.invoices

    if (!Array.isArray(invoices) || invoices.length !== tasks.length) {
      throw new Error('Square did not return the expected number of invoices.')
    }

    const upsertRows = tasks.map((task, index) => {
      const invoice = invoices[index]?.invoice as { id?: string; status?: string; public_url?: string } | undefined
      return {
        contract_id: contractId,
        participant_contract_id: task.participantContractId,
        installment_index: task.installmentIndex,
        installment_total_cents: totalsByInstallment.get(task.installmentIndex) ?? 0,
        participant_share_cents: task.shareCents,
        due_date: task.dueDate,
        square_invoice_id: invoice?.id ?? null,
        square_public_url: invoice?.public_url ?? null,
        status: invoice?.status ?? 'pending',
      }
    })
    const { error: invoiceInsertError } = await supabase
      .from('contract_invoice_instances')
      .upsert(upsertRows, { onConflict: 'participant_contract_id,installment_index' })

    if (invoiceInsertError) {
      throw invoiceInsertError
    }

    const firstInvoiceByParticipant = new Map<string, { id: string | null; url: string | null }>()
    tasks.forEach((task, index) => {
      if (firstInvoiceByParticipant.has(task.participantContractId)) return
      const invoice = invoices[index]?.invoice
      firstInvoiceByParticipant.set(task.participantContractId, {
        id: invoice?.id ?? null,
        url: (invoice as { public_url?: string } | undefined)?.public_url ?? null,
      })
    })

    await Promise.all(
      Array.from(firstInvoiceByParticipant.entries()).map(([participantContractId, invoiceInfo]) =>
        supabase
          .from('participant_contracts')
          .update({
            square_invoice_id: invoiceInfo.id,
            square_payment_link: invoiceInfo.url,
          })
          .eq('id', participantContractId),
      ),
    )

    const emailResult = await emailParticipantContracts({
      contract,
      participants,
    })

    if (emailResult.error) {
      console.error('[contracts] email dispatch failed', emailResult.error)
      toast({
        title: 'Contract email warning',
        description: 'Invoices prepared but contract PDFs could not be emailed. Please check logs.',
        variant: 'destructive',
      })
    }

    setParticipants(prev =>
      prev.map(participant => {
        const invoiceInfo = firstInvoiceByParticipant.get(participant.id)
        if (!invoiceInfo) return participant
        return {
          ...participant,
          square_invoice_id: invoiceInfo.id,
          square_payment_link: invoiceInfo.url,
        }
      }),
    )

    toast({
      title: 'Split invoices prepared',
      description: 'Invoices were generated and scheduled for each participant.',
    })

    setInvoicePrepared(true)
  }

  const handleSelectParticipant = (participantId: string | null) => {
    setSelectedParticipantId(participantId)

    if (!contractDefaults) return

    if (!participantId) {
      setFormData(contractDefaults)
      return
    }

    const participant = participants.find(item => item.id === participantId)
    if (!participant) return

    const [firstName, ...rest] = (participant.participant_name || '').trim().split(' ')
    const lastName = rest.join(' ')

    setFormData(prev => {
      const base = contractDefaults || prev
      if (!base) return prev
      return {
        ...base,
        firstName: firstName || base.firstName,
        lastName: lastName || base.lastName,
        email: participant.participant_email ?? base.email,
        phone: participant.participant_phone ?? base.phone,
      }
    })
  }

  const handleCreateInvoice = async () => {
    if (!contractId || !contract || !formData) return

    if (!formData.email) {
      toast({
        title: 'Email required',
        description: 'Please provide an email address for Square invoicing.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)

      if (contract.split_payment) {
        await prepareSplitInvoices()
        return
      }

      const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? ''
      const currentEmailNorm = normalize(contract.customer_email)
      const newEmailNorm = normalize(formData.email)
      const emailChanged = newEmailNorm && newEmailNorm !== currentEmailNorm

      const combinedName = `${formData.firstName ?? ''} ${formData.lastName ?? ''}`.trim() || contract.customer_name

      let squareCustomerId = contract.square_customer_id ?? null

      if (!squareCustomerId) {
        const customer = await createSquareCustomer({
          givenName: formData.firstName,
          familyName: formData.lastName || undefined,
          emailAddress: formData.email,
          phoneNumber: formData.phone || undefined,
          companyName: formData.companyName || undefined,
          address: {
            addressLine1: formData.addressLine1 || undefined,
            addressLine2: formData.addressLine2 || undefined,
            locality: formData.city || undefined,
            administrativeDistrictLevel1: formData.province || undefined,
            postalCode: formData.postalCode || undefined,
            country: formData.country || undefined,
          },
        })
        squareCustomerId = customer.id
      }

      const contractUpdatePayload = {
        square_customer_id: squareCustomerId,
        first_name: formData.firstName,
        last_name: formData.lastName,
        customer_email: formData.email,
        customer_phone: formData.phone,
        customer_name: combinedName,
        address_line1: formData.addressLine1,
        address_line2: formData.addressLine2,
        city: formData.city,
        province: formData.province,
        postal_code: formData.postalCode,
        country: formData.country,
        company_name: formData.companyName,
      }

      const { error: updateError } = await supabase
        .from('contracts')
        .update(contractUpdatePayload)
        .eq('id', contractId)

      if (updateError) throw updateError

      // Keep contract state in sync so downstream steps use the corrected info
      setContract(prev => (prev ? { ...prev, ...contractUpdatePayload } : prev))

      if (emailChanged || formData.phone.trim() !== (contract.customer_phone ?? '').trim()) {
        const phoneValue = formData.phone || null
        const emailValue = formData.email || null

        const updates: Promise<unknown>[] = []

        if (contract.quote_id) {
          updates.push(
            supabase
              .from('quotes')
              .update({
                customer_name: combinedName,
                customer_email: emailValue,
                customer_phone: phoneValue,
              })
              .eq('id', contract.quote_id),
          )
        }

        updates.push(
          supabase
            .from('participant_contracts')
            .update({
              participant_email: emailValue,
              participant_phone: phoneValue,
              participant_name: combinedName || undefined,
            })
            .eq('contract_id', contractId)
            .eq('participant_index', 1),
        )

        updates.push(
          supabase
            .from('contract_participants')
            .update({
              full_name: combinedName || undefined,
              email: emailValue,
              phone: phoneValue,
            })
            .eq('contract_id', contractId)
            .eq('participant_index', 1),
        )

        const results = await Promise.all(updates)
        const failed = results.find(res => 'error' in (res as any) && (res as any).error)
        if (failed) {
          throw (failed as any).error
        }
      }

      const lineItems = [
        {
          name: `Training Package - ${contract.total_sessions} sessions`,
          quantity: 1,
          amount: contract.total_amount,
          currency: 'CAD',
          note: `Frequency: ${contract.frequency.replace('_', ' ')}`,
        },
      ]

      const paymentRequests = [] as {
        requestType?: 'BALANCE' | 'DEPOSIT'
        dueDate: string
        fixedAmount?: number
      }[]

      if (contract.down_payment && contract.down_payment > 0) {
        paymentRequests.push({
          requestType: 'DEPOSIT',
          dueDate: contract.start_date,
          fixedAmount: contract.down_payment,
        })
      }

      paymentRequests.push({
        requestType: 'BALANCE',
        dueDate: contract.payment_schedule === 'full' ? contract.start_date : contract.end_date || contract.start_date,
      })

      const invoiceResult = await createSquareInvoice({
        customerId: squareCustomerId,
        lineItems,
        paymentRequests,
        title: `Training Contract ${contract.contract_number}`,
        description: `Personal training package (${contract.total_sessions} sessions)`,
        deliveryMethod: 'EMAIL',
        sendInvoice: true,
      })

      const invoice = invoiceResult.invoice
      const invoiceId = invoice?.id

      if (!invoiceId) {
        throw new Error('Square invoice did not return an ID')
      }

      const paymentLink = (invoice as unknown as { publicUrl?: string }).publicUrl ?? null

      const { error: invoiceUpdateError } = await supabase
        .from('contracts')
        .update({
          square_invoice_id: invoiceId,
          square_payment_link: paymentLink,
        })
        .eq('id', contractId)

      if (invoiceUpdateError) throw invoiceUpdateError

      // Ensure there is a participant_contract row to link the instance (schema requires NOT NULL)
      try {
        // Try in-memory participants first
        let primaryParticipantId: string | null = participants.find(p => p.participant_index === 1)?.id
          ?? participants[0]?.id

        if (!primaryParticipantId) {
          // Try to fetch an existing primary participant
          const { data: maybePrimary } = await supabase
            .from('participant_contracts')
            .select('id')
            .eq('contract_id', contractId)
            .eq('participant_index', 1)
            .maybeSingle()

          if (maybePrimary?.id) {
            primaryParticipantId = maybePrimary.id
          }
        }

        if (!primaryParticipantId) {
          // Create a primary participant from contract customer fields
          const fullName = (contract.first_name && contract.last_name)
            ? `${contract.first_name} ${contract.last_name}`
            : (contract.customer_name || 'Primary Client')

          const insertPayload = {
            contract_id: contractId,
            participant_index: 1,
            participant_name: fullName,
            participant_email: contract.customer_email,
            participant_phone: contract.customer_phone,
            subtotal: contract.subtotal ?? null,
            tax_amount: contract.tax_amount ?? null,
            total_amount: contract.total_amount ?? null,
            payment_schedule: contract.payment_schedule,
            start_date: contract.start_date,
            end_date: contract.end_date,
            status: 'pending' as const,
          }

          const { data: created, error: insertErr } = await supabase
            .from('participant_contracts')
            .insert(insertPayload)
            .select('id')
            .single()

          if (insertErr) throw insertErr
          primaryParticipantId = created.id
          // reflect in local state minimally
          setParticipants(prev => prev.length ? prev : [{
            id: primaryParticipantId!,
            ...insertPayload,
          } as any])
        }

        const balanceDueDate = contract.payment_schedule === 'full'
          ? contract.start_date
          : (contract.end_date || contract.start_date)
        const totalCents = Math.round(Number(contract.total_amount || 0) * 100)

        await supabase
          .from('contract_invoice_instances')
          .upsert({
            contract_id: contractId,
            participant_contract_id: primaryParticipantId!,
            installment_index: 0,
            installment_total_cents: totalCents,
            participant_share_cents: totalCents,
            due_date: balanceDueDate,
            square_invoice_id: invoiceId,
            square_public_url: paymentLink,
            status: (invoice as any)?.status ?? 'pending',
          }, { onConflict: 'participant_contract_id,installment_index' })
      } catch (e) {
        console.warn('[contract_invoice_instances] upsert warning', e)
      }

      setContract(prev => (prev ? {
        ...prev,
        square_customer_id: squareCustomerId,
        square_invoice_id: invoiceId,
        square_payment_link: paymentLink,
      } : prev))

      toast({
        title: 'Invoice ready',
        description: 'Square customer synced and invoice emailed successfully.',
      })

      setInvoicePrepared(true)
    } catch (error: any) {
      const message = error instanceof SquareClientError ? error.message : error?.message || 'Unable to prepare data for Square invoicing.'
      toast({
        title: 'Invoice creation failed',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleContinueToScheduling = () => {
    if (!contractId || !invoicePrepared) return
    navigate(`/contract/${contractId}/schedule`, {
      state: {
        contract,
        participants,
        invoicePrepared: true,
      },
    })
  }

  if (loading || !formData || !contract) {
    return (
      <Layout>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="text-center text-muted-foreground">Loading invoice details...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Square Invoice Preparation</h1>
            <p className="text-sm text-muted-foreground">
              Review and confirm details before creating the Square customer and invoice.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/contract/${contractId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contract
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
              <CardDescription>Square requires accurate customer contact details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={event => handleChange('firstName', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={event => handleChange('lastName', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={event => handleChange('email', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={event => handleChange('phone', event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={event => handleChange('companyName', event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="addressLine1">Address Line 1</Label>
                  <Input
                    id="addressLine1"
                    value={formData.addressLine1}
                    onChange={event => handleChange('addressLine1', event.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    value={formData.addressLine2}
                    onChange={event => handleChange('addressLine2', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={formData.city} onChange={event => handleChange('city', event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="province">Province</Label>
                  <Input
                    id="province"
                    value={formData.province}
                    onChange={event => handleChange('province', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={formData.postalCode}
                    onChange={event => handleChange('postalCode', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={event => handleChange('country', event.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
              <CardDescription>Totals per participant and payment status once synced with Square.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span>Contract Number</span>
                <span className="font-medium">{contract.contract_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Contract Status</span>
                <span className="font-medium capitalize">{contract.invoice_status ?? 'pending'}</span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span>Total Contract</span>
                  <span className="font-semibold">{formatCurrency(contract.total_amount)}</span>
                </div>
                {contract.payment_schedule !== 'full' && contract.payment_amount && (
                  <div className="flex justify-between">
                    <span>Recurring Payment</span>
                    <span>{formatCurrency(contract.payment_amount)} / {contract.payment_schedule.replace('_', ' ')}</span>
                  </div>
                )}
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Start Date</span>
                    <span>{formatDate(contract.start_date)}</span>
                  </div>
                  {contract.end_date && (
                    <div className="flex justify-between">
                      <span>End Date</span>
                      <span>{formatDate(contract.end_date)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Frequency</span>
                    <span>{contract.frequency.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Participants</span>
                    <span>{participants.length || contract.participants}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Participant Line Items</CardTitle>
            <CardDescription>Amounts owed per participant and Square invoice state.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-muted-foreground">Select a participant to load their details into the form.</p>
                <Button
                  type="button"
                  variant={selectedParticipantId === null ? 'secondary' : 'outline'}
                  onClick={() => handleSelectParticipant(null)}
                >
                  Use contract contact
                </Button>
              </div>
              <div className="grid gap-3">
                {perParticipantLineItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectParticipant(item.id)}
                    className={`border rounded-lg p-3 text-left transition-colors ${
                      selectedParticipantId === item.id ? 'border-primary bg-primary/5' : 'hover:border-primary/60'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        {item.email && <p className="text-xs text-muted-foreground">{item.email}</p>}
                        {item.schedule && (
                          <p className="text-xs text-muted-foreground">Schedule: {item.schedule.replace('_', ' ')}</p>
                        )}
                        {item.startDate && (
                          <p className="text-xs text-muted-foreground">Start: {formatDate(item.startDate)}</p>
                        )}
                        {item.endDate && (
                          <p className="text-xs text-muted-foreground">End: {formatDate(item.endDate)}</p>
                        )}
                      </div>
                      <div className="text-right text-sm space-y-1">
                        <p>Subtotal: <span className="font-medium">{formatCurrency(item.subtotal ?? 0)}</span></p>
                        <p>Tax: <span className="font-medium">{formatCurrency(item.tax ?? 0)}</span></p>
                        <p>Total: <span className="font-semibold">{formatCurrency(item.total ?? 0)}</span></p>
                        <p className="text-xs text-muted-foreground">
                          Square Invoice: {participants.find(p => p.id === item.id)?.square_invoice_id ? 'Prepared' : 'Pending'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate(`/contract/${contractId}`)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreateInvoice} disabled={saving || invoicePrepared}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Prepare Square Invoice
              </>
            )}
          </Button>
          {invoicePrepared && (
            <Button
              onClick={handleContinueToScheduling}
              disabled={saving || !participants.length}
            >
              Continue to Scheduling
            </Button>
          )}
        </div>
      </div>
    </Layout>
  )
}
