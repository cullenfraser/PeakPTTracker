import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { 
  Calendar, 
  Users, 
  Clock, 
  Activity, 
  CheckCircle, 
  XCircle,
  AlertCircle 
} from 'lucide-react'

export default function TrainerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [trainerInfo, setTrainerInfo] = useState<any>(null)
  const [stats, setStats] = useState({
    todaySessions: 0,
    weekSessions: 0,
    monthSessions: 0,
    activeClients: 0,
    completedSessions: 0,
    cancelledSessions: 0,
    upcomingSessions: 0,
    hoursThisWeek: 0,
    hoursThisMonth: 0,
  })
  const [recentSessions, setRecentSessions] = useState<any[]>([])
  const [, setLoading] = useState(true)

  useEffect(() => {
    fetchTrainerInfo()
    fetchDashboardStats()
    fetchRecentSessions()
  }, [user])

  const fetchTrainerInfo = async () => {
    if (!user) return

    const { data } = await supabase
      .from('trainers')
      .select('*')
      .eq('user_id', user.id)
      .single()

    setTrainerInfo(data)
  }

  const fetchDashboardStats = async () => {
    if (!user) return

    try {
      setLoading(true)

      // Get trainer ID first
      const { data: trainer } = await supabase
        .from('trainers')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!trainer) return

      const trainerId = trainer.id
      const today = new Date().toISOString().split('T')[0]
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const monthStart = new Date()
      monthStart.setDate(1)

      // Today's sessions
      const { data: todaySessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .gte('session_date', today)
        .lt('session_date', new Date(Date.now() + 86400000).toISOString().split('T')[0])

      // This week's sessions
      const { data: weekSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .gte('session_date', weekStart.toISOString().split('T')[0])

      // This month's sessions
      const { data: monthSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Completed sessions
      const { data: completedSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .eq('status', 'completed')
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Cancelled sessions
      const { data: cancelledSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .in('status', ['cancelled', 'late_cancellation', 'no_show'])
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Upcoming sessions
      const { data: upcomingSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainerId)
        .eq('status', 'scheduled')
        .gte('session_date', today)

      // Active clients (from contracts)
      const { data: activeClients } = await supabase
        .from('contracts')
        .select('*', { count: 'exact' })
        .eq('status', 'active')

      // Hours this week
      const { data: weekHours } = await supabase
        .from('hours')
        .select('hours_worked')
        .eq('trainer_id', trainerId)
        .gte('date', weekStart.toISOString().split('T')[0])

      // Hours this month
      const { data: monthHours } = await supabase
        .from('hours')
        .select('hours_worked')
        .eq('trainer_id', trainerId)
        .gte('date', monthStart.toISOString().split('T')[0])

      setStats({
        todaySessions: todaySessions?.length || 0,
        weekSessions: weekSessions?.length || 0,
        monthSessions: monthSessions?.length || 0,
        activeClients: activeClients?.length || 0,
        completedSessions: completedSessions?.length || 0,
        cancelledSessions: cancelledSessions?.length || 0,
        upcomingSessions: upcomingSessions?.length || 0,
        hoursThisWeek: weekHours?.reduce((sum, h) => sum + (h.hours_worked || 0), 0) || 0,
        hoursThisMonth: monthHours?.reduce((sum, h) => sum + (h.hours_worked || 0), 0) || 0,
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentSessions = async () => {
    if (!user) return

    const { data: trainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!trainer) return

    const { data: sessions } = await supabase
      .from('training_sessions')
      .select(`
        *,
        contract:contracts(customer_name)
      `)
      .eq('trainer_id', trainer.id)
      .order('session_date', { ascending: false })
      .limit(5)

    setRecentSessions(sessions || [])
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'cancelled':
      case 'late_cancellation':
      case 'no_show':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50'
      case 'cancelled':
      case 'late_cancellation':
      case 'no_show':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-blue-600 bg-blue-50'
    }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Trainer Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {trainerInfo?.first_name} {trainerInfo?.last_name}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sessions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todaySessions}</div>
              <p className="text-xs text-muted-foreground">Scheduled for today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.weekSessions}</div>
              <p className="text-xs text-muted-foreground">Sessions this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeClients}</div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours This Week</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.hoursThisWeek.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Hours logged</p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedSessions}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
              <AlertCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.upcomingSessions}</div>
              <p className="text-xs text-muted-foreground">Scheduled ahead</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.cancelledSessions}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button onClick={() => navigate('/calendar')} className="h-20">
              <Calendar className="h-5 w-5 mr-2" />
              View Calendar
            </Button>
            <Button onClick={() => navigate('/hours')} className="h-20" variant="outline">
              <Clock className="h-5 w-5 mr-2" />
              Log Hours
            </Button>
            <Button onClick={() => navigate('/trainers')} className="h-20" variant="outline">
              <Users className="h-5 w-5 mr-2" />
              My Clients
            </Button>
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>Your latest training sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent sessions</p>
            ) : (
              <div className="space-y-3">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(session.status)}
                      <div>
                        <p className="font-medium">{session.contract?.customer_name || 'Unknown Client'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(session.session_date).toLocaleDateString()} at {session.start_time}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(session.status)}`}>
                      {session.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
