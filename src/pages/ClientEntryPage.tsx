import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { createSquareCustomer, SquareClientError } from '@/lib/squareClient'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Users, Loader2, ArrowLeft } from 'lucide-react'

type ParticipantDetail = {
  clientId: string | null
  name: string
  email: string
  phone: string
}

type ClientOption = {
  id: string
  name: string
  label: string
  email: string | null
  phone: string | null
}

type ParticipantEntry = {
  participantId: string | null
  name: string
  email: string | null
  phone: string | null
}

type ClientFormData = {
  customerName: string
  customerEmail: string
  customerPhone: string
  notes: string
  additionalParticipants: ParticipantDetail[]
}

const splitName = (fullName: string) => {
  const trimmed = (fullName || '').trim()
  if (!trimmed) {
    return { firstName: 'Client', lastName: 'Participant' }
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Client' }
  }
  const [firstName, ...rest] = parts
  const lastName = rest.join(' ') || 'Client'
  return { firstName, lastName }
}

export default function ClientEntryPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(false)
  const [contractId, setContractId] = useState<string | null>(null)

  // Get state from CalculatorPage
  const { formData: calculatorData, breakdown, total } = location.state || {}

  useEffect(() => {
    if (!calculatorData || !breakdown || !total) {
      toast({
        title: 'Missing data',
        description: 'Please start from the calculator page.',
        variant: 'destructive',
      })
      navigate('/calculator')
    }
  }, [calculatorData, breakdown, total, navigate, toast])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const [clientData, setClientData] = useState<ClientFormData>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    additionalParticipants: Array.from(
      { length: calculatorData?.participants ? calculatorData.participants - 1 : 0 },
      () => ({ clientId: null, name: '', email: '', phone: '' })
    ),
  })

  const [existingClients, setExistingClients] = useState<ClientOption[]>([])
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null)

  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email, phone')
        .order('first_name')

      if (error) {
        console.error('Failed to load clients', error)
        return
      }

      const options = (data ?? []).map((client) => {
        const first = client.first_name?.trim() ?? ''
        const last = client.last_name?.trim() ?? ''
        const name = `${first} ${last}`.trim() || client.email || 'Unnamed Client'
        const label = client.email ? `${name} (${client.email})` : name
        return {
          id: client.id,
          name,
          label,
          email: client.email,
          phone: client.phone,
        }
      })

      setExistingClients(options)
    }

    fetchClients()
  }, [])

  const applyClientDetails = (option: ClientOption | undefined, target: 'primary' | number) => {
    if (!option) return

    if (target === 'primary') {
      setClientData((prev) => ({
        ...prev,
        customerName: option.name,
        customerEmail: option.email ?? '',
        customerPhone: option.phone ?? '',
      }))
    } else {
      setClientData((prev) => {
        const updated = [...prev.additionalParticipants]
        const current = updated[target] ?? { clientId: null, name: '', email: '', phone: '' }
        updated[target] = {
          ...current,
          clientId: option.id,
          name: option.name,
          email: option.email ?? '',
          phone: option.phone ?? '',
        }
        return { ...prev, additionalParticipants: updated }
      })
    }
  }

  const updateParticipantDetail = <K extends keyof ParticipantDetail>(index: number, field: K, value: ParticipantDetail[K]) => {
    const updated = [...clientData.additionalParticipants]
    updated[index] = { ...updated[index], [field]: value }
    setClientData({ ...clientData, additionalParticipants: updated })
  }

  const handleSaveClients = async () => {
    if (!calculatorData || !breakdown || !total) {
      toast({
        title: 'Error',
        description: 'Missing calculation data',
        variant: 'destructive',
      })
      return
    }

    if (!clientData.customerName) {
      toast({
        title: 'Error',
        description: 'Customer name is required',
        variant: 'destructive',
      })
      return
    }

    const activeParticipants = clientData.additionalParticipants.slice(0, calculatorData.participants - 1)
    if (calculatorData.splitPayment && activeParticipants.some((p: ParticipantDetail) => !p.name || !p.email)) {
      toast({
        title: 'Error',
        description: 'All additional participants must have name and email when splitting payments.',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      // First create the quote
      const quoteData = {
        customer_name: clientData.customerName,
        customer_email: clientData.customerEmail || null,
        customer_phone: clientData.customerPhone || null,
        start_date: calculatorData.startDate,
        participants: calculatorData.participants,
        frequency: calculatorData.frequency,
        package_length: calculatorData.packageLength,
        total_sessions: breakdown.totalSessions,
        price_per_session: breakdown.basePricePerSession,
        subtotal: breakdown.subtotal,
        tax_amount: breakdown.taxAmount,
        processing_fee: breakdown.processingFee,
        total_amount: total,
        payment_method: calculatorData.paymentMethod,
        payment_schedule: calculatorData.paymentSchedule,
        down_payment: calculatorData.downPayment,
        discount_percent: calculatorData.discountPercent,
        split_payment: calculatorData.splitPayment,
        split_payment_amount: calculatorData.splitPayment ? breakdown.perPersonPayment : null,
        status: 'accepted',
        notes: clientData.notes || null,
        created_by: user!.id,
      }

      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert(quoteData)
        .select()
        .single()

      if (quoteError) throw quoteError

      // Insert quote participants
      if (calculatorData.participants > 1) {
        const participantRecords = activeParticipants
          .filter((p: ParticipantDetail) => p.name)
          .map((p: ParticipantDetail, index: number) => ({
            quote_id: quote.id,
            participant_index: index + 2,
            full_name: p.name,
            email: p.email || null,
            phone: p.phone || null,
            payment_share: calculatorData.splitPayment ? breakdown.perPersonPayment : null,
            created_by: user!.id,
          }))

        if (participantRecords.length > 0) {
          await supabase.from('quote_participants').insert(participantRecords)
        }
      }

      // Create contract
      const startDate = new Date(calculatorData.startDate)
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + calculatorData.packageLength)
      const endDateISO = endDate.toISOString().split('T')[0]

      const contractNumber = `PFD-${Date.now()}`

      const contractData = {
        quote_id: quote.id,
        contract_number: contractNumber,
        customer_name: clientData.customerName,
        customer_email: clientData.customerEmail || null,
        customer_phone: clientData.customerPhone || null,
        start_date: calculatorData.startDate,
        end_date: endDateISO,
        frequency: calculatorData.frequency,
        package_length: calculatorData.packageLength,
        participants: calculatorData.participants,
        total_sessions: breakdown.totalSessions,
        price_per_session: breakdown.pricePerSession,
        subtotal: breakdown.subtotal,
        tax_amount: breakdown.taxAmount,
        total_amount: total,
        payment_method: calculatorData.paymentMethod,
        payment_schedule: calculatorData.paymentSchedule,
        payment_amount: breakdown.paymentAmount,
        down_payment: calculatorData.downPayment,
        discount_percent: calculatorData.discountPercent,
        split_payment: calculatorData.splitPayment,
        split_payment_amount: calculatorData.splitPayment ? breakdown.perPersonPayment : null,
        status: 'pending',
        notes: clientData.notes || null,
        created_by: user!.id,
      }

      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert(contractData)
        .select()
        .single()

      if (contractError) throw contractError

      // Insert contract participants
      if (calculatorData.participants > 1) {
        const contractParticipantRecords = activeParticipants
          .filter((p: ParticipantDetail) => p.name)
          .map((p: ParticipantDetail, index: number) => ({
            contract_id: contract.id,
            participant_index: index + 2,
            full_name: p.name,
            email: p.email || null,
            phone: p.phone || null,
            payment_share: calculatorData.splitPayment ? breakdown.perPersonPayment : null,
            created_by: user!.id,
          }))

        if (contractParticipantRecords.length > 0) {
          await supabase.from('contract_participants').insert(contractParticipantRecords)
        }
      }

      // Create participant_contracts entries
      const additionalParticipants = clientData.additionalParticipants.slice(0, calculatorData.participants - 1)
      const baseParticipantEntries: ParticipantEntry[] = [
        {
          participantId: primaryClientId,
          name: clientData.customerName,
          email: clientData.customerEmail?.trim() ? clientData.customerEmail.trim() : null,
          phone: clientData.customerPhone?.trim() ? clientData.customerPhone.trim() : null,
        },
        ...additionalParticipants.map<ParticipantEntry>((participant, index) => ({
          participantId: participant.clientId,
          name: participant.name || `Participant ${index + 2}`,
          email: participant.email?.trim() ? participant.email.trim() : null,
          phone: participant.phone?.trim() ? participant.phone.trim() : null,
        })),
      ]

      const entriesWithIds = [...baseParticipantEntries]
      const existingByEmail = new Map<string, string>(
        existingClients
          .filter((client) => client.email)
          .map((client) => [client.email!.toLowerCase(), client.id] as const),
      )

      const newClientPayloads: Array<{ index: number; payload: Omit<Database['public']['Tables']['clients']['Insert'], 'id'> }> = []

      entriesWithIds.forEach((entry, index) => {
        if (entry.participantId) return
        const emailKey = entry.email?.toLowerCase() ?? ''
        if (emailKey && existingByEmail.has(emailKey)) {
          const clientId = existingByEmail.get(emailKey)!
          entriesWithIds[index] = { ...entry, participantId: clientId }
          if (index === 0) setPrimaryClientId(clientId)
          return
        }

        if (!entry.email) return

        const { firstName, lastName } = splitName(entry.name)
        newClientPayloads.push({
          index,
          payload: {
            first_name: firstName,
            last_name: lastName,
            email: entry.email,
            phone: entry.phone ?? null,
            created_by: user!.id,
            is_active: true,
          } satisfies Omit<Database['public']['Tables']['clients']['Insert'], 'id'>,
        })
      })

      if (newClientPayloads.length > 0) {
        const { data: insertedClients, error: insertClientsError } = await supabase
          .from('clients')
          .insert(newClientPayloads.map((item) => item.payload))
          .select('id, first_name, last_name, email, phone')

        if (insertClientsError) throw insertClientsError

        const insertedByEmail = new Map<string, string>()
        insertedClients?.forEach((client) => {
          const emailKey = client.email?.toLowerCase()
          if (emailKey) {
            insertedByEmail.set(emailKey, client.id)
          }
        })

        newClientPayloads.forEach(({ index }) => {
          const emailKey = entriesWithIds[index].email?.toLowerCase()
          if (emailKey && insertedByEmail.has(emailKey)) {
            const clientId = insertedByEmail.get(emailKey)!
            entriesWithIds[index] = { ...entriesWithIds[index], participantId: clientId }
            if (index === 0) setPrimaryClientId(clientId)
          }
        })

        if (insertedClients && insertedClients.length > 0) {
          setExistingClients((prev) => {
            const merged = [...prev]
            insertedClients.forEach((client) => {
              const first = client.first_name?.trim() ?? ''
              const last = client.last_name?.trim() ?? ''
              const name = `${first} ${last}`.trim() || client.email || 'Unnamed Client'
              const label = client.email ? `${name} (${client.email})` : name
              if (!merged.some((existing) => existing.id === client.id)) {
                merged.push({
                  id: client.id,
                  name,
                  label,
                  email: client.email,
                  phone: client.phone,
                })
              }
            })
            return merged
          })
        }
      }

      const participantEntries = entriesWithIds

      const participantContractsData = participantEntries.map((participant, index) => {
        const participantIndex = index + 1
        const isPrimary = index === 0
        const shareMultiplier = calculatorData.splitPayment ? 1 / calculatorData.participants : isPrimary ? 1 : 0
        const subtotalShare = breakdown.subtotal * shareMultiplier
        const taxShare = breakdown.taxAmount * shareMultiplier
        const totalShare = total * shareMultiplier

        return {
          contract_id: contract.id,
          quote_id: quote.id,
          participant_id: participant.participantId ?? null,
          participant_index: participantIndex,
          participant_name: participant.name || `Participant ${participantIndex}`,
          participant_email: participant.email || null,
          participant_phone: participant.phone || null,
          payment_share: totalShare,
          discount_percent: calculatorData.discountPercent,
          contract_number: `${contractNumber}-P${participantIndex}`,
          contract_payload: {
            participantIndex,
            formData: calculatorData,
            breakdown,
          },
          price_per_session: breakdown.pricePerSession,
          subtotal: subtotalShare,
          tax_amount: taxShare,
          total_amount: totalShare,
          payment_schedule: calculatorData.paymentSchedule,
          payment_method: calculatorData.paymentMethod,
          start_date: calculatorData.startDate,
          end_date: endDateISO,
          status: 'pending',
          created_by: user!.id,
        }
      })

      if (participantContractsData.length > 0) {
        await supabase.from('participant_contracts').insert(participantContractsData)
        await supabase
          .from('contracts')
          .update({
            participant_contract_count: participantContractsData.length,
            participant_contract_signed_count: 0,
          })
          .eq('id', contract.id)
      }

      let squareCustomerId: string | null = contract.square_customer_id
      const primaryNameParts = clientData.customerName.trim().split(' ')

      if (!squareCustomerId && clientData.customerEmail) {
        try {
          const customer = await createSquareCustomer({
            givenName: primaryNameParts[0] || clientData.customerName,
            familyName: primaryNameParts.slice(1).join(' ') || undefined,
            emailAddress: clientData.customerEmail,
            phoneNumber: clientData.customerPhone || undefined,
            companyName: undefined,
            note: clientData.notes || undefined,
          })
          squareCustomerId = customer.id
        } catch (squareError) {
          const message = squareError instanceof SquareClientError ? squareError.message : 'Unable to create Square customer'
          console.error('[square] Failed to create customer', squareError)
          toast({
            title: 'Square sync warning',
            description: message,
            variant: 'destructive',
          })
        }
      }

      if (squareCustomerId) {
        const { error: squareUpdateError } = await supabase
          .from('contracts')
          .update({ square_customer_id: squareCustomerId })
          .eq('id', contract.id)

        if (squareUpdateError) {
          console.error('[square] Failed to store customer ID', squareUpdateError)
        }
      }

      setContractId(contract.id)

      toast({
        title: 'Success',
        description: 'Client information saved successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save client information',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    if (contractId) {
      navigate(`/contract/${contractId}`)
    }
  }

  if (!calculatorData || !breakdown || !total) {
    return null
  }

  const participantCount = Math.max(1, calculatorData.participants || 1)
  const installmentCount = Math.max(1, Math.round(breakdown.numberOfPayments ?? 1))
  const paymentSchedule = calculatorData.paymentSchedule ?? 'full'

  const scheduleDescription = (() => {
    if (paymentSchedule === 'monthly') {
      return `${installmentCount} monthly ${installmentCount === 1 ? 'payment' : 'payments'}`
    }
    if (paymentSchedule === 'bi_weekly') {
      return `${installmentCount} bi-weekly ${installmentCount === 1 ? 'payment' : 'payments'}`
    }
    return 'Paid in full (1 payment)'
  })()

  const perParticipantSubtotal = (breakdown.subtotal ?? 0) / participantCount
  const perParticipantTax = (breakdown.taxAmount ?? 0) / participantCount
  const perParticipantProcessing = (breakdown.processingFee ?? 0) / participantCount
  const baseTotal = perParticipantSubtotal + perParticipantTax + perParticipantProcessing
  const downPaymentShare = (calculatorData.downPayment ?? 0) / participantCount
  const paymentShareTotal = Math.max(baseTotal - downPaymentShare, 0)
  const perInstallmentTotal = installmentCount > 0 ? paymentShareTotal / installmentCount : paymentShareTotal

  const subtotalRatio = baseTotal > 0 ? perParticipantSubtotal / baseTotal : 0
  const taxRatio = baseTotal > 0 ? perParticipantTax / baseTotal : 0
  const processingRatio = baseTotal > 0 ? perParticipantProcessing / baseTotal : 0

  const installmentSubtotal = perInstallmentTotal * subtotalRatio
  const installmentTax = perInstallmentTotal * taxRatio
  const installmentProcessing = perInstallmentTotal * processingRatio
  const hasProcessingFee = installmentProcessing > 0.005

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Client Information</h1>
          </div>
          <Button variant="outline" onClick={() => navigate('/calculator')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Calculator
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Primary Client */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Primary Client Information</CardTitle>
              <CardDescription>Enter the main client's contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryClientSelect">Select Existing Client</Label>
                <select
                  id="primaryClientSelect"
                  className="w-full border rounded h-9 px-2"
                  value={primaryClientId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value || null
                    setPrimaryClientId(value)
                    if (value) {
                      const option = existingClients.find((client) => client.id === value)
                      applyClientDetails(option, 'primary')
                    }
                  }}
                  disabled={loading || !!contractId}
                >
                  <option value="">Select client…</option>
                  {existingClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={clientData.customerName}
                  onChange={(e) => setClientData({ ...clientData, customerName: e.target.value })}
                  placeholder="John Doe"
                  disabled={loading || !!contractId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={clientData.customerEmail}
                  onChange={(e) => setClientData({ ...clientData, customerEmail: e.target.value })}
                  placeholder="john@example.com"
                  disabled={loading || !!contractId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={clientData.customerPhone}
                  onChange={(e) => setClientData({ ...clientData, customerPhone: e.target.value })}
                  placeholder="(506) 123-4567"
                  disabled={loading || !!contractId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={clientData.notes}
                  onChange={(e) => setClientData({ ...clientData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  disabled={loading || !!contractId}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Package Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Package Summary</CardTitle>
              <CardDescription>Pricing details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Participants</span>
                <span className="font-medium">{calculatorData.participants}</span>
              </div>
              <div className="flex justify-between">
                <span>Package Length</span>
                <span className="font-medium">{calculatorData.packageLength} month(s)</span>
              </div>
              <div className="flex justify-between">
                <span>Total Sessions</span>
                <span className="font-medium">{breakdown.totalSessions}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span>Subtotal</span>
                <span>{formatCurrency(breakdown.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{formatCurrency(breakdown.taxAmount)}</span>
              </div>
              {breakdown.processingFee > 0 && (
                <div className="flex justify-between">
                  <span>Processing Fee</span>
                  <span>{formatCurrency(breakdown.processingFee)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t font-semibold text-base">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              {calculatorData.splitPayment && (
                <div className="flex justify-between pt-2 border-t text-primary">
                  <span>Per Person</span>
                  <span className="font-semibold">{formatCurrency(breakdown.perPersonPayment)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Additional Participants */}
        {calculatorData.participants > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Additional Participants ({calculatorData.participants - 1})</CardTitle>
              <CardDescription>
                {calculatorData.splitPayment
                  ? 'Enter details for all participants (required for split payment)'
                  : 'Enter details for additional participants (optional)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {clientData.additionalParticipants?.map((participant: ParticipantDetail, index: number) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Participant {index + 2}</h4>
                      {calculatorData.splitPayment && <span className="text-xs text-primary font-medium">Required</span>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`participant-${index}-select`}>Select Existing Client</Label>
                      <select
                        id={`participant-${index}-select`}
                        className="w-full border rounded h-9 px-2"
                        value={participant.clientId ?? ''}
                        onChange={(e) => {
                          const value = e.target.value || null
                          updateParticipantDetail(index, 'clientId', value)
                          if (value) {
                            const option = existingClients.find((client) => client.id === value)
                            applyClientDetails(option, index)
                          }
                        }}
                        disabled={loading || !!contractId}
                      >
                        <option value="">Select client…</option>
                        {existingClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`participant-${index}-name`}>Name {calculatorData.splitPayment && '*'}</Label>
                      <Input
                        id={`participant-${index}-name`}
                        value={participant.name}
                        onChange={(e) => updateParticipantDetail(index, 'name', e.target.value)}
                        placeholder="Jane Doe"
                        disabled={loading || !!contractId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`participant-${index}-email`}>Email {calculatorData.splitPayment && '*'}</Label>
                      <Input
                        id={`participant-${index}-email`}
                        type="email"
                        value={participant.email}
                        onChange={(e) => updateParticipantDetail(index, 'email', e.target.value)}
                        placeholder="jane@example.com"
                        disabled={loading || !!contractId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`participant-${index}-phone`}>Phone</Label>
                      <Input
                        id={`participant-${index}-phone`}
                        type="tel"
                        value={participant.phone}
                        onChange={(e) => updateParticipantDetail(index, 'phone', e.target.value)}
                        placeholder="(506) 123-4567"
                        disabled={loading || !!contractId}
                      />
                    </div>
                    {calculatorData.splitPayment && (
                      <div className="pt-2 border-t space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Payment share: <span className="font-medium text-foreground">{formatCurrency(paymentShareTotal)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">Installments: {scheduleDescription}</p>
                        <p className="text-xs text-muted-foreground">
                          Each installment: Subtotal {formatCurrency(installmentSubtotal)} + Tax {formatCurrency(installmentTax)}
                          {hasProcessingFee ? ` + Processing ${formatCurrency(installmentProcessing)}` : ''} ={' '}
                          <span className="font-medium text-foreground">{formatCurrency(perInstallmentTotal)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex justify-start gap-3">
          {!contractId ? (
            <Button onClick={handleSaveClients} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Clients'
              )}
            </Button>
          ) : (
            <Button onClick={handleContinue} size="lg">
              Continue to Contract
            </Button>
          )}
        </div>
      </div>
    </Layout>
  )
}
