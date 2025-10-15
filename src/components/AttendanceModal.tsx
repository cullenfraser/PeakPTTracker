import { useState, useEffect, useMemo, ChangeEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, XCircle, Clock, Loader2, Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { Database } from '@/types/database'

interface TrainerOption {
  id: string
  first_name?: string | null
  last_name?: string | null
}

interface AttendanceModalProps {
  open: boolean
  onClose: () => void
  session: any
  onUpdate: () => void
  onTrainerUpdated?: (trainerId: string | null) => void
  trainers: Array<TrainerOption & { level?: number | null }>
  isAdmin: boolean
}

type ParticipantRow = {
  id: string
  contract_id: string | null
  participant_name?: string | null
  participant_email?: string | null
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1 on 1',
  small_group: 'Small Group',
  peak_class: 'Peak Class',
  pfa_class: 'PFA Class',
  pfa_team: 'PFA Team',
}

const CONTRACT_SESSION_TYPES = new Set(['1_on_1', 'small_group'])

// Fixed trainer pay for certain session types (flat amount regardless of trainer level)
const FIXED_TRAINER_PAY: Record<string, number> = {
  peak_class: 25.0,
  meeting: 22.5,
  tasks: 22.5,
  pfa_class: 30.0,
  pfa_team: 40.0,
}

const formatTimeDisplay = (time?: string | null) => {
  if (!time) return '—'

  const [hours, minutes] = time.split(':')
  if (hours === undefined || minutes === undefined) {
    return time
  }

  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const formatSessionType = (value?: string | null) => {
  if (!value) return '—'
  const normalized = value.toLowerCase()
  if (SESSION_TYPE_LABELS[normalized]) {
    return SESSION_TYPE_LABELS[normalized]
  }
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function AttendanceModal({
  open,
  onClose,
  session,
  onUpdate,
  onTrainerUpdated,
  trainers,
  isAdmin,
}: AttendanceModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [sessionStatus, setSessionStatus] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleStart, setRescheduleStart] = useState('')
  const [rescheduleEnd, setRescheduleEnd] = useState('')
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({})
  const [remainingSessionsMap, setRemainingSessionsMap] = useState<Record<string, number>>({})
  const [hasSavedAttendance, setHasSavedAttendance] = useState(false)
  const [editMode, setEditMode] = useState(true)
  const [initialAttendanceState, setInitialAttendanceState] = useState<Record<string, string>>({})
  const [initialStatusState, setInitialStatusState] = useState('')
  const [trainerId, setTrainerId] = useState<string>('')
  const [initialTrainerId, setInitialTrainerId] = useState<string>('')
  const [trainerSaving, setTrainerSaving] = useState(false)
  const [sessionRate, setSessionRate] = useState<number | null>(null)
  const [trainerLevel, setTrainerLevel] = useState<number | null>(null)
  const [contractDiscountPercent, setContractDiscountPercent] = useState<number | null>(null)
  const [pendingReschedule, setPendingReschedule] = useState<{ newDate: string; newStart: string; newEnd: string } | null>(null)

  const sessionTypeKey = useMemo(() => (session?.session_type ?? '').toLowerCase(), [session?.session_type])
  const isContractSession = useMemo(() => CONTRACT_SESSION_TYPES.has(sessionTypeKey), [sessionTypeKey])

  useEffect(() => {
    if (session && open) {
      // Initialize attendance for all participants
      const participantIds: string[] = isContractSession
        ? Array.from(new Set<string>(Array.isArray(session.participant_ids) ? (session.participant_ids as string[]) : []))
        : []
      const storedAttendance = (session.attendance_data as Record<string, string> | null) ?? null
      const initialAttendance: Record<string, string> = {}
      participantIds.forEach((id: string) => {
        initialAttendance[id] = storedAttendance?.[id] ?? ''
      })
      setAttendance(initialAttendance)
      setInitialAttendanceState({ ...initialAttendance })
      setNotes(session.notes || '')
      const storedStatus = typeof session.status === 'string' ? session.status : ''
      setSessionStatus(storedStatus)
      setInitialStatusState(storedStatus)

      const hasRecordedAttendance = Boolean(
        storedAttendance
          && Object.values(storedAttendance).some(
            (value) => typeof value === 'string' && value.trim().length > 0,
          ),
      )

      const saved = Boolean(
        hasRecordedAttendance
          || (storedStatus && storedStatus !== 'scheduled')
          || (typeof session.notes === 'string' && session.notes.trim().length > 0),
      )
      setHasSavedAttendance(saved)
      setEditMode(!saved)

      const sessionDate = session.session_date ? new Date(session.session_date) : null
      setRescheduleDate(sessionDate ? sessionDate.toISOString().split('T')[0] : '')
      setRescheduleStart(session.start_time ?? '')
      setRescheduleEnd(session.end_time ?? '')

      const nextTrainerId = session.trainer_id ?? ''
      setTrainerId(nextTrainerId)
      setInitialTrainerId(nextTrainerId)

      if (isContractSession) {
        void fetchParticipantDetails(participantIds)
        void loadSessionRate(session.contract_id)
      } else {
        setParticipantNames({})
        setRemainingSessionsMap({})
        setSessionRate(null)
        setContractDiscountPercent(null)
      }
      void loadTrainerLevel(nextTrainerId)
    }
  }, [session, open, isContractSession])

  const formatTrainerName = (trainer?: { first_name?: string | null; last_name?: string | null } | null) => {
    if (!trainer) return null
    const first = trainer.first_name?.trim() ?? ''
    const last = trainer.last_name?.trim() ?? ''
    const combined = `${first} ${last}`.trim()
    return combined.length > 0 ? combined : null
  }

  const currentTrainerName = useMemo(() => {
    if (trainerId) {
      const match = trainers.find((option) => option.id === trainerId)
      if (match) {
        const formatted = formatTrainerName(match)
        if (formatted) return formatted
      }
    }
    const fromSession = session?.trainer ? formatTrainerName(session.trainer) : null
    return fromSession ?? null
  }, [trainerId, trainers, session?.trainer])

  const trainerSelectionChanged = useMemo(() => trainerId !== initialTrainerId, [trainerId, initialTrainerId])

  const handleTrainerUpdate = async () => {
    if (!isAdmin) return
    if (!session) return
    if (!trainerSelectionChanged) {
      toast({ title: 'No changes', description: 'Select a different trainer before saving.' })
      return
    }

    try {
      setTrainerSaving(true)
      const sanitizedTrainerId = trainerId.trim()
      const trainerPayload: Database['public']['Tables']['training_sessions']['Update'] = sanitizedTrainerId
        ? { trainer_id: sanitizedTrainerId }
        : { trainer_id: undefined }
      const { error } = await supabase
        .from('training_sessions')
        .update(trainerPayload)
        .eq('id', session.id)

      if (error) throw error

      setInitialTrainerId(sanitizedTrainerId)
      toast({ title: 'Trainer updated' })
      onTrainerUpdated?.(sanitizedTrainerId || null)
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Unable to assign trainer right now.',
        variant: 'destructive',
      })
    } finally {
      setTrainerSaving(false)
    }
  }

  const fetchParticipantDetails = async (ids: string[]) => {
    if (!ids.length) {
      setParticipantNames({})
      setRemainingSessionsMap({})
      return
    }

    try {
      const { data, error } = await supabase
        .from('participant_contracts')
        .select('id, participant_name, participant_email, contract_id')
        .in('id', ids)

      if (error) throw error

      const map: Record<string, string> = {}
      const records: ParticipantRow[] = (data ?? []) as ParticipantRow[]
      records.forEach((participant) => {
        const displayName = participant.participant_name?.trim()
          || participant.participant_email?.trim()
          || participant.id
        map[participant.id] = displayName
      })

      setParticipantNames(map)
      await loadRemainingSessions(records)
    } catch (error) {
      console.error('Failed to load participant details', error)
      setParticipantNames({})
      setRemainingSessionsMap({})
    }
  }

  const handleCancelSession = async () => {
    if (!editMode) {
      toast({ title: 'View only', description: 'Click Edit Session to cancel.', variant: 'destructive' })
      return
    }
    if (!session) return
    const confirmCancel = window.confirm('Are you sure you want to cancel this session? This will remove it from all calendars.')
    if (!confirmCancel) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('training_sessions')
        .delete()
        .eq('id', session.id)

      if (error) throw error

      toast({
        title: 'Session cancelled',
        description: 'The session has been removed from all calendars.',
      })

      onUpdate()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Cancellation failed',
        description: error.message || 'Unable to cancel the session right now.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadRemainingSessions = async (
    participants: Array<{ id: string; contract_id: string | null }>,
  ) => {
    const filtered = participants.filter((participant) => !!participant.contract_id)
    if (!filtered.length) {
      setRemainingSessionsMap({})
      return
    }

    const contractIds = Array.from(new Set(filtered.map((participant) => participant.contract_id as string)))

    const contractTotals: Record<string, number | null> = {}
    if (session?.contract_id && typeof session.contract?.total_sessions === 'number') {
      contractTotals[session.contract_id] = session.contract.total_sessions
    }

    const missingContractIds = contractIds.filter((id) => contractTotals[id] === undefined)
    if (missingContractIds.length) {
      const { data: contractData, error: contractError } = await supabase
        .from('contracts')
        .select('id, total_sessions')
        .in('id', missingContractIds)

      if (contractError) {
        console.error('Failed to load contract totals', contractError)
      } else {
        contractData?.forEach((contract) => {
          contractTotals[contract.id] = typeof contract.total_sessions === 'number' ? contract.total_sessions : null
        })
      }
    }

    const { data: sessionRows, error: sessionError } = await supabase
      .from('training_sessions')
      .select('contract_id, participant_ids, status, attendance_data')
      .in('contract_id', contractIds)

    if (sessionError) {
      console.error('Failed to load sessions for remaining count', sessionError)
      setRemainingSessionsMap({})
      return
    }

    const consumedStatuses = new Set(['completed', 'late_cancellation', 'no_show'])
    const usedCountsByContract: Record<string, Record<string, number>> = {}
    contractIds.forEach((id) => {
      usedCountsByContract[id] = {}
    })

    sessionRows?.forEach((row: any) => {
      const contractId: string | null = row.contract_id
      if (!contractId) return
      const status = (row.status ?? '').toLowerCase()
      const attendance = (row.attendance_data ?? {}) as Record<string, string>
      const hasAnyPresent = Object.values(attendance).some((v) => v === 'present')
      const isConsumed = consumedStatuses.has(status) || hasAnyPresent
      if (!isConsumed) return
      const participantsInSession: string[] = Array.isArray(row.participant_ids) ? (row.participant_ids as string[]) : []
      participantsInSession.forEach((participantId: string) => {
        if (!usedCountsByContract[contractId][participantId]) {
          usedCountsByContract[contractId][participantId] = 0
        }
        usedCountsByContract[contractId][participantId] += 1
      })
    })

    const remainingMap: Record<string, number> = {}

    filtered.forEach((participant) => {
      const contractId = participant.contract_id as string
      const totalSessions = contractTotals[contractId]
      if (typeof totalSessions !== 'number') return
      const usedCounts = usedCountsByContract[contractId] ?? {}
      const used = usedCounts[participant.id] ?? 0
      remainingMap[participant.id] = Math.max(totalSessions - used, 0)
    })

    setRemainingSessionsMap(remainingMap)
  }

  const loadSessionRate = async (contractId: string | null) => {
    if (!CONTRACT_SESSION_TYPES.has((session?.session_type ?? '').toLowerCase())) {
      setSessionRate(null)
      setContractDiscountPercent(null)
      return
    }

    if (!contractId) {
      setSessionRate(null)
      setContractDiscountPercent(null)
      return
    }

    if (typeof session?.contract?.price_per_session === 'number') {
      setSessionRate(session.contract.price_per_session)
      // If discount is already available on joined contract, prefer it
      if (typeof (session as any)?.contract?.discount_percent === 'number') {
        setContractDiscountPercent((session as any).contract.discount_percent)
      } else {
        setContractDiscountPercent(null)
      }
      return
    }

    const { data, error } = await supabase
      .from('contracts')
      .select('price_per_session, discount_percent')
      .eq('id', contractId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load session rate', error)
      setSessionRate(null)
      setContractDiscountPercent(null)
      return
    }

    setSessionRate(data?.price_per_session ?? null)
    setContractDiscountPercent(
      typeof data?.discount_percent === 'number' ? data.discount_percent : null,
    )
  }

  const loadTrainerLevel = async (trainerIdToLoad: string | null) => {
    if (!trainerIdToLoad) {
      setTrainerLevel(null)
      return
    }

    const match = trainers.find((option) => option.id === trainerIdToLoad)
    if (match && typeof (match as any).level === 'number') {
      setTrainerLevel((match as any).level ?? null)
      return
    }

    const { data, error } = await supabase
      .from('trainers')
      .select('level')
      .eq('id', trainerIdToLoad)
      .maybeSingle()

    if (error) {
      console.error('Failed to load trainer level', error)
      setTrainerLevel(null)
      return
    }

    setTrainerLevel(typeof data?.level === 'number' ? data.level : null)
  }

  useEffect(() => {
    if (trainerId) {
      void loadTrainerLevel(trainerId)
    }
  }, [trainerId])

  const trainerPayRate = useMemo(() => {
    switch (trainerLevel ?? 0) {
      case 1:
        return 0.35
      case 2:
        return 0.4
      case 3:
        return 0.45
      case 4:
        return 0.5
      default:
        return null
    }
  }, [trainerLevel])

  const effectiveTrainerPayRate = useMemo(() => {
    if (trainerPayRate == null) return null
    const discount = Math.max(0, contractDiscountPercent ?? 0) / 100
    return Math.max(0, trainerPayRate - discount)
  }, [trainerPayRate, contractDiscountPercent])

  const trainerPayAmount = useMemo(() => {
    if (effectiveTrainerPayRate == null || sessionRate == null) return null
    return sessionRate * effectiveTrainerPayRate
  }, [sessionRate, effectiveTrainerPayRate])

  // Fixed overrides for trainer pay based on session type
  const fixedTrainerPayAmount = useMemo(() => {
    const key = (session?.session_type || '').toLowerCase()
    return FIXED_TRAINER_PAY[key] ?? null
  }, [session?.session_type])

  const trainerPayDisplayAmount = useMemo(() => {
    return fixedTrainerPayAmount != null ? fixedTrainerPayAmount : trainerPayAmount
  }, [fixedTrainerPayAmount, trainerPayAmount])

  const trainerPayDisplayPercent = useMemo(() => {
    if (fixedTrainerPayAmount != null) return null
    return effectiveTrainerPayRate != null ? Math.round(effectiveTrainerPayRate * 100) : null
  }, [fixedTrainerPayAmount, effectiveTrainerPayRate])

  const participantList = useMemo<string[]>(() => {
    const arr = Array.isArray(session?.participant_ids) ? (session?.participant_ids as string[]) : []
    return Array.from(new Set<string>(arr))
  }, [session?.participant_ids])

  const remainingSummary = useMemo(() => {
    if (!isContractSession) return '—'
    if (!participantList.length) return '—'
    const entries = participantList
      .map((id) => ({ id, value: remainingSessionsMap[id] }))
      .filter(({ value }) => typeof value === 'number' && !Number.isNaN(value))

    if (!entries.length) return '—'

    const uniqueValues = Array.from(new Set(entries.map((entry) => entry.value)))
    if (uniqueValues.length === 1) {
      const count = uniqueValues[0] ?? 0
      const perParticipant = entries.length > 1 ? ' per participant' : ''
      return `${count} session${count === 1 ? '' : 's'}${perParticipant}`
    }

    return entries
      .map(({ id, value }) => {
        const name = participantNames[id] || `Participant ${id.slice(0, 8)}`
        return `${name}: ${value}`
      })
      .join(', ')
  }, [participantList, participantNames, remainingSessionsMap])

  const getConsumedParticipants = (status: string, attendanceData: Record<string, string>) => {
    const consumed = new Set<string>()
    if (!participantList.length) return consumed

    if (status === 'late_cancellation' || status === 'no_show' || status === 'completed') {
      participantList.forEach((id) => consumed.add(id))
      return consumed
    }

    const presentIds = participantList.filter((id) => attendanceData[id] === 'present')
    if (presentIds.length > 0) {
      if (participantList.length > 1) {
        participantList.forEach((id) => consumed.add(id))
      } else {
        presentIds.forEach((id) => consumed.add(id))
      }
    }

    return consumed
  }

  const handleSubmit = async () => {
    if (!editMode) {
      toast({ title: 'View only', description: 'Click Edit Session to make changes.', variant: 'destructive' })
      return
    }
    try {
      setLoading(true)

      const payload: Record<string, any> = {
        attendance_data: attendance,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }
      const finalStatus = sessionStatus || 'scheduled'
      payload.status = finalStatus

      const { error } = await supabase
        .from('training_sessions')
        .update(payload)
        .eq('id', session.id)

      if (error) throw error

      const previousConsumed = getConsumedParticipants(initialStatusState, initialAttendanceState)
      const nextConsumed = getConsumedParticipants(finalStatus, attendance)

      if (session?.contract_id && participantList.length) {
        const updatedRemaining = { ...remainingSessionsMap }

        nextConsumed.forEach((participantId) => {
          if (!previousConsumed.has(participantId) && typeof updatedRemaining[participantId] === 'number') {
            updatedRemaining[participantId] = Math.max(updatedRemaining[participantId] - 1, 0)
          }
        })

        previousConsumed.forEach((participantId) => {
          if (!nextConsumed.has(participantId) && typeof updatedRemaining[participantId] === 'number') {
            updatedRemaining[participantId] = updatedRemaining[participantId] + 1
          }
        })

        setRemainingSessionsMap(updatedRemaining)
      }

      toast({
        title: 'Success',
        description: 'Attendance updated successfully',
      })

      setInitialAttendanceState({ ...attendance })
      setInitialStatusState(finalStatus)
      setHasSavedAttendance(true)
      setEditMode(false)

      onUpdate()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update attendance',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getParticipantName = (participantId: string) => {
    return participantNames[participantId]
      || `Participant ${participantId.slice(0, 8)}`
  }

  const handleReschedule = async () => {
    if (!editMode) {
      toast({ title: 'View only', description: 'Click Edit Session to modify the schedule.', variant: 'destructive' })
      return
    }
    if (!session) return
    if (!rescheduleDate || !rescheduleStart || !rescheduleEnd) {
      toast({
        title: 'Missing fields',
        description: 'Select a date, start time, and end time to reschedule.',
        variant: 'destructive',
      })
      return
    }

    if (rescheduleEnd <= rescheduleStart) {
      toast({
        title: 'Invalid time range',
        description: 'End time must be after start time.',
        variant: 'destructive',
      })
      return
    }

    setPendingReschedule({ newDate: rescheduleDate, newStart: rescheduleStart, newEnd: rescheduleEnd })
  }

  const applyReschedule = async (applyToFuture: boolean) => {
    if (!session || !pendingReschedule) return
    const { newDate, newStart, newEnd } = pendingReschedule
    const isoTimestamp = new Date().toISOString()

    try {
      setRescheduleSaving(true)

      if (applyToFuture) {
        if (!session.session_type) throw new Error('Session type missing')

        let futureQuery = supabase
          .from('training_sessions')
          .select('id, session_date')
          .eq('trainer_id', session.trainer_id)
          .eq('session_type', session.session_type)
          .gte('session_date', session.session_date)

        if (session.contract_id) {
          futureQuery = futureQuery.eq('contract_id', session.contract_id)
        }

        const { data: futureSessions, error: futureError } = await futureQuery
        if (futureError) throw futureError

        const sessionWeekday = new Date(session.session_date).getDay()
        const idsToUpdate = new Set<string>()
        idsToUpdate.add(session.id)

        futureSessions?.forEach((row: { id: string; session_date: string }) => {
          const weekday = new Date(row.session_date).getDay()
          if (weekday === sessionWeekday) {
            idsToUpdate.add(row.id)
          }
        })

        if (idsToUpdate.size === 0) {
          toast({ title: 'No sessions updated', description: 'No future sessions on this day were found.' })
        } else {
          const allIds = Array.from(idsToUpdate)
          const otherIds = allIds.filter((id) => id !== session.id)

          if (otherIds.length > 0) {
            const { error: othersError } = await supabase
              .from('training_sessions')
              .update({ start_time: newStart, end_time: newEnd, updated_at: isoTimestamp })
              .in('id', otherIds)

            if (othersError) throw othersError
          }

          const { error: currentError } = await supabase
            .from('training_sessions')
            .update({
              session_date: newDate,
              start_time: newStart,
              end_time: newEnd,
              updated_at: isoTimestamp,
            })
            .eq('id', session.id)

          if (currentError) throw currentError

          toast({ title: 'Schedule updated', description: 'New time applied to this and future sessions on the same weekday.' })
        }
      } else {
        const { error } = await supabase
          .from('training_sessions')
          .update({
            session_date: newDate,
            start_time: newStart,
            end_time: newEnd,
            updated_at: isoTimestamp,
          })
          .eq('id', session.id)

        if (error) throw error

        toast({ title: 'Session rescheduled', description: 'The calendar has been updated for all participants.' })
      }

      onUpdate()
    } catch (error: any) {
      toast({
        title: 'Reschedule failed',
        description: error.message || 'Unable to reschedule session.',
        variant: 'destructive',
      })
    } finally {
      setRescheduleSaving(false)
      setPendingReschedule(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Session Attendance
              </DialogTitle>
              <DialogDescription>
                Mark attendance and update session status
              </DialogDescription>
            </div>
            {hasSavedAttendance && !editMode && (
              <Button size="sm" onClick={() => setEditMode(true)} className="-translate-x-2">
                Edit Session
              </Button>
            )}
          </div>
        </DialogHeader>

        {session && (
          <div className="space-y-4">
            {/* Session Info */}
            <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
              <div><strong>Date:</strong> {new Date(session.session_date).toLocaleDateString()}</div>
              <div>
                <strong>Time:</strong> {formatTimeDisplay(session.start_time)} - {formatTimeDisplay(session.end_time)}
              </div>
              <div><strong>Session Type:</strong> {formatSessionType(session.session_type)}</div>
              {isContractSession && <div><strong>Remaining Sessions:</strong> {remainingSummary}</div>}
              <div><strong>Trainer:</strong> {currentTrainerName ?? 'Unassigned'}</div>
              {isContractSession && (
                <div><strong>Session Rate:</strong> {sessionRate != null ? `$${sessionRate.toFixed(2)}` : '—'}</div>
              )}
              <div>
                <strong>Trainer Pay:</strong>{' '}
                {trainerPayDisplayAmount != null
                  ? (trainerPayDisplayPercent != null
                      ? `$${trainerPayDisplayAmount.toFixed(2)} (${trainerPayDisplayPercent}%)`
                      : `$${trainerPayDisplayAmount.toFixed(2)}`)
                  : '—'}
              </div>
              {isAdmin && (
                <div className="pt-2 space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Reassign Trainer</Label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <select
                      className="w-full sm:w-auto min-w-[180px] h-9 rounded border px-2"
                      value={trainerId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => setTrainerId(event.target.value)}
                      disabled={trainerSaving}
                    >
                      <option value="">Unassigned</option>
                      {trainers.map((trainerOption) => {
                        const label = formatTrainerName(trainerOption) ?? 'Trainer'
                        return (
                          <option key={trainerOption.id} value={trainerOption.id}>
                            {label}
                          </option>
                        )
                      })}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleTrainerUpdate}
                      disabled={trainerSaving || !trainerSelectionChanged}
                    >
                      {trainerSaving ? (
                        <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</span>
                      ) : (
                        'Save Trainer'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Session Status */}
            <div className="space-y-2">
              <Label>Session Status</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sessionStatus === 'completed' ? 'default' : 'outline'}
                  onClick={() => {
                    if (!editMode) return
                    setSessionStatus(sessionStatus === 'completed' ? '' : 'completed')
                  }}
                  disabled={!editMode}
                  className="w-full"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completed
                </Button>
                <Button
                  variant={sessionStatus === 'cancelled' ? 'destructive' : 'outline'}
                  onClick={() => {
                    void handleCancelSession()
                  }}
                  disabled={!editMode}
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelled
                </Button>
                <Button
                  variant={sessionStatus === 'late_cancellation' ? 'default' : 'outline'}
                  onClick={() => {
                    if (!editMode) return
                    if (sessionStatus === 'late_cancellation') {
                      // Toggle off: clear status and clear all 'absent' selections
                      setSessionStatus('')
                      const cleared: Record<string, string> = {}
                      participantList.forEach((id) => { cleared[id] = '' })
                      setAttendance(cleared)
                      return
                    }

                    const confirmLate = window.confirm(
                      'Are you sure? By clicking Yes, all participants will forfeit 1 session. This keeps the session in the trainer\'s calendar but counts as a Late Cancel for all participants.'
                    )
                    if (!confirmLate) return

                    // Apply Late Cancel in UI: mark all as absent and set status
                    const nextAttendance: Record<string, string> = {}
                    participantList.forEach((id) => { nextAttendance[id] = 'absent' })
                    setAttendance(nextAttendance)
                    setSessionStatus('late_cancellation')
                  }}
                  disabled={!editMode}
                  className="w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Late Cancel
                </Button>
                <Button
                  variant={sessionStatus === 'no_show' ? 'destructive' : 'outline'}
                  onClick={() => {
                    if (!editMode) return
                    if (sessionStatus === 'no_show') {
                      setSessionStatus('')
                      // Allow attendance values to be adjusted normally after toggle off
                      return
                    }

                    const nextAttendance: Record<string, string> = {}
                    participantList.forEach((id) => { nextAttendance[id] = 'absent' })
                    setAttendance(nextAttendance)
                    setSessionStatus('no_show')
                  }}
                  disabled={!editMode}
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  No Show
                </Button>
              </div>
            </div>

            {/* Participant Attendance */}
            <div className="space-y-2">
              <Label>Participant Attendance</Label>
              <div className="space-y-3">
                {participantList.map((participantId: string) => (
                  <div key={participantId} className="border rounded-lg p-3">
                    <div className="font-medium mb-2">{getParticipantName(participantId)}</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'present' ? 'default' : 'outline'}
                        onClick={() => {
                          if (!editMode) return
                          const currentlyPresent = attendance[participantId] === 'present'
                          const nextValue = currentlyPresent ? '' : 'present'
                          const nextAttendance = { ...attendance, [participantId]: nextValue }
                          setAttendance(nextAttendance)

                          if (nextValue === 'present') {
                            if (sessionStatus !== 'completed') setSessionStatus('completed')
                          } else {
                            const anyPresent = Object.values(nextAttendance).some(v => v === 'present')
                            if (!anyPresent && sessionStatus === 'completed') setSessionStatus('')
                          }
                        }}
                        disabled={!editMode}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'absent' ? 'destructive' : 'outline'}
                        onClick={() => {
                          if (!editMode) return
                          const currentlyAbsent = attendance[participantId] === 'absent'
                          if (currentlyAbsent && sessionStatus === 'no_show') {
                            // When No Show is active, participants must remain absent
                            return
                          }

                          const nextValue = currentlyAbsent ? '' : 'absent'
                          const nextAttendance = { ...attendance, [participantId]: nextValue }
                          setAttendance(nextAttendance)

                          const anyPresent = Object.values(nextAttendance).some(v => v === 'present')
                          if (!anyPresent && sessionStatus === 'completed') setSessionStatus('')
                        }}
                        disabled={!editMode}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Absent
                      </Button>
                      <Button
                        size="sm"
                        variant={attendance[participantId] === 'late' ? 'default' : 'outline'}
                        onClick={() => {
                          if (!editMode) return
                          const currentlyLate = attendance[participantId] === 'late'
                          const nextValue = currentlyLate ? '' : 'late'
                          const nextAttendance = { ...attendance, [participantId]: nextValue }
                          setAttendance(nextAttendance)
                          const anyPresent = Object.values(nextAttendance).some(v => v === 'present')
                          if (!anyPresent && sessionStatus === 'completed') setSessionStatus('')
                        }}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Late
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reschedule Session */}
            <div className="space-y-2 border rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarIcon className="h-4 w-4" />
                Reschedule Session
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="rescheduleDate">Date</Label>
                  <Input
                    id="rescheduleDate"
                    type="date"
                    value={rescheduleDate}
                    onChange={(event) => setRescheduleDate(event.target.value)}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rescheduleStart">Start Time</Label>
                  <Input
                    id="rescheduleStart"
                    type="time"
                    value={rescheduleStart}
                    onChange={(event) => setRescheduleStart(event.target.value)}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rescheduleEnd">End Time</Label>
                  <Input
                    id="rescheduleEnd"
                    type="time"
                    value={rescheduleEnd}
                    onChange={(event) => setRescheduleEnd(event.target.value)}
                    disabled={!editMode}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleReschedule} disabled={!editMode || rescheduleSaving}>
                  {rescheduleSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionNotes">Session Notes</Label>
              <Textarea
                id="sessionNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this session..."
                disabled={!editMode}
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <Button onClick={onClose} variant="outline" disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !editMode}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Attendance
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <Dialog open={!!pendingReschedule} onOpenChange={(open) => {
        if (!open) setPendingReschedule(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule session</DialogTitle>
            <DialogDescription>Choose how you want to apply the new date and time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {pendingReschedule && (
              <>
                <div>
                  <strong>New Date:</strong>{' '}
                  {pendingReschedule.newDate ? format(new Date(pendingReschedule.newDate), 'PPP') : pendingReschedule.newDate}
                </div>
                <div>
                  <strong>New Time:</strong>{' '}
                  {pendingReschedule.newDate
                    ? `${format(new Date(`${pendingReschedule.newDate}T${pendingReschedule.newStart}`), 'h:mm a')} - ${format(
                        new Date(`${pendingReschedule.newDate}T${pendingReschedule.newEnd}`),
                        'h:mm a',
                      )}`
                    : `${pendingReschedule.newStart} - ${pendingReschedule.newEnd}`}
                </div>
              </>
            )}
          </div>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingReschedule(null)} disabled={rescheduleSaving}>
              Cancel
            </Button>
            <Button onClick={() => applyReschedule(false)} disabled={rescheduleSaving}>
              {rescheduleSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              This session only
            </Button>
            <Button onClick={() => applyReschedule(true)} disabled={rescheduleSaving}>
              {rescheduleSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              This and future sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
