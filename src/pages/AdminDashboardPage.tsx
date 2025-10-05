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
  DollarSign, 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Download,
  BarChart3
} from 'lucide-react'

interface TrainerStats {
  id: string
  name: string
  totalSessions: number
  completedSessions: number
  cancelledSessions: number
  activeClients: number
  completionRate: number
  revenue: number
}

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    totalTrainers: 0,
    activeTrainers: 0,
    totalClients: 0,
    activeClients: 0,
    todaySessions: 0,
    weekSessions: 0,
    monthSessions: 0,
    completedSessions: 0,
    cancelledSessions: 0,
    totalRevenue: 0,
    monthRevenue: 0,
    pendingPayroll: 0,
  })
  const [trainerStats, setTrainerStats] = useState<TrainerStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAdminStats()
    fetchTrainerPerformance()
  }, [user])

  const fetchAdminStats = async () => {
    try {
      setLoading(true)

      const today = new Date().toISOString().split('T')[0]
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const monthStart = new Date()
      monthStart.setDate(1)

      // Trainers
      const { data: trainers } = await supabase
        .from('trainers')
        .select('*')

      const activeTrainers = trainers || []

      // Clients
      const { data: contracts } = await supabase
        .from('contracts')
        .select('*')

      const activeContracts = contracts?.filter(c => c.status === 'active') || []

      // Today's sessions
      const { data: todaySessions } = await supabase
        .from('training_sessions')
        .select('*')
        .gte('session_date', today)
        .lt('session_date', new Date(Date.now() + 86400000).toISOString().split('T')[0])

      // This week's sessions
      const { data: weekSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .gte('session_date', weekStart.toISOString().split('T')[0])

      // This month's sessions
      const { data: monthSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Completed sessions
      const { data: completedSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('status', 'completed')
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Cancelled sessions
      const { data: cancelledSessions } = await supabase
        .from('training_sessions')
        .select('*')
        .in('status', ['cancelled', 'late_cancellation', 'no_show'])
        .gte('session_date', monthStart.toISOString().split('T')[0])

      // Revenue calculations
      const totalRevenue = contracts?.reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0
      const monthRevenue = activeContracts?.reduce((sum, c) => sum + (c.payment_amount || 0), 0) || 0

      // Pending payroll
      const { data: pendingPayroll } = await supabase
        .from('trainer_payroll')
        .select('amount')
        .eq('status', 'pending')

      const pendingAmount = pendingPayroll?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

      setStats({
        totalTrainers: trainers?.length || 0,
        activeTrainers: activeTrainers.length,
        totalClients: contracts?.length || 0,
        activeClients: activeContracts.length,
        todaySessions: todaySessions?.length || 0,
        weekSessions: weekSessions?.length || 0,
        monthSessions: monthSessions?.length || 0,
        completedSessions: completedSessions?.length || 0,
        cancelledSessions: cancelledSessions?.length || 0,
        totalRevenue,
        monthRevenue,
        pendingPayroll: pendingAmount,
      })
    } catch (error) {
      console.error('Error fetching admin stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTrainerPerformance = async () => {
    try {
      const { data: trainers } = await supabase
        .from('trainers')
        .select('*')

      if (!trainers) return

      const monthStart = new Date()
      monthStart.setDate(1)

      const trainerPerformance: TrainerStats[] = []

      for (const trainer of trainers) {
        // Get sessions
        const { data: sessions } = await supabase
          .from('training_sessions')
          .select('*')
          .eq('trainer_id', trainer.id)
          .gte('session_date', monthStart.toISOString().split('T')[0])

        const completed = sessions?.filter(s => s.status === 'completed').length || 0
        const cancelled = sessions?.filter(s => 
          ['cancelled', 'late_cancellation', 'no_show'].includes(s.status)
        ).length || 0
        const total = sessions?.length || 0

        // Get active clients
        const { data: clients } = await supabase
          .from('client_trainer_assignments')
          .select('*')
          .eq('trainer_id', trainer.id)

        const completionRate = total > 0 ? (completed / total) * 100 : 0

        trainerPerformance.push({
          id: trainer.id,
          name: `${trainer.first_name} ${trainer.last_name}`,
          totalSessions: total,
          completedSessions: completed,
          cancelledSessions: cancelled,
          activeClients: clients?.length || 0,
          completionRate,
          revenue: 0, // TODO: Calculate from contracts
        })
      }

      setTrainerStats(trainerPerformance.sort((a, b) => b.completionRate - a.completionRate))
    } catch (error) {
      console.error('Error fetching trainer performance:', error)
    }
  }

  const exportPayrollReport = () => {
    // TODO: Implement CSV export
    alert('Payroll export feature coming soon!')
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 p-4 pb-32 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Bird's-eye view of all operations
            </p>
          </div>
          <Button onClick={exportPayrollReport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Payroll
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Trainers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeTrainers}</div>
              <p className="text-xs text-muted-foreground">of {stats.totalTrainers} total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeClients}</div>
              <p className="text-xs text-muted-foreground">of {stats.totalClients} total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sessions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todaySessions}</div>
              <p className="text-xs text-muted-foreground">{stats.weekSessions} this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Month Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.monthRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">${stats.totalRevenue.toFixed(2)} total</p>
            </CardContent>
          </Card>
        </div>

        {/* Session Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Sessions</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedSessions}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled Sessions</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.cancelledSessions}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats.monthSessions > 0 
                  ? ((stats.completedSessions / stats.monthSessions) * 100).toFixed(1)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground">Overall performance</p>
            </CardContent>
          </Card>
        </div>

        {/* Payroll Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Payroll Management</CardTitle>
            <CardDescription>Pending payments and approvals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg bg-yellow-50">
              <div>
                <p className="font-semibold">Pending Payroll</p>
                <p className="text-sm text-muted-foreground">Awaiting approval</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${stats.pendingPayroll.toFixed(2)}</p>
                <Button size="sm" className="mt-2" onClick={() => navigate('/admin')}>
                  Review & Approve
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trainer Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Trainer Performance</CardTitle>
            <CardDescription>Monthly metrics and completion rates</CardDescription>
          </CardHeader>
          <CardContent>
            {trainerStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trainer data available</p>
            ) : (
              <div className="space-y-3">
                {trainerStats.map((trainer) => (
                  <div
                    key={trainer.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{trainer.name}</p>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        <span>{trainer.activeClients} clients</span>
                        <span>{trainer.totalSessions} sessions</span>
                        <span className="text-green-600">{trainer.completedSessions} completed</span>
                        {trainer.cancelledSessions > 0 && (
                          <span className="text-red-600">{trainer.cancelledSessions} cancelled</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{trainer.completionRate.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">Completion rate</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Administrative tools and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Button onClick={() => navigate('/calendar')} className="h-20">
              <Calendar className="h-5 w-5 mr-2" />
              View Calendar
            </Button>
            <Button onClick={() => navigate('/calculator')} className="h-20" variant="outline">
              <TrendingUp className="h-5 w-5 mr-2" />
              Create Contract
            </Button>
            <Button onClick={() => navigate('/trainers')} className="h-20" variant="outline">
              <Users className="h-5 w-5 mr-2" />
              Manage Trainers
            </Button>
            <Button onClick={() => navigate('/admin')} className="h-20" variant="outline">
              <BarChart3 className="h-5 w-5 mr-2" />
              Full Analytics
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
