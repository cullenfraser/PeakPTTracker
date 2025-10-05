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
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Users, Loader2, ArrowLeft } from 'lucide-react'

type ParticipantDetail = {
  name: string
  email: string
  phone: string
}

type ClientFormData = {
  customerName: string
  customerEmail: string
  customerPhone: string
  notes: string
  additionalParticipants: ParticipantDetail[]
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

  const [clientData, setClientData] = useState<ClientFormData>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    additionalParticipants: Array.from(
      { length: calculatorData?.participants ? calculatorData.participants - 1 : 0 },
      () => ({ name: '', email: '', phone: '' })
    ),
  })

  const updateParticipantDetail = (index: number, field: keyof ParticipantDetail, value: string) => {
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
      const participantEntries = [
        {
          name: clientData.customerName,
          email: clientData.customerEmail,
          phone: clientData.customerPhone,
        },
        ...additionalParticipants.map((participant, index) => ({
          name: participant.name || `Participant ${index + 2}`,
          email: participant.email,
          phone: participant.phone,
        })),
      ]

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
          participant_id: null,
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
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground">
                          Payment share: <span className="font-medium text-foreground">{formatCurrency(breakdown.perPersonPayment)}</span>
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
        <div className="flex justify-end gap-3">
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
