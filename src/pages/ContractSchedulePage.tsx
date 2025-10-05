import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { format, addDays, addHours, parseISO, addWeeks } from 'date-fns'
import type { Database } from '@/types/database'

const FALLBACK_MESSAGE = 'Contract scheduling requires invoice completion. Please return to the invoice page and finish the previous step.'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ParticipantContractRow = Database['public']['Tables']['participant_contracts']['Row']
type TrainerRow = Database['public']['Tables']['trainers']['Row']

type ScheduleSlot = {
  day: string
  startTime: string
}

type LocationState = {
  contract?: ContractRow
  participants?: ParticipantContractRow[]
  invoicePrepared?: boolean
}

const WEEK_DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

const WEEKLY_FREQUENCY_MAP: Record<string, number> = {
  once_week: 1,
  twice_week: 2,
  three_week: 3,
  four_week: 4,
  five_week: 5,
  bi_weekly: 2,
}

export default function ContractSchedulePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { contractId } = useParams<{ contractId: string }>()
  const location = useLocation()

  const { contract, participants, invoicePrepared } = (location.state as LocationState | undefined) || {}

  const [trainers, setTrainers] = useState<TrainerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [recurring, setRecurring] = useState(true)
  const [specialNotes, setSpecialNotes] = useState('')

  const sessionsPerWeek = useMemo(() => {
    if (!contract) return 1
    return WEEKLY_FREQUENCY_MAP[contract.frequency ?? ''] ?? 1
  }, [contract])

  useEffect(() => {
    if (!contractId) return

    if (!contract || !invoicePrepared) {
      toast({
        title: 'Scheduling unavailable',
        description: FALLBACK_MESSAGE,
        variant: 'destructive',
      })
      navigate(`/contract/${contractId}/invoice`, { replace: true })
      return
    }

    const fetchTrainers = async () => {
      try {
        const { data, error } = await supabase
          .from('trainers')
          .select('*')
          .not('display_name', 'is', null)
          .order('display_name', { ascending: true })

        if (error) throw error

        const activeTrainers = (data ?? []).filter(trainer => trainer.display_name?.trim())

        setTrainers(activeTrainers)
        if (activeTrainers.length && !selectedTrainerId) {
          setSelectedTrainerId(activeTrainers[0].id)
        }
      } catch (error: any) {
        toast({
          title: 'Failed to load trainers',
          description: error.message || 'Please retry later.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchTrainers()
  }, [contractId, contract, invoicePrepared, navigate, selectedTrainerId, toast])

  useEffect(() => {
    if (!contract) return

    setSlots(prev => {
      const next = [...prev]

      if (next.length < sessionsPerWeek) {
        const deficit = sessionsPerWeek - next.length
        for (let i = 0; i < deficit; i += 1) {
          const day = WEEK_DAYS[(next.length + i) % WEEK_DAYS.length].key
          next.push({ day, startTime: '08:00' })
        }
      } else if (next.length > sessionsPerWeek) {
        next.length = sessionsPerWeek
      }

      return next
    })
  }, [contract, sessionsPerWeek])

  const participantCount = participants?.length || contract?.participant_contract_count || contract?.participants || 1

  const handleDayChange = (index: number, event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    setSlots(prev => prev.map((slot, i) => (i === index ? { ...slot, day: value } : slot)))
  }

  const handleTimeChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setSlots(prev => prev.map((slot, i) => (i === index ? { ...slot, startTime: value } : slot)))
  }

  const handleTrainerChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTrainerId(event.target.value)
  }

  const handleRecurringChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRecurring(event.target.checked)
  }

  const getNextDayOfWeek = (startDate: Date, targetDay: string): Date => {
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    }
    
    const targetDayNum = dayMap[targetDay.toLowerCase()]
    const currentDay = startDate.getDay()
    let daysToAdd = targetDayNum - currentDay
    
    if (daysToAdd < 0) {
      daysToAdd += 7
    }
    
    return addDays(startDate, daysToAdd)
  }

  const handleSaveSchedule = async () => {
    if (!contractId || !contract || !participants?.length) return

    if (!selectedTrainerId) {
      toast({
        title: 'Select a trainer',
        description: 'Please assign a trainer before saving the schedule.',
        variant: 'destructive',
      })
      return
    }

    const incompleteSlot = slots.find(slot => !slot.day || !slot.startTime)
    if (incompleteSlot) {
      toast({
        title: 'Missing schedule details',
        description: 'Ensure each scheduled session has a day and start time.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)

    try {
      // 1. Save schedule entries
      await supabase.from('contract_schedule_entries').delete().eq('contract_id', contractId)

      const schedulePayload = slots.map(slot => ({
        contract_id: contractId,
        schedule_day: slot.day,
        start_time: slot.startTime,
        trainer_id: selectedTrainerId,
        created_by: user?.id,
      }))

      const { error: scheduleError } = await supabase.from('contract_schedule_entries').insert(schedulePayload)
      if (scheduleError) throw scheduleError

      // 2. Create or refresh training sessions for calendar
      await supabase.from('training_sessions').delete().eq('contract_id', contractId)

      const startDate = parseISO(contract.start_date)
      const endDate = contract.end_date ? parseISO(contract.end_date) : null
      const participantIds = participants.map(participant => participant.id)
      const fallbackWeeks = contract.package_length ?? (slots.length ? Math.max(1, Math.ceil((contract.total_sessions ?? slots.length) / slots.length)) : 1)

      const trainingSessionsPayload: Database['public']['Tables']['training_sessions']['Insert'][] = []

      slots.forEach((slot, slotIndex) => {
        const [hours, minutes] = slot.startTime.split(':').map(Number)
        let occurrence = 0
        let currentDate = getNextDayOfWeek(startDate, slot.day)

        while (true) {
          if (!recurring && occurrence > 0) break
          if (endDate && currentDate > endDate) break
          if (!endDate && recurring && occurrence >= fallbackWeeks) break

          const sessionStart = new Date(currentDate)
          sessionStart.setHours(hours ?? 0, minutes ?? 0, 0, 0)
          const sessionEnd = addHours(sessionStart, 1)

          trainingSessionsPayload.push({
            contract_id: contractId,
            trainer_id: selectedTrainerId,
            session_date: format(currentDate, 'yyyy-MM-dd'),
            start_time: slot.startTime,
            end_time: format(sessionEnd, 'HH:mm'),
            session_number: occurrence * slots.length + slotIndex + 1,
            session_type: 'contract',
            status: 'scheduled',
            notes: specialNotes || null,
            participant_ids: participantIds,
            created_by: user?.id,
          })

          occurrence += 1
          if (!recurring) break
          currentDate = addWeeks(currentDate, 1)
        }
      })

      if (trainingSessionsPayload.length) {
        const { error: sessionsError } = await supabase.from('training_sessions').insert(trainingSessionsPayload)
        if (sessionsError) throw sessionsError
      }

      toast({
        title: 'Schedule saved',
        description: 'Recurring sessions have been added to your calendar.',
      })

      navigate('/calendar')
    } catch (error: any) {
      toast({
        title: 'Failed to save schedule',
        description: error.message || 'Please try again shortly.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
          Loading scheduling data...
        </div>
      </Layout>
    )
  }

  if (!contract || !participants) {
    return null
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Schedule Sessions</h1>
            <p className="text-muted-foreground">
              Select weekly sessions, assign a trainer, and save the recurring schedule for this contract.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/contract/${contractId}/invoice`)}>
            Back to Invoice
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Session Plan</CardTitle>
              <CardDescription>
                Configure {sessionsPerWeek} session{sessionsPerWeek > 1 ? 's' : ''} per week for all participants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {slots.map((slot, index) => (
                  <div key={index} className="grid gap-4 md:grid-cols-[1fr_160px] md:items-center border rounded-lg p-4">
                    <div className="space-y-2">
                      <Label htmlFor={`day-${index}`}>Session {index + 1} Day</Label>
                      <Select
                        id={`day-${index}`}
                        value={slot.day}
                        onChange={event => handleDayChange(index, event)}
                      >
                        {WEEK_DAYS.map(day => (
                          <option key={day.key} value={day.key}>
                            {day.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`time-${index}`}>Start Time</Label>
                      <Input
                        id={`time-${index}`}
                        type="time"
                        value={slot.startTime}
                        onChange={event => handleTimeChange(index, event)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border rounded-lg p-4">
                <div>
                  <p className="font-medium">Recurring schedule</p>
                  <p className="text-sm text-muted-foreground">
                    Apply these days and times to every week of the contract duration.
                  </p>
                </div>
                <input
                  id="recurring"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={recurring}
                  onChange={handleRecurringChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialNotes">Schedule notes</Label>
                <Textarea
                  id="specialNotes"
                  placeholder="Optional notes for the trainer or special considerations"
                  value={specialNotes}
                  onChange={event => setSpecialNotes(event.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment Overview</CardTitle>
              <CardDescription>Confirm participants and assign the trainer who will deliver the sessions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase">Participants</p>
                <p className="font-medium">{participantCount}</p>
                <div className="space-y-1">
                  {participants.map(participant => (
                    <div key={participant.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{participant.participant_name}</span>
                      {participant.participant_email && <span> • {participant.participant_email}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trainer-select">Assigned trainer</Label>
                <Select id="trainer-select" value={selectedTrainerId} onChange={handleTrainerChange}>
                  <option value="" disabled>
                    Select trainer
                  </option>
                  {trainers.map(trainer => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.display_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="rounded-lg border p-4 bg-muted/30 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-semibold text-foreground">Contract:</span> {contract.contract_number || contract.id}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Duration:</span>{' '}
                  {format(new Date(contract.start_date), 'PP')} –{' '}
                  {contract.end_date ? format(new Date(contract.end_date), 'PP') : 'Open End'}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Sessions per week:</span> {sessionsPerWeek}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                <Button variant="outline" onClick={() => navigate(`/contract/${contractId}`)}>
                  Return to Contract
                </Button>
                <Button variant="secondary" onClick={() => navigate(`/contract/${contractId}/invoice`)}>
                  Back to Invoice
                </Button>
                <Button onClick={handleSaveSchedule} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Schedule'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
