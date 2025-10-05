import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Database } from '@/types/database'
import { ArrowLeft, DollarSign, Loader2 } from 'lucide-react'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ParticipantContractRow = Database['public']['Tables']['participant_contracts']['Row']

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

  const createFormState = (contractData: ContractRow | null): InvoiceFormState | null => {
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
  }

  const [contract, setContract] = useState<ContractRow | null>(contractFromState)
  const [participants, setParticipants] = useState<ParticipantContractRow[]>(participantsFromState)
  const [formData, setFormData] = useState<InvoiceFormState | null>(createFormState(contractFromState))
  const [loading, setLoading] = useState(!contractFromState)
  const [saving, setSaving] = useState(false)
  const [invoicePrepared, setInvoicePrepared] = useState(invoicePreparedFromState)

  useEffect(() => {
    if (!contractId) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const [{ data: contractData, error: contractError }, { data: participantData, error: participantError }] =
          await Promise.all([
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
          ])

        if (contractError) throw contractError
        if (participantError) throw participantError

        setContract(contractData)
        setParticipants(participantData || [])
        setFormData(createFormState(contractData))
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

  const perParticipantLineItems = useMemo(() => {
    if (!participants.length) return []
    return participants.map(participant => ({
      id: participant.id,
      name: participant.participant_name,
      email: participant.participant_email,
      total: participant.total_amount,
      subtotal: participant.subtotal,
      tax: participant.tax_amount,
      schedule: participant.payment_schedule,
      startDate: participant.start_date,
      endDate: participant.end_date,
    }))
  }, [participants])

  const handleChange = (field: keyof InvoiceFormState, value: string) => {
    setFormData(prev => (prev ? { ...prev, [field]: value } : prev))
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

      const squareCustomerId = `CUSTOMER_${Date.now()}`

      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          square_customer_id: squareCustomerId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          customer_email: formData.email,
          customer_phone: formData.phone,
          address_line1: formData.addressLine1,
          address_line2: formData.addressLine2,
          city: formData.city,
          province: formData.province,
          postal_code: formData.postalCode,
          country: formData.country,
          company_name: formData.companyName,
        })
        .eq('id', contractId)

      if (updateError) throw updateError

      const squareInvoiceId = `INVOICE_${Date.now()}`

      const { error: invoiceUpdateError } = await supabase
        .from('contracts')
        .update({
          square_invoice_id: squareInvoiceId,
        })
        .eq('id', contractId)

      if (invoiceUpdateError) throw invoiceUpdateError

      toast({
        title: 'Invoice ready',
        description: 'Contract details synced. Proceed to Square to finalize the invoice.',
      })

      setInvoicePrepared(true)
    } catch (error: any) {
      toast({
        title: 'Invoice creation failed',
        description: error.message || 'Unable to prepare data for Square invoicing.',
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
              <div className="grid gap-3">
                {perParticipantLineItems.map(item => (
                  <div key={item.id} className="border rounded-lg p-3">
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
                  </div>
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
