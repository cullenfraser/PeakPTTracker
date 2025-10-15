import { useState, useEffect, useMemo } from 'react'
import { Calendar as BaseCalendar, dateFnsLocalizer, View } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { format, parse, startOfWeek, getDay, isSameDay } from 'date-fns'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Calendar as CalendarIcon, Loader2, Plus } from 'lucide-react'
import AddSessionModal from '@/components/AddSessionModal'
import AttendanceModal from '@/components/AttendanceModal'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { enUS } from 'date-fns/locale'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  resource: TrainingSession
  requiresAction: boolean
}

const DragAndDropCalendar = withDragAndDrop(BaseCalendar)

interface TrainingSession {
  id: string
  contract_id: string | null
  trainer_id: string
  session_date: string
  start_time: string
  end_time: string
  session_number: number | null
  session_type: string | null
  class_type: string | null
  team: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'late_cancellation' | 'no_show'
  participants_attended?: any[] | null
  attendance_notes?: string | null
  attendance_data?: Record<string, string> | null
  trainer?: {
    first_name: string
    last_name: string
  }
  contract?: {
    customer_name: string
    participants: number
  }
}

const CONTRACT_SESSION_TYPES = new Set(['1_on_1', 'small_group'])

const SESSION_TYPE_LABELS: Record<string, string> = {
  '1_on_1': '1 on 1',
  small_group: 'Small Group',
  peak_class: 'Peak Class',
  pfa_class: 'PFA Class',
  pfa_team: 'PFA Team',
  meeting: 'Meeting',
  tasks: 'Tasks',
  onboarding: 'Onboarding',
  general: 'General',
}

const formatSessionTypeLabel = (value?: string | null) => {
  if (!value) return 'Session'
  const normalized = value.toLowerCase()
  if (SESSION_TYPE_LABELS[normalized]) return SESSION_TYPE_LABELS[normalized]
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatClassTypeLabel = (value?: string | null) => {
  if (!value) return ''
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  '1_on_1': '#3FAE52', // bright green
  'small_group': '#2E8B57', // darker green
  'peak_class': '#1E88E5', // blue
  'pfa_class': '#E53935', // red
  'meeting': '#8E24AA', // purple
  'onboarding': '#FB8C00', // orange
  'tasks': '#9E9E9E', // gray
  'pfa_team': '#6A1B9A', // deep purple
  'general': '#757575', // alternate gray
}

interface Trainer {
  id: string
  first_name: string
  last_name: string
}

export default function CalendarPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null)
  const [, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    session: TrainingSession
    newStart: Date
    newEnd: Date
  } | null>(null)
  const [moveLoading, setMoveLoading] = useState(false)

  const minTime = useMemo(() => {
    const date = new Date()
    date.setHours(5, 0, 0, 0)
    return date
  }, [])

  const maxTime = useMemo(() => {
    const date = new Date()
    date.setHours(21, 0, 0, 0)
    return date
  }, [])

  useEffect(() => {
    checkAdminStatus()
    fetchTrainers()
    fetchSessions()
  }, [user])

  useEffect(() => {
    fetchSessions()
  }, [selectedTrainers])

  const checkAdminStatus = async () => {
    if (!user) return
    
    try {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
      
      if (adminData && adminData.length > 0) {
        console.log('User is admin in calendar')
        setIsAdmin(true)
      } else {
        console.log('User is not admin, checking for trainer')
        setIsAdmin(false)
        
        // Get current trainer ID if not admin
        const { data: trainerData } = await supabase
          .from('trainers')
          .select('id')
          .eq('user_id', user.id)
        
        if (trainerData && trainerData.length > 0) {
          setCurrentTrainerId(trainerData[0].id)
        }
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
    }
  }

  const fetchTrainers = async () => {
    const { data, error } = await supabase
      .from('trainers')
      .select('*')
      .order('first_name')

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to load trainers',
        variant: 'destructive',
      })
      return
    }

    setTrainers((data as Trainer[]) || [])
  }

  const fetchSessions = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('training_sessions')
        .select(`
          *,
          trainer:trainers(first_name, last_name),
          contract:contracts(customer_name, participants, price_per_session, discount_percent)
        `)
        .order('session_date')

      // Filter by trainer
      if (!isAdmin && currentTrainerId) {
        // Trainers only see their own sessions
        query = query.eq('trainer_id', currentTrainerId)
      } else if (isAdmin && selectedTrainers.length > 0) {
        // Admins can filter by multiple trainers
        query = query.in('trainer_id', selectedTrainers)
      }
      // If admin with no trainers selected, show all sessions

      const { data, error } = await query

      if (error) throw error

      const normalizedSessions: TrainingSession[] = (data ?? []).map((raw: any) => ({
        ...raw,
        session_type: raw.session_type ?? null,
        class_type: raw.class_type ?? null,
        team: raw.team ?? null,
        participants_attended: raw.participants_attended ?? null,
        attendance_notes: raw.attendance_notes ?? null,
        attendance_data: raw.attendance_data ?? null,
        trainer: raw.trainer ?? undefined,
        contract: raw.contract ?? undefined,
      }))

      setSessions(normalizedSessions)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load sessions',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const events = useMemo<CalendarEvent[]>(() => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    return sessions.map(session => {
      // Parse as local date to prevent UTC -> local day shift ("YYYY-MM-DD" is parsed as UTC by Date)
      const sessionDate = parse(session.session_date, 'yyyy-MM-dd', new Date())
      const [startHour, startMinute] = session.start_time.split(':').map(Number)
      const [endHour, endMinute] = session.end_time.split(':').map(Number)

      const start = new Date(sessionDate)
      start.setHours(startHour, startMinute, 0)

      const end = new Date(sessionDate)
      end.setHours(endHour, endMinute, 0)

      const hasAttendanceSelections = Boolean(
        session.attendance_data && Object.values(session.attendance_data).some(value => value && value.length > 0),
      )
      const sessionDay = parse(session.session_date, 'yyyy-MM-dd', new Date())
      const requiresAction =
        sessionDay < startOfToday &&
        session.status === 'scheduled' &&
        !hasAttendanceSelections

      const sessionTypeKey = (session.session_type ?? '').toLowerCase()
      const isContractSession = CONTRACT_SESSION_TYPES.has(sessionTypeKey)
      let title: string

      if (isContractSession && session.contract?.customer_name) {
        const sessionNumberLabel = session.session_number ? ` - Session ${session.session_number}` : ''
        title = `${session.contract.customer_name}${sessionNumberLabel}`
      } else {
        const typeLabel = formatSessionTypeLabel(session.session_type)
        let detail = ''
        if (sessionTypeKey === 'peak_class') {
          detail = formatClassTypeLabel(session.class_type)
        } else if (sessionTypeKey === 'pfa_team') {
          detail = session.team?.trim() ?? ''
        }
        title = detail ? `${typeLabel} - ${detail}` : typeLabel
      }

      return {
        id: session.id,
        title,
        start,
        end,
        resource: session,
        requiresAction,
      }
    })
  }, [sessions])

  const draggableAccessor = (event: any) => {
    if (view === 'month') return false
    const session: TrainingSession | undefined = event?.resource ?? event
    const typeKey = (session?.session_type ?? '').toLowerCase()
    return CONTRACT_SESSION_TYPES.has(typeKey)
  }

  const handleEventDrop = (args: any) => {
    void (async () => {
      const { event, start, end } = args as { event: CalendarEvent; start: Date | string; end: Date | string }
      const session = (event?.resource ?? null) as TrainingSession | null
      if (!session || !start || !end) {
        await fetchSessions()
        return
      }

      if (!session.session_type) {
        await fetchSessions()
        return
      }

      const typeKey = session.session_type.toLowerCase()
      if (!CONTRACT_SESSION_TYPES.has(typeKey)) {
        toast({
          title: 'Not supported',
          description: 'Only 1 on 1 and Small Group sessions can be rescheduled by dragging.',
          variant: 'destructive',
        })
        await fetchSessions()
        return
      }

      const startDate = start instanceof Date ? start : new Date(start)
      const endDate = end instanceof Date ? end : new Date(end)
      const originalDate = parse(session.session_date, 'yyyy-MM-dd', new Date())

      if (!isSameDay(startDate, originalDate)) {
        toast({
          title: 'Same-day moves only',
          description: 'To move a session to a different day, open the session modal and reschedule from there.',
          variant: 'destructive',
        })
        await fetchSessions()
        return
      }

      setPendingMove({ session, newStart: startDate, newEnd: endDate })
    })()
  }

  const formatTimeForDb = (date: Date) => format(date, 'HH:mm')

  const handleMoveCancel = () => {
    setPendingMove(null)
    fetchSessions()
  }

  const applyMove = async (applyToFuture: boolean) => {
    if (!pendingMove) return
    const { session, newStart, newEnd } = pendingMove
    const newStartTime = formatTimeForDb(newStart)
    const newEndTime = formatTimeForDb(newEnd)

    try {
      setMoveLoading(true)

      if (applyToFuture) {
        if (!session.session_type) {
          throw new Error('Session type missing')
        }

        let futureQuery = supabase
          .from('training_sessions')
          .select('id, session_date')
          .eq('trainer_id', session.trainer_id)
          .eq('session_type', session.session_type ?? '')
          .gte('session_date', session.session_date)

        if (session.contract_id) {
          futureQuery = futureQuery.eq('contract_id', session.contract_id)
        }

        const { data: futureSessions, error: futureError } = await futureQuery
        if (futureError) throw futureError

        const sessionWeekday = getDay(parse(session.session_date, 'yyyy-MM-dd', new Date()))
        const idsToUpdate = new Set<string>()
        idsToUpdate.add(session.id)

        futureSessions?.forEach((row: { id: string; session_date: string }) => {
          const weekday = getDay(parse(row.session_date, 'yyyy-MM-dd', new Date()))
          if (weekday === sessionWeekday) {
            idsToUpdate.add(row.id)
          }
        })

        if (idsToUpdate.size === 0) {
          toast({
            title: 'No sessions updated',
            description: 'No future sessions on this day were found.',
          })
        } else {
          const { error: updateError } = await supabase
            .from('training_sessions')
            .update({ start_time: newStartTime, end_time: newEndTime })
            .in('id', Array.from(idsToUpdate))

          if (updateError) throw updateError

          toast({
            title: 'Schedule updated',
            description: 'New time applied to this and future sessions on the same weekday.',
          })
        }

      } else {
        const { error } = await supabase
          .from('training_sessions')
          .update({ start_time: newStartTime, end_time: newEndTime })
          .eq('id', session.id)

        if (error) throw error

        toast({
          title: 'Session updated',
          description: 'New time saved for this session.',
        })
      }
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message ?? 'Unable to reschedule session right now.',
        variant: 'destructive',
      })
    } finally {
      setMoveLoading(false)
      setPendingMove(null)
      fetchSessions()
    }
  }

  const eventStyleGetter = (event: any) => {
    const session = event.resource as TrainingSession
    const sessionTypeKey = (session.session_type ?? '').toLowerCase()
    const defaultColor = '#3FAE52'
    let baseColor = SESSION_TYPE_COLORS[sessionTypeKey]
    if (!baseColor) {
      baseColor = defaultColor
    }

    let backgroundColor = baseColor
    let opacity = 1
    let border = 'none'

    // Adjust styling based on status
    switch (session.status) {
      case 'completed':
        opacity = 0.7
        break
      case 'cancelled':
      case 'late_cancellation':
      case 'no_show':
        backgroundColor = '#999'
        opacity = 0.5
        break
    }

    if (event.requiresAction) {
      border = '2px solid #f59e0b'
    }

    return {
      style: {
        backgroundColor,
        opacity,
        borderRadius: '6px',
        border,
        color: 'white',
        fontSize: '12px',
        padding: '4px 6px',
        marginRight: '6px',
        marginLeft: '2px',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.4)',
      },
    }
  }

  const CalendarEvent = ({ event }: { event: any }) => {
    const requiresAction = Boolean(event.requiresAction)
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{event.title}</span>
        {requiresAction && (
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-400 text-black text-xs font-semibold">
            !
          </span>
        )}
      </div>
    )
  }

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    if (!isAdmin && !currentTrainerId) return
    setSelectedSlot(slotInfo)
    setShowAddModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setSelectedSession(event.resource)
    setShowAttendanceModal(true)
  }

  return (
    <Layout>
      <div className="max-w-full mx-auto space-y-6 p-4 pb-32 md:pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CalendarIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Training Calendar</h1>
          </div>
          <div className="flex gap-3 items-center">
            {isAdmin && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const dropdown = document.getElementById('trainer-dropdown')
                      dropdown?.classList.toggle('hidden')
                    }}
                  >
                    Filter Trainers ({selectedTrainers.length || 'All'})
                  </Button>
                  <div
                    id="trainer-dropdown"
                    className="hidden absolute top-full mt-2 bg-card border rounded-lg shadow-lg p-3 z-50 min-w-[200px]"
                  >
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {trainers.map(trainer => (
                        <label key={trainer.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                          <input
                            type="checkbox"
                            checked={selectedTrainers.includes(trainer.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTrainers([...selectedTrainers, trainer.id])
                              } else {
                                setSelectedTrainers(selectedTrainers.filter(id => id !== trainer.id))
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{trainer.first_name} {trainer.last_name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedTrainers.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2"
                        onClick={() => setSelectedTrainers([])}
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {(isAdmin || currentTrainerId) && (
              <Button
                onClick={() => {
                  if (!isAdmin && currentTrainerId) {
                    setSelectedTrainers([currentTrainerId])
                  }
                  setShowAddModal(true)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Session
              </Button>
            )}
          </div>
        </div>

        <Card className="p-4">
          <div style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}>
            <DragAndDropCalendar
              localizer={localizer}
              events={events}
              startAccessor={(e: any) => e.start}
              endAccessor={(e: any) => e.end}
              min={minTime}
              max={maxTime}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              selectable={isAdmin || !!currentTrainerId}
              eventPropGetter={eventStyleGetter}
              draggableAccessor={draggableAccessor}
              onEventDrop={handleEventDrop}
              components={{
                event: CalendarEvent,
              }}
              views={['month', 'week', 'day']}
              step={30}
              showMultiDayTimes
              defaultView="week"
              style={{ height: '100%' }}
            />
          </div>
        </Card>

        {/* Legend */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Status Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3FAE52' }}></div>
              <span className="text-sm">Scheduled</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3FAE52', opacity: 0.7 }}></div>
              <span className="text-sm">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-400"></div>
              <span className="text-sm">Cancelled / No Show</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-400 text-black text-xs font-semibold">!</span>
              <span className="text-sm">Action Needed</span>
            </div>
          </div>
        </Card>

        {/* Add Session Modal */}
        <AddSessionModal
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false)
            setSelectedSlot(null)
          }}
          onSessionAdded={() => {
            fetchSessions()
            setShowAddModal(false)
            setSelectedSlot(null)
          }}
          selectedDate={selectedSlot?.start}
          selectedTrainerId={!isAdmin ? currentTrainerId || undefined : undefined}
          isAdmin={isAdmin}
          trainers={trainers}
        />

        {/* Attendance Modal */}
        <AttendanceModal
          open={showAttendanceModal}
          onClose={() => {
            setShowAttendanceModal(false)
            setSelectedSession(null)
          }}
          session={selectedSession}
          onUpdate={() => {
            fetchSessions()
            setShowAttendanceModal(false)
            setSelectedSession(null)
          }}
          onTrainerUpdated={() => {
            fetchSessions()
          }}
          trainers={trainers}
          isAdmin={isAdmin}
        />
      </div>

      <Dialog open={!!pendingMove} onOpenChange={(open) => {
        if (!open) handleMoveCancel()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule session</DialogTitle>
            <DialogDescription>
              Choose how you want to apply the new time for this session.
            </DialogDescription>
          </DialogHeader>
          <p>
            {pendingMove && `Move to ${format(pendingMove.newStart, 'h:mm a')} - ${format(pendingMove.newEnd, 'h:mm a')}?`}
          </p>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={handleMoveCancel} disabled={moveLoading}>
              Cancel
            </Button>
            <Button onClick={() => applyMove(false)} disabled={moveLoading}>
              {moveLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              This session only
            </Button>
            <Button onClick={() => applyMove(true)} disabled={moveLoading}>
              {moveLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              This and future sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
