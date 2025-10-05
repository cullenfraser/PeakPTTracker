import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Printer, ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/types/database'
import SignatureCanvas from 'react-signature-canvas'

type Contract = Database['public']['Tables']['contracts']['Row']
type ParticipantContract = Database['public']['Tables']['participant_contracts']['Row']

export default function ContractPage() {
  const params = useParams<{ contractId: string }>()
  const contractId = params.contractId
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const [contract, setContract] = useState<Contract | null>(null)
  const [participants, setParticipants] = useState<ParticipantContract[]>([])
  const [loading, setLoading] = useState(true)
  const [participantLoading, setParticipantLoading] = useState(true)
  const [continueLoading, setContinueLoading] = useState(false)
  const signatureRef = useRef<SignatureCanvas>(null)
  const parentSignatureRef = useRef<SignatureCanvas>(null)

  const selectedParticipantId = searchParams.get('participantId')

  const activeParticipant = useMemo(() => {
    if (!participants.length) return null

    if (selectedParticipantId) {
      const found = participants.find(p => p.id === selectedParticipantId)
      if (found) return found
    }

    return participants[0]
  }, [participants, selectedParticipantId])

  const allParticipantsSigned = participants.length > 0 && participants.every(p => p.status === 'signed')

  const applyParticipantSelection = (participantId: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.set('participantId', participantId)
      return params
    }, { replace: true })
    signatureRef.current?.clear()
    parentSignatureRef.current?.clear()
  }

  const handleContinue = async () => {
    if (!contract) return
    if (!participants.length) return

    if (!allParticipantsSigned) {
      const pending = participants.find(p => p.status !== 'signed')
      toast({
        title: 'Signatures required',
        description: pending
          ? `Please capture and save signatures for all participants before continuing. Pending participant: ${pending.participant_name}.`
          : 'Please capture and save signatures for all participants before continuing.',
        variant: 'destructive',
      })
      return
    }

    try {
      setContinueLoading(true)
      const signedCount = participants.length
      const { error } = await supabase
        .from('contracts')
        .update({
          participant_contract_signed_count: signedCount,
          status: 'ready_for_invoice',
          updated_at: new Date().toISOString(),
        })
        .eq('id', contract.id)

      if (error) throw error

      navigate(`/contract/${contract.id}/invoice`, {
        state: {
          contract,
          participants,
          invoicePrepared: !!contract.square_invoice_id,
        },
      })
    } catch (error: any) {
      toast({
        title: 'Failed to continue',
        description: error.message || 'Could not move to invoicing. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setContinueLoading(false)
    }
  }

  useEffect(() => {
    if (!contractId) {
      setLoading(false)
      setParticipantLoading(false)
      return
    }

    const id = contractId
    fetchContract(id)
    fetchParticipantContracts(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  const fetchContract = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      setContract(data)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load contract',
        variant: 'destructive',
      })
      navigate('/calculator')
    } finally {
      setLoading(false)
    }
  }

  const fetchParticipantContracts = async (id: string) => {
    try {
      setParticipantLoading(true)
      const { data, error } = await supabase
        .from('participant_contracts')
        .select('*')
        .eq('contract_id', id)
        .order('participant_index', { ascending: true })

      if (error) throw error

      setParticipants(data || [])

      if (data && data.length > 0) {
        const participantIdToSet = selectedParticipantId && data.some(p => p.id === selectedParticipantId)
          ? selectedParticipantId
          : data[0].id

        applyParticipantSelection(participantIdToSet)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load participant contracts',
        variant: 'destructive',
      })
    } finally {
      setParticipantLoading(false)
    }
  }

  const handlePrint = async () => {
    if (!participants.length) {
      window.print()
      return
    }

    if (!allParticipantsSigned) {
      toast({
        title: 'Signatures required',
        description: 'Please capture and save signatures for all participants before printing.',
        variant: 'destructive',
      })
      return
    }

    const originalParticipantId = activeParticipant?.id

    for (const participant of participants) {
      if (participant.id !== activeParticipant?.id) {
        applyParticipantSelection(participant.id)
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      await new Promise(resolve => {
        requestAnimationFrame(() => {
          window.print()
          resolve(null)
        })
      })
    }

    if (originalParticipantId) {
      applyParticipantSelection(originalParticipantId)
    }
  }

  const attemptSaveActiveParticipant = async (): Promise<boolean> => {
    if (!activeParticipant) return true
    if (activeParticipant.status === 'signed') return true

    let signatureData: string | null = null
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      signatureData = signatureRef.current.toDataURL()
    } else if (activeParticipant.signature_data) {
      signatureData = activeParticipant.signature_data
    }

    if (!signatureData) {
      toast({
        title: 'Signature required',
        description: `Please capture and save ${activeParticipant.participant_name}'s signature before switching participants.`,
        variant: 'destructive',
      })
      return false
    }

    const notify = !!(signatureRef.current && !signatureRef.current.isEmpty())
    const updated = await persistParticipantSignature(activeParticipant, signatureData, { notify })
    return !!updated
  }

  const clearParentSignature = () => {
    parentSignatureRef.current?.clear()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    )
  }

  if (!contract) {
    return null
  }

  const handleParticipantChipClick = async (participantId: string) => {
    if (participantId === activeParticipant?.id) return
    const canProceed = await attemptSaveActiveParticipant()
    if (!canProceed) return
    applyParticipantSelection(participantId)
  }

  const handleNavigateParticipant = async (direction: 'prev' | 'next') => {
    if (!activeParticipant) return

    const canProceed = await attemptSaveActiveParticipant()
    if (!canProceed) return

    const currentIndex = participants.findIndex(p => p.id === activeParticipant.id)
    if (currentIndex === -1) return

    const nextIndex = direction === 'prev'
      ? Math.max(0, currentIndex - 1)
      : Math.min(participants.length - 1, currentIndex + 1)

    applyParticipantSelection(participants[nextIndex].id)
  }

  const persistParticipantSignature = async (
    participant: ParticipantContract,
    signatureData: string,
    options?: { notify?: boolean }
  ): Promise<ParticipantContract[] | null> => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to record signatures.',
        variant: 'destructive',
      })
      return null
    }

    try {
      const signedDate = new Date().toISOString()

      const { data: existingSignature, error: existingError } = await supabase
        .from('contract_signatures')
        .select('id')
        .eq('participant_contract_id', participant.id)
        .maybeSingle()

      if (existingError && existingError.code !== 'PGRST116') throw existingError

      const { error: participantError } = await supabase
        .from('participant_contracts')
        .update({
          signature_data: signatureData,
          signed_date: signedDate,
          status: 'signed',
          updated_at: signedDate,
        })
        .eq('id', participant.id)

      if (participantError) throw participantError

      const signerIp = await fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => (data?.ip as string) || null)
        .catch(() => null)

      let signatureMutationError = null as any
      if (existingSignature) {
        const { error } = await supabase
          .from('contract_signatures')
          .update({
            signature_data: signatureData,
            signed_at: signedDate,
            signer_ip: signerIp,
          })
          .eq('id', existingSignature.id)

        signatureMutationError = error
      } else {
        const { error } = await supabase
          .from('contract_signatures')
          .insert({
            contract_id: participant.contract_id!,
            participant_contract_id: participant.id,
            signer_name: participant.participant_name,
            signer_role: 'participant',
            signature_data: signatureData,
            signed_at: signedDate,
            signer_ip: signerIp,
            created_by: user.id,
          })

        signatureMutationError = error
      }

      if (signatureMutationError) throw signatureMutationError

      const updated = participants.map(p => (
        p.id === participant.id
          ? { ...p, signature_data: signatureData, signed_date: signedDate, status: 'signed' }
          : p
      ))
      setParticipants(updated)

      if (options?.notify) {
        toast({
          title: 'Signature saved',
          description: `${participant.participant_name} has signed the contract.`,
        })
      }

      return updated
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save signature',
        variant: 'destructive',
      })
      return null
    }
  }

  const handleSignatureEnd = async () => {
    if (!activeParticipant) return
    if (!signatureRef.current || signatureRef.current.isEmpty()) return
    await persistParticipantSignature(activeParticipant, signatureRef.current.toDataURL())
  }

  const handleClearSignature = async () => {
    signatureRef.current?.clear()
    if (!activeParticipant) return

    try {
      const timestamp = new Date().toISOString()
      const { error } = await supabase
        .from('participant_contracts')
        .update({
          signature_data: null,
          signed_date: null,
          status: 'pending',
          updated_at: timestamp,
        })
        .eq('id', activeParticipant.id)

      if (error) throw error

      await supabase
        .from('contract_signatures')
        .update({
          signature_data: null,
          signed_at: timestamp,
          signer_ip: null,
        })
        .eq('participant_contract_id', activeParticipant.id)

      setParticipants(prev =>
        prev.map(p =>
          p.id === activeParticipant.id
            ? { ...p, signature_data: null, signed_date: null, status: 'pending' }
            : p
        )
      )

      toast({
        title: 'Signature cleared',
        description: `${activeParticipant.participant_name}'s signature has been cleared.`,
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to clear signature',
        variant: 'destructive',
      })
    }
  }

  const handleParentSignatureEnd = () => {
    // Parent/guardian signatures are not persisted separately per requirements.
  }

  // Calculate if client is under 18
  const isMinor = contract.date_of_birth 
    ? new Date().getFullYear() - new Date(contract.date_of_birth).getFullYear() < 18
    : false

  const participantCount = participants.length || contract.participant_contract_count || contract.participants || 1
  const participantSignedCount = participants.filter(p => p.status === 'signed').length
  const participantDisplayName = activeParticipant?.participant_name || contract.customer_name
  const participantEmail = activeParticipant?.participant_email || contract.customer_email
  const participantPhone = activeParticipant?.participant_phone || contract.customer_phone
  const participantTotalDue = activeParticipant?.total_amount
    ?? (contract.split_payment ? (contract.total_amount ?? 0) / Math.max(1, participantCount) : contract.total_amount)
  const participantStatus = activeParticipant?.status || 'pending'
  const isParticipantSigned = !!activeParticipant && activeParticipant.status === 'signed'
  const contractDownPaymentTotal = contract.down_payment ?? 0
  const participantDownPaymentShare = contract.split_payment
    ? contractDownPaymentTotal / Math.max(1, participantCount)
    : contractDownPaymentTotal
  const paymentAmountBase = contract.payment_amount ?? (contract.total_amount ?? 0)
  const participantPaymentPerSchedule = contract.split_payment
    ? (contract.split_payment_amount ?? paymentAmountBase / Math.max(1, participantCount))
    : paymentAmountBase
  const activeSubtotal = activeParticipant?.subtotal ?? (contract.split_payment ? (contract.subtotal ?? 0) / Math.max(1, participantCount) : contract.subtotal ?? 0)
  const activeTaxAmount = activeParticipant?.tax_amount ?? (contract.split_payment ? (contract.tax_amount ?? 0) / Math.max(1, participantCount) : contract.tax_amount ?? 0)
  const activeTotalAmount = participantTotalDue ?? 0
  const activeProcessingFee = contract.payment_method === 'credit_card' ? activeTotalAmount * 0.035 : 0
  const activeBalanceDue = Math.max(0, activeTotalAmount - participantDownPaymentShare)
  const signedParticipant = isParticipantSigned ? activeParticipant : null

  return (
    <div className="min-h-screen bg-background">
      {/* Print controls - hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button onClick={() => navigate('/calculator')} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Calculator
          </Button>
          <div className="flex gap-2">
            <Button onClick={handlePrint} size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print Contract
            </Button>
            {participants.length > 0 && allParticipantsSigned && (
              <Button
                onClick={handleContinue}
                size="sm"
                disabled={continueLoading || participantLoading}
              >
                {continueLoading ? 'Processing…' : 'Continue'}
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Contract content */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.4in;
          }
          body {
            font-size: 7pt !important;
            line-height: 1.1 !important;
          }
          .print-contract {
            padding: 0 !important;
            font-size: 7pt !important;
          }
          .print-contract h1 {
            font-size: 13pt !important;
            margin-bottom: 2pt !important;
          }
          .print-contract h2 {
            font-size: 11pt !important;
            margin-bottom: 3pt !important;
          }
          .print-contract h3 {
            font-size: 9pt !important;
            margin-bottom: 3pt !important;
          }
          .print-contract h4 {
            font-size: 8pt !important;
            margin-bottom: 2pt !important;
          }
          .print-contract h5 {
            font-size: 7.5pt !important;
            margin-bottom: 1pt !important;
          }
          .print-contract p {
            margin-bottom: 1pt !important;
            line-height: 1.05 !important;
          }
          .print-contract .space-y-6 > * + * {
            margin-top: 2pt !important;
          }
          .print-contract .space-y-4 > * + * {
            margin-top: 1pt !important;
          }
          .print-contract .space-y-3 > * + * {
            margin-top: 1pt !important;
          }
          .print-contract .space-y-2 > * + * {
            margin-top: 0.5pt !important;
          }
          .print-contract .mb-8 {
            margin-bottom: 2pt !important;
          }
          .print-contract .mb-6 {
            margin-bottom: 2pt !important;
          }
          .print-contract .mb-4 {
            margin-bottom: 1pt !important;
          }
          .print-contract .mb-3 {
            margin-bottom: 1pt !important;
          }
          .print-contract .mb-2 {
            margin-bottom: 0.5pt !important;
          }
          .print-contract .mb-1 {
            margin-bottom: 0.5pt !important;
          }
          .print-contract .pt-6 {
            padding-top: 1pt !important;
          }
          .print-contract .pt-4 {
            padding-top: 1pt !important;
          }
          .print-contract .p-4 {
            padding: 2pt !important;
          }
          .print-contract ul {
            margin-top: 0.5pt !important;
            margin-bottom: 0.5pt !important;
          }
          .print-contract li {
            margin-bottom: 0.5pt !important;
            line-height: 1.05 !important;
          }
          .print-contract .gap-4 {
            gap: 2pt !important;
          }
          .print-contract .gap-3 {
            gap: 2pt !important;
          }
          .print-contract .gap-2 {
            gap: 1pt !important;
          }
          .print-contract canvas {
            border: 1px solid black !important;
            display: block !important;
            height: 40px !important;
          }
          .print-contract .grid {
            gap: 2pt !important;
          }
          .print-contract input[type="checkbox"] {
            width: 10px !important;
            height: 10px !important;
          }
          .signature-section {
            page-break-inside: avoid !important;
          }
          .print-contract .text-center {
            margin-bottom: 3pt !important;
          }
          .print-contract .border-2 {
            border-width: 1px !important;
          }
        }
      `}</style>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="space-y-4 no-print">
          {participants.length > 0 && (
            <div className="bg-card border rounded-lg p-4 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">Participant Signing</p>
                  <h2 className="text-xl font-semibold">{participantDisplayName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {participantStatus === 'signed' ? 'Signed' : 'Awaiting signature'} • {participantSignedCount}/{participants.length} signed
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="icon" onClick={() => void handleNavigateParticipant('prev')} disabled={!activeParticipant || participants.length <= 1 || participantLoading}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => void handleNavigateParticipant('next')} disabled={!activeParticipant || participants.length <= 1 || participantLoading}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {participants.length > 1 && (
                    <Button onClick={() => void handleNavigateParticipant('next')} disabled={!activeParticipant || participantLoading}>
                      Next Participant
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {participants.map(participant => (
                  <Button
                    key={participant.id}
                    variant={participant.id === activeParticipant?.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => void handleParticipantChipClick(participant.id)}
                  >
                    {participant.participant_name}
                    {participant.status === 'signed' && <ShieldCheck className="h-3 w-3 ml-2" />}
                  </Button>
                ))}
              </div>
              {activeParticipant && (
                <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                  <div>
                    <p className="uppercase tracking-wide text-xs mb-1">Payment Amount</p>
                    <p className="text-lg font-semibold">{formatCurrency(participantTotalDue ?? contract.total_amount ?? 0)}</p>
                    {contract.split_payment && (
                      <p className="text-xs">Split payment across {participants.length} participant(s).</p>
                    )}
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-xs mb-1">Contact</p>
                    <p>{participantEmail || 'No email provided'}</p>
                    {participantPhone && <p>{participantPhone}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white text-black p-8 md:p-12 rounded-lg shadow-lg print:shadow-none print:rounded-none text-sm print-contract mt-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">PEAK FITNESS DIEPPE LTD</h1>
            <h2 className="text-xl font-semibold">MEMBERSHIP AND SERVICES AGREEMENT</h2>
          </div>

          {/* Introduction */}
          <div className="mb-6 text-justify">
            <p>
              This Membership and Services Agreement ("Agreement") is made and entered into by and between 
              Peak Fitness Dieppe LTD ("Peak Fitness"), a company incorporated and existing under the laws 
              of New Brunswick, Canada, with its principal place of business located at 688 Babin St., Dieppe, 
              New Brunswick, and the undersigned member ("Member").
            </p>
          </div>

          {/* Section 1: Membership and Services */}
          <div className="mb-6">
            <h3 className="font-bold text-lg mb-3">1. Membership and Services</h3>
            
            {/* 1.1.1 Group Fitness Membership */}
            <div className="mb-4">
              <h4 className="font-semibold mb-2">1.1.1 Group Fitness Membership</h4>
              <p className="mb-2">The Member selects the following Group Fitness Membership options:</p>
              <div className="ml-4 flex flex-wrap gap-4">
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>Good Membership</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>Best Membership</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>Punch Pass</span>
                </div>
              </div>
            </div>

            {/* 1.1.2 Length of Membership */}
            <div className="mb-4">
              <h4 className="font-semibold mb-2">1.1.2 Length of Membership</h4>
              <div className="ml-4 flex flex-wrap gap-4">
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>Month-to-Month</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>3 Month Membership</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>6 Month Membership</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>12 Month Membership</span>
                </div>
              </div>
            </div>

            {/* 1.2 Personal Training */}
            <div className="mb-4">
              <h4 className="font-semibold mb-2">1.2 Personal Training</h4>
              <p className="mb-2">The Member selects the following Personal Training options:</p>
              
              {/* 1.2.1 Number of Sessions */}
              <div className="ml-4 mb-3">
                <h5 className="font-semibold mb-1">1.2.1 Number of Sessions</h5>
                <div className="border-b border-black inline-block px-2 font-bold">
                  {contract.total_sessions}
                </div>
              </div>

              {/* 1.2.2 Frequency Commitment */}
              <div className="ml-4 mb-3">
                <h5 className="font-semibold mb-1">1.2.2 Frequency Commitment:</h5>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'once_month'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>Once a Month</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'bi_weekly'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>Bi-Weekly</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'once_week'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>1x per week</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'twice_week'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>2x per week</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'three_week'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>3x per week</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'four_week'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>4x per week</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.frequency === 'five_week'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>5x per week</span>
                  </div>
                </div>
              </div>

              {/* 1.2.3 Monthly Commitment */}
              <div className="ml-4 mb-3">
                <h5 className="font-semibold mb-1">1.2.3 Monthly Commitment</h5>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.payment_schedule === 'monthly' || contract.payment_schedule === 'full'} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>Month-to-Month</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={false} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>3 Month Commitment</span>
                  </div>
                </div>
              </div>

              {/* 1.2.4 Training Type */}
              <div className="ml-4 mb-3">
                <h5 className="font-semibold mb-1">1.2.4 Training Type</h5>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.participants === 1} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>Individual Training (1 person)</span>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={contract.participants >= 2} 
                      disabled 
                      className="mr-2" 
                    />
                    <span>Small Group Training (2-4 people)</span>
                  </div>
                </div>
              </div>

              {/* 1.2.5 Personal Training Starter Packages */}
              <div className="ml-4 mb-3">
                <h5 className="font-semibold mb-1">1.2.5 Personal Training Starter Packages</h5>
                <p className="mb-1">The Member selects the following Starter Package option:</p>
                <div className="flex items-center">
                  <input type="checkbox" disabled className="mr-2" />
                  <span>4 Session Package (1 Month)</span>
                </div>
                <p className="text-xs italic mt-1">Note: Starter packages can only be purchased once per person.</p>
              </div>
            </div>

            {/* 1.4 Online Coaching */}
            <div className="mb-4">
              <h4 className="font-semibold mb-2">1.4 Online Coaching</h4>
              <p className="mb-2">The Member selects the following Online Coaching option (please specify):</p>
              <div className="ml-4">
                <p className="mb-1">Number of sessions per week: <span className="border-b border-black inline-block px-2">0</span></p>
                <p className="mb-2">Monthly Commitment:</p>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center">
                    <input type="checkbox" disabled className="mr-2" />
                    <span>3 Month Commitment</span>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" disabled className="mr-2" />
                    <span>6 Month Commitment</span>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" disabled className="mr-2" />
                    <span>9 Month Commitment</span>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" disabled className="mr-2" />
                    <span>12 Month Commitment</span>
                  </div>
                </div>
                <p className="text-xs italic mt-1">Delivered via TrainHeroic</p>
              </div>
            </div>
          </div>

          {/* Section 2: Payment Terms */}
          <div className="mb-6">
            <h3 className="font-bold text-lg mb-3">2. Payment Terms</h3>
            <p className="mb-2">
              The Member agrees to pay the total amount as specified based on the selected services. 
              Payment can be made in one of the following ways (please check one):
            </p>
            <div className="grid grid-cols-2 gap-2 ml-4">
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_schedule === 'full'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Paid in Full</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_method === 'cash'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Cash</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_schedule === 'monthly'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Monthly</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_method === 'credit_card'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Credit Card</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_schedule === 'bi_weekly'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Bi-Weekly</span>
              </div>
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={contract.payment_method === 'emt'} 
                  disabled 
                  className="mr-2" 
                />
                <span>Debit / EMT</span>
              </div>
            </div>
          </div>

          {/* Sections 3-15: Policies and Terms */}
          <div className="mb-6 space-y-4 text-justify">
            <div>
              <h3 className="font-bold text-lg mb-2">3. Membership Policy</h3>
              <p className="mb-2">
                Monthly, and Legacy Memberships require a 30-day cancellation notice in writing. 
                To cancel your membership, contact us at info@peakfitnessdieppe.ca.
              </p>
              <p className="mb-2">
                6-month and annual memberships require forfeiture of 50% of the monthly fee for the 
                remaining months of the agreement if canceled before the term ends, with the following 
                exceptions: if the member moves outside of the Greater Moncton area (which includes Dieppe, 
                Moncton, Riverview, Shediac, and surrounding areas) or if the member provides notice from 
                a doctor, physiotherapist, or other registered health professional.
              </p>
              <p className="mb-2">
                Punch Passes expire 3 months from the date of purchase and are non-refundable.
              </p>
              <p>
                Drop-ins provide single access to a class and are non-refundable.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">4. Hold Policy</h3>
              <p className="mb-2">
                For Legacy and Good Plan Memberships, a $15 fee applies to place the membership on hold, 
                for a maximum of 2 weeks.
              </p>
              <p className="mb-2">
                For Better Plan and Best Plan memberships, you can place your membership on hold for a 
                maximum of 2 weeks without any fees.
              </p>
              <p className="mb-2">
                If a hold longer than 2 weeks is needed, the membership will need to be canceled, following 
                the membership policies noted above.
              </p>
              <p className="mb-2">
                For Legacy memberships, rejoining will require purchasing a current membership plan.
              </p>
              <p>
                To place your membership on hold, please contact us at info@peakfitnessdieppe.ca.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">5. Group Fitness Classes</h3>
              <p>
                Class schedules are subject to change. Advanced booking is recommended. Cancellations 
                should be made as early as possible to allow others to participate.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">6. Personal Training Rules</h3>
              <p className="mb-2">
                To cancel a personal training agreement, client will forfeit 50% of the remaining sessions 
                on the agreement, if canceled before the term ends, with the following exceptions: if the 
                client moves outside of the Greater Moncton area (which includes Dieppe, Moncton, Riverview, 
                Shediac, and surrounding areas) or if the member provides notice from a doctor, physiotherapist, 
                or other registered health professional.
              </p>
              <p className="mb-2">
                Cancellations of sessions with less than 12 hours' notice will result in forfeiture of the session.
              </p>
              <p>
                SGPT "Small Group Personal Training" proceeds if at least one participant attends. The remaining 
                participants not in attendance will forfeit the session.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">8. Advertising and Publicity</h3>
              <p>
                By participating in Peak Fitness services, you consent to being photographed or videotaped. 
                Images may be used for marketing purposes unless you notify us in writing.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">9. Member Responsibilities</h3>
              <p>
                Members are expected to arrive on time, provide accurate health information, and adhere to 
                the Code of Conduct.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">10. Community Events</h3>
              <p>
                Participation in events may require pre-registration and fees. Refunds are only issued if 
                the event is canceled by Peak Fitness or Peak Nutrition.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">11. Code of Conduct</h3>
              <ul className="list-disc ml-6 space-y-1">
                <li>Respect all members, staff, and guests. Discrimination, harassment, or inappropriate behavior will not be tolerated.</li>
                <li>Use equipment responsibly and adhere to gym etiquette, including wiping down equipment after use and returning weights to their designated areas.</li>
                <li>Wear appropriate fitness attire and footwear at all times.</li>
                <li>Follow all safety guidelines and instructions provided by staff or trainers.</li>
                <li>Ensure personal belongings are kept in your vehicle or designated areas. Peak Fitness is not responsible for lost or stolen items.</li>
                <li>Report any damaged equipment, injuries, or safety concerns to staff immediately.</li>
                <li>Refrain from using mobile devices for phone calls in workout areas to respect others' experience.</li>
                <li>Failure to comply with the Code of Conduct may result in suspension or termination of membership without refund.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">12. Peak Fitness Rights</h3>
              <p>
                We reserve the right to modify schedules, terminate memberships for violations, and offer 
                promotions with specific terms.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">13. Digital Services</h3>
              <p>
                Use of third-party apps is subject to their terms. Peak Fitness is not responsible for 
                technical issues or data breaches.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">14. Liability Waiver</h3>
              <p>
                Peak Fitness is not responsible for any personal property that is damaged, lost, or stolen 
                while on or around the premises.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">15. Entire Agreement</h3>
              <p>
                This Agreement constitutes the entire agreement between the parties and supersedes all prior 
                agreements and understandings, whether written or oral, relating to the subject matter herein.
              </p>
            </div>
          </div>

          {/* Section 16: Cost of Services */}
          <div className="mb-8 border-2 border-black p-4">
            <h3 className="font-bold text-lg mb-3">16. Cost of Services</h3>
            <div className="grid grid-cols-2 gap-y-2">
              <div>Subtotal:</div>
              <div className="font-bold">{formatCurrency(activeSubtotal)}</div>

              <div>Taxes:</div>
              <div className="font-bold">{formatCurrency(activeTaxAmount)}</div>

              <div>Total Cost with Taxes:</div>
              <div className="font-bold">{formatCurrency(activeTotalAmount)}</div>

              {participantDownPaymentShare > 0 && (
                <>
                  <div>Down Payment:</div>
                  <div className="font-bold">{formatCurrency(participantDownPaymentShare)}</div>
                </>
              )}

              <div>Balance Due:</div>
              <div className="font-bold">{formatCurrency(activeBalanceDue)}</div>

              <div>Payment Terms:</div>
              <div className="font-bold">
                {formatCurrency(participantPaymentPerSchedule)} {contract.payment_schedule === 'monthly' ? 'Monthly' : contract.payment_schedule === 'bi_weekly' ? 'Bi-Weekly' : 'Full Payment'}
              </div>

              <div>Processing Fee:</div>
              <div className="font-bold">{formatCurrency(activeProcessingFee)}</div>
            </div>
          </div>

          {/* Client Information Section */}
          <div className="mb-8 border-t-2 border-black pt-6">
            <h3 className="font-bold text-lg mb-4">Client Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Full Name:</p>
                <p className="font-medium">{participantDisplayName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email:</p>
                <p className="font-medium">{participantEmail || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone:</p>
                <p className="font-medium">{participantPhone || '—'}</p>
              </div>
              {contract.date_of_birth && (
                <div>
                  <p className="text-sm text-gray-600">Date of Birth:</p>
                  <p className="font-medium">{formatDate(contract.date_of_birth)}</p>
                </div>
              )}
              {contract.address_line1 && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Address:</p>
                  <p className="font-medium">
                    {contract.address_line1}
                    {contract.address_line2 && `, ${contract.address_line2}`}
                  </p>
                  <p className="font-medium">
                    {contract.city}, {contract.province} {contract.postal_code}
                  </p>
                  {contract.country && <p className="font-medium">{contract.country}</p>}
                </div>
              )}
              {contract.emergency_contact_name && (
                <>
                  <div className="col-span-2 mt-4">
                    <p className="text-sm text-gray-600 font-semibold">Emergency Contact:</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Name:</p>
                    <p className="font-medium">{contract.emergency_contact_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone:</p>
                    <p className="font-medium">{contract.emergency_contact_phone || '—'}</p>
                  </div>
                  {contract.emergency_contact_relationship && (
                    <div>
                      <p className="text-sm text-gray-600">Relationship:</p>
                      <p className="font-medium">{contract.emergency_contact_relationship || '—'}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Signature Section */}
          <div className="mb-6 signature-section">
            {signedParticipant ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-2">Member Signature:</p>
                  {signedParticipant.signature_data ? (
                    <img src={signedParticipant.signature_data} alt="Member Signature" className="border border-black h-24 print:h-16" />
                  ) : (
                    <div className="border border-black h-24 print:h-16"></div>
                  )}
                  <p className="mt-2">Date: {signedParticipant.signed_date ? formatDate(signedParticipant.signed_date) : '—'}</p>
                </div>
                {isMinor && (
                  <div>
                    <p className="mb-2">Parent/Guardian Signature (if applicable):</p>
                    <div className="border border-black h-24 print:h-16"></div>
                    <p className="mt-2">Date: ______________</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="mb-2 font-semibold">Member Signature:</p>
                  <div className="border-2 border-gray-400 rounded print:border-black print:rounded-none">
                    <SignatureCanvas
                      ref={signatureRef}
                      onEnd={handleSignatureEnd}
                      canvasProps={{
                        className: 'w-full h-32 cursor-crosshair print:h-16',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2 no-print">
                    <Button onClick={handleClearSignature} variant="outline" size="sm">
                      Clear Signature
                    </Button>
                  </div>
                </div>
                {isMinor && (
                  <div>
                    <p className="mb-2 font-semibold">Parent/Guardian Signature (if applicable):</p>
                    <div className="border-2 border-gray-400 rounded print:border-black print:rounded-none">
                      <SignatureCanvas
                        ref={parentSignatureRef}
                        onEnd={handleParentSignatureEnd}
                        canvasProps={{
                          className: 'w-full h-32 cursor-crosshair print:h-16',
                        }}
                      />
                      <div className="flex items-center gap-2 mt-2 no-print">
                        <Button onClick={clearParentSignature} variant="outline" size="sm">
                          Clear Signature
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div className="text-center border-t-2 border-black pt-4">
            <h3 className="font-bold mb-2">Contact Information</h3>
            <p>For any questions or concerns, please contact us at:</p>
            <p className="font-semibold">info@peakfitnessdieppe.ca</p>
          </div>
        </div>
      </div>
    </div>
  )
}
