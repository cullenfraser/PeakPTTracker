import { useState, useEffect, useMemo } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addHours } from 'date-fns'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Calendar as CalendarIcon, Plus, Filter } from 'lucide-react'
import AddSessionModal from '@/components/AddSessionModal'
import AttendanceModal from '@/components/AttendanceModal'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { enUS } from 'date-fns/locale'

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

interface TrainingSession {
  id: string
  contract_id: string
  trainer_id: string
  session_date: string
  start_time: string
  end_time: string
  session_number: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'late_cancellation' | 'no_show'
  participants_attended: any[]
  attendance_notes: string | null
  trainer?: {
    first_name: string
    last_name: string
    calendar_color: string
  }
  contract?: {
    customer_name: string
    participants: number
  }
}

interface Trainer {
  id: string
  first_name: string
  last_name: string
  calendar_color: string
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
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null)

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

    setTrainers(data || [])
  }

  const fetchSessions = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('training_sessions')
        .select(`
          *,
          trainer:trainers(first_name, last_name, calendar_color),
          contract:contracts(customer_name, participants)
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

      setSessions(data || [])
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

  const events = useMemo(() => {
    return sessions.map(session => {
      const sessionDate = new Date(session.session_date)
      const [startHour, startMinute] = session.start_time.split(':').map(Number)
      const [endHour, endMinute] = session.end_time.split(':').map(Number)

      const start = new Date(sessionDate)
      start.setHours(startHour, startMinute, 0)

      const end = new Date(sessionDate)
      end.setHours(endHour, endMinute, 0)

      return {
        id: session.id,
        title: `${session.contract?.customer_name || 'Client'} - Session ${session.session_number}`,
        start,
        end,
        resource: session,
      }
    })
  }, [sessions])

  const eventStyleGetter = (event: any) => {
    const session = event.resource as TrainingSession
    const color = session.trainer?.calendar_color || '#3FAE52'
    
    let backgroundColor = color
    let opacity = 1

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

    return {
      style: {
        backgroundColor,
        opacity,
        borderRadius: '4px',
        border: 'none',
        color: 'white',
        fontSize: '12px',
        padding: '2px 5px',
      },
    }
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
                <Filter className="h-4 w-4" />
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
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: trainer.calendar_color }}
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
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              selectable={isAdmin || !!currentTrainerId}
              eventPropGetter={eventStyleGetter}
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
        />
      </div>
    </Layout>
  )
}
