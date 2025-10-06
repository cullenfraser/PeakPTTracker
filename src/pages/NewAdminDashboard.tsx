import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Users,
  UserPlus,
  UserCircle2,
  DollarSign,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileText,
  AlertCircle,
} from 'lucide-react'

interface DashboardStats {
  totalTrainers: number
  activeClients: number
  totalSessions: number
  completionRate: number
  revenue: number
  pendingPayroll: number
}

interface TrainerMetrics {
  id: string
  name: string
  totalSessions: number
  completedSessions: number
  cancelledSessions: number
  activeClients: number
  completionRate: number
  revenue: number
  pendingPay: number
  paymentType: string
  hourlyRate?: number
  salary?: number
}

interface PayrollPeriod {
  id: string
  period_type: string
  start_date: string
  end_date: string
  status: string
  total_amount: number
  entries_count: number
}

export default function NewAdminDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalTrainers: 0,
    activeClients: 0,
    totalSessions: 0,
    completionRate: 0,
    revenue: 0,
    pendingPayroll: 0,
  })
  const [trainerMetrics, setTrainerMetrics] = useState<TrainerMetrics[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [selectedPeriodType, setSelectedPeriodType] = useState<'weekly' | 'bi_weekly' | 'monthly'>('bi_weekly')
  const [showAddTrainer, setShowAddTrainer] = useState(false)
  const [addingTrainer, setAddingTrainer] = useState(false)
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [showAddClient, setShowAddClient] = useState(false)
  const [addingClient, setAddingClient] = useState(false)
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role: 'admin' as 'admin' | 'super_admin',
  })
  const [clientForm, setClientForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'Canada',
    company_name: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    notes: '',
    assignedTrainerId: '',
  })
  const [trainerForm, setTrainerForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    payment_type: 'per_session',
    hourly_rate: '',
  })

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchStats(),
        fetchTrainerMetrics(),
        fetchPayrollPeriods(),
      ])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTrainerInput = (key: keyof typeof trainerForm, value: string) => {
    setTrainerForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAdminInput = (key: keyof typeof adminForm, value: string) => {
    setAdminForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleClientInput = (key: keyof typeof clientForm, value: string) => {
    setClientForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAddTrainer = async () => {
    if (!trainerForm.email || !trainerForm.password || !trainerForm.first_name || !trainerForm.last_name) {
      alert('First name, last name, email, and password are required.')
      return
    }

    setAddingTrainer(true)
    try {
      const { data, error } = await supabase.functions.invoke('add-trainer', {
        body: {
          email: trainerForm.email,
          password: trainerForm.password,
          first_name: trainerForm.first_name,
          last_name: trainerForm.last_name,
          phone: trainerForm.phone || null,
          payment_type: trainerForm.payment_type,
          hourly_rate: trainerForm.hourly_rate ? Number(trainerForm.hourly_rate) : null,
        },
      })

      if (error || !data?.success) {
        throw new Error(error?.message || 'Failed to add trainer')
      }

      // Reload dashboard data
      await fetchDashboardData()

      // Reset form
      setTrainerForm({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone: '',
        payment_type: 'per_session',
        hourly_rate: '',
      })
      setShowAddTrainer(false)
    } catch (error) {
      console.error('Error adding trainer:', error)
      alert('Failed to add trainer. Check console for details.')
    } finally {
      setAddingTrainer(false)
    }
  }

  const handleAddAdmin = async () => {
    if (!adminForm.email || !adminForm.password || !adminForm.first_name || !adminForm.last_name) {
      alert('First name, last name, email, and password are required.')
      return
    }

    setAddingAdmin(true)
    try {
      const { data, error } = await supabase.functions.invoke('add-admin', {
        body: {
          email: adminForm.email,
          password: adminForm.password,
          first_name: adminForm.first_name,
          last_name: adminForm.last_name,
          phone: adminForm.phone || null,
          role: adminForm.role,
        },
      })

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to add admin user')
      }

      await fetchDashboardData()
      setAdminForm({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone: '',
        role: 'admin',
      })
      setShowAddAdmin(false)
    } catch (error) {
      console.error('Error adding admin:', error)
      alert('Failed to add admin. Check console for details.')
    } finally {
      setAddingAdmin(false)
    }
  }

  const handleAddClient = async () => {
    if (!clientForm.first_name || !clientForm.last_name || !clientForm.email) {
      alert('First name, last name, and email are required.')
      return
    }

    setAddingClient(true)
    try {
      const clientPayload: Database['public']['Tables']['clients']['Insert'] = {
        first_name: clientForm.first_name,
        last_name: clientForm.last_name,
        email: clientForm.email,
        phone: clientForm.phone || null,
        address: clientForm.address || null,
        city: clientForm.city || null,
        province: clientForm.province || null,
        postal_code: clientForm.postal_code || null,
        country: clientForm.country || null,
        company_name: clientForm.company_name || null,
        emergency_contact_name: clientForm.emergency_contact_name || null,
        emergency_contact_phone: clientForm.emergency_contact_phone || null,
        emergency_contact_relationship: clientForm.emergency_contact_relationship || null,
        notes: clientForm.notes || null,
      }

      const { data: newClient, error } = await supabase
        .from('clients')
        .insert([clientPayload])
        .select()
        .single()

      if (error || !newClient) throw error

      if (clientForm.assignedTrainerId) {
        const assignmentPayload: Database['public']['Tables']['client_trainer_assignments']['Insert'] = {
          client_id: newClient.id,
          trainer_id: clientForm.assignedTrainerId,
        }

        const { error: assignmentError } = await supabase
          .from('client_trainer_assignments')
          .insert([assignmentPayload])

        if (assignmentError) {
          console.error('Error creating client-trainer assignment:', assignmentError)
        }
      }

      await fetchDashboardData()
      setClientForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        country: 'Canada',
        company_name: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relationship: '',
        notes: '',
        assignedTrainerId: '',
      })
      setShowAddClient(false)
    } catch (error) {
      console.error('Error adding client:', error)
      alert('Failed to add client. Check console for details.')
    } finally {
      setAddingClient(false)
    }
  }

  const fetchStats = async () => {
    // Get trainers count
    const { data: trainers } = await supabase.from('trainers').select('id')
    
    // Get active clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .eq('is_active', true)
    
    // Get sessions (current month)
    const monthStart = new Date()
    monthStart.setDate(1)
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('*')
      .gte('session_date', monthStart.toISOString())
    
    const completed = sessions?.filter(s => s.status === 'completed').length || 0
    const total = sessions?.length || 0
    
    // Get revenue (current month active contracts)
    const { data: contracts } = await supabase
      .from('contracts')
      .select('total_amount')
      .eq('status', 'active')
      .gte('start_date', monthStart.toISOString())
    
    const revenue = contracts?.reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0
    
    // Get pending payroll
    const { data: pendingPayroll } = await supabase
      .from('payroll_entries')
      .select('net_amount')
      .eq('status', 'pending')
    
    const pending = pendingPayroll?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0

    setStats({
      totalTrainers: trainers?.length || 0,
      activeClients: clients?.length || 0,
      totalSessions: total,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      revenue,
      pendingPayroll: pending,
    })
  }

  const fetchTrainerMetrics = async () => {
    const { data: trainers } = await supabase
      .from('trainers')
      .select('*')
      .order('first_name')
    
    if (!trainers) return

    const monthStart = new Date()
    monthStart.setDate(1)

    const metrics: TrainerMetrics[] = []

    for (const trainer of trainers) {
      // Get sessions
      const { data: sessions } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('trainer_id', trainer.id)
        .gte('session_date', monthStart.toISOString())

      const completed = sessions?.filter(s => s.status === 'completed').length || 0
      const cancelled = sessions?.filter(s => 
        ['cancelled', 'no_show'].includes(s.status || '')
      ).length || 0
      const total = sessions?.length || 0

      // Get active clients
      const { data: assignments } = await supabase
        .from('client_trainer_assignments')
        .select('client_id')
        .eq('trainer_id', trainer.id)
        .is('unassigned_date', null)

      // Get contracts for revenue
      const { data: contracts } = await supabase
        .from('contracts')
        .select('total_amount')
        .eq('trainer_id', trainer.id)
        .eq('status', 'active')
        .gte('start_date', monthStart.toISOString())

      const revenue = contracts?.reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0

      // Get pending payroll
      const { data: pendingEntry } = await supabase
        .from('payroll_entries')
        .select('net_amount')
        .eq('trainer_id', trainer.id)
        .eq('status', 'pending')
        .single()

      metrics.push({
        id: trainer.id,
        name: `${trainer.first_name} ${trainer.last_name}`,
        totalSessions: total,
        completedSessions: completed,
        cancelledSessions: cancelled,
        activeClients: assignments ? new Set(assignments.map((assignment) => assignment.client_id)).size : 0,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        revenue,
        pendingPay: pendingEntry?.net_amount || 0,
        paymentType: trainer.payment_type || 'per_session',
        hourlyRate: trainer.hourly_rate ?? undefined,
        salary: trainer.salary ?? undefined,
      })
    }

    setTrainerMetrics(metrics)
  }

  const fetchPayrollPeriods = async () => {
    const { data } = await supabase
      .from('payroll_periods')
      .select(`
        *,
        entries:payroll_entries(count)
      `)
      .eq('period_type', selectedPeriodType)
      .order('start_date', { ascending: false })
      .limit(10)

    if (data) {
      setPayrollPeriods(data.map(p => ({
        ...p,
        entries_count: p.entries?.[0]?.count || 0,
      })))
    }
  }

  const createPayrollPeriod = async () => {
    const today = new Date()
    let startDate = new Date()
    let endDate = new Date()

    if (selectedPeriodType === 'weekly') {
      startDate.setDate(today.getDate() - today.getDay())
      endDate.setDate(startDate.getDate() + 6)
    } else if (selectedPeriodType === 'bi_weekly') {
      startDate.setDate(today.getDate() - today.getDay())
      endDate.setDate(startDate.getDate() + 13)
    } else {
      startDate.setDate(1)
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }

    const { error } = await supabase
      .from('payroll_periods')
      .insert({
        period_type: selectedPeriodType,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'draft',
      })

    if (!error) {
      fetchPayrollPeriods()
    }
  }

  const exportReport = (type: 'trainers' | 'payroll') => {
    // CSV export functionality
    let csvContent = ''
    
    if (type === 'trainers') {
      csvContent = 'Trainer,Sessions,Completed,Cancelled,Completion %,Clients,Revenue,Pending Pay\n'
      trainerMetrics.forEach(t => {
        csvContent += `${t.name},${t.totalSessions},${t.completedSessions},${t.cancelledSessions},${t.completionRate.toFixed(1)}%,${t.activeClients},$${t.revenue.toFixed(2)},$${t.pendingPay.toFixed(2)}\n`
      })
    } else {
      csvContent = 'Period,Start Date,End Date,Status,Total Amount,Entries\n'
      payrollPeriods.forEach(p => {
        csvContent += `${p.period_type},${p.start_date},${p.end_date},${p.status},$${p.total_amount.toFixed(2)},${p.entries_count}\n`
      })
    }

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_report_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Complete overview of trainers, clients, and payroll</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showAddTrainer} onOpenChange={setShowAddTrainer}>
            <DialogTrigger asChild>
              <Button>
                <Users className="w-4 h-4 mr-2" />
                Add Trainer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Trainer</DialogTitle>
                <DialogDescription>
                  Create a trainer profile and onboard them with login access. Trainers cannot access this admin dashboard.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={trainerForm.first_name}
                    onChange={(e) => handleTrainerInput('first_name', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={trainerForm.last_name}
                    onChange={(e) => handleTrainerInput('last_name', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={trainerForm.email}
                    onChange={(e) => handleTrainerInput('email', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Temporary Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={trainerForm.password}
                    onChange={(e) => handleTrainerInput('password', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={trainerForm.phone}
                    onChange={(e) => handleTrainerInput('phone', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment_type">Payment Type</Label>
                  <select
                    id="payment_type"
                    className="px-3 py-2 border rounded-md"
                    value={trainerForm.payment_type}
                    onChange={(e) => handleTrainerInput('payment_type', e.target.value)}
                  >
                    <option value="per_session">Per Session</option>
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hourly_rate">Hourly Rate (optional)</Label>
                  <Input
                    id="hourly_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={trainerForm.hourly_rate}
                    onChange={(e) => handleTrainerInput('hourly_rate', e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddTrainer(false)} disabled={addingTrainer}>
                  Cancel
                </Button>
                <Button onClick={handleAddTrainer} disabled={addingTrainer}>
                  {addingTrainer ? 'Adding...' : 'Add Trainer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Admin User</DialogTitle>
                <DialogDescription>Onboard a new admin or super admin user.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="admin_first_name">First Name</Label>
                  <Input
                    id="admin_first_name"
                    value={adminForm.first_name}
                    onChange={(e) => handleAdminInput('first_name', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin_last_name">Last Name</Label>
                  <Input
                    id="admin_last_name"
                    value={adminForm.last_name}
                    onChange={(e) => handleAdminInput('last_name', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin_email">Email</Label>
                  <Input
                    id="admin_email"
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => handleAdminInput('email', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin_password">Temporary Password</Label>
                  <Input
                    id="admin_password"
                    type="password"
                    value={adminForm.password}
                    onChange={(e) => handleAdminInput('password', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin_phone">Phone (optional)</Label>
                  <Input
                    id="admin_phone"
                    value={adminForm.phone}
                    onChange={(e) => handleAdminInput('phone', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin_role">Role</Label>
                  <select
                    id="admin_role"
                    className="px-3 py-2 border rounded-md"
                    value={adminForm.role}
                    onChange={(e) => handleAdminInput('role', e.target.value as 'admin' | 'super_admin')}
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddAdmin(false)} disabled={addingAdmin}>
                  Cancel
                </Button>
                <Button onClick={handleAddAdmin} disabled={addingAdmin}>
                  {addingAdmin ? 'Adding...' : 'Add Admin'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserCircle2 className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Client</DialogTitle>
                <DialogDescription>Collect client details for onboarding and invoicing.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="client_first_name">First Name</Label>
                    <Input
                      id="client_first_name"
                      value={clientForm.first_name}
                      onChange={(e) => handleClientInput('first_name', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_last_name">Last Name</Label>
                    <Input
                      id="client_last_name"
                      value={clientForm.last_name}
                      onChange={(e) => handleClientInput('last_name', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="client_email">Email</Label>
                    <Input
                      id="client_email"
                      type="email"
                      value={clientForm.email}
                      onChange={(e) => handleClientInput('email', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_phone">Phone</Label>
                    <Input
                      id="client_phone"
                      value={clientForm.phone}
                      onChange={(e) => handleClientInput('phone', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="client_address">Address</Label>
                  <Input
                    id="client_address"
                    value={clientForm.address}
                    onChange={(e) => handleClientInput('address', e.target.value)}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="client_city">City</Label>
                    <Input
                      id="client_city"
                      value={clientForm.city}
                      onChange={(e) => handleClientInput('city', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_province">Province/State</Label>
                    <Input
                      id="client_province"
                      value={clientForm.province}
                      onChange={(e) => handleClientInput('province', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="client_postal_code">Postal/ZIP Code</Label>
                    <Input
                      id="client_postal_code"
                      value={clientForm.postal_code}
                      onChange={(e) => handleClientInput('postal_code', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_country">Country</Label>
                    <Input
                      id="client_country"
                      value={clientForm.country}
                      onChange={(e) => handleClientInput('country', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="client_company_name">Company Name (optional)</Label>
                  <Input
                    id="client_company_name"
                    value={clientForm.company_name}
                    onChange={(e) => handleClientInput('company_name', e.target.value)}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="client_emergency_name">Emergency Contact Name</Label>
                    <Input
                      id="client_emergency_name"
                      value={clientForm.emergency_contact_name}
                      onChange={(e) => handleClientInput('emergency_contact_name', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_emergency_phone">Emergency Contact Phone</Label>
                    <Input
                      id="client_emergency_phone"
                      value={clientForm.emergency_contact_phone}
                      onChange={(e) => handleClientInput('emergency_contact_phone', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client_emergency_relationship">Relationship</Label>
                    <Input
                      id="client_emergency_relationship"
                      value={clientForm.emergency_contact_relationship}
                      onChange={(e) => handleClientInput('emergency_contact_relationship', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="client_notes">Notes</Label>
                  <Textarea
                    id="client_notes"
                    value={clientForm.notes}
                    onChange={(e) => handleClientInput('notes', e.target.value)}
                    rows={3}
                    placeholder="Any additional client details or invoicing notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddClient(false)} disabled={addingClient}>
                  Cancel
                </Button>
                <Button onClick={handleAddClient} disabled={addingClient}>
                  {addingClient ? 'Adding...' : 'Add Client'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => fetchDashboardData()}>
            <Clock className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Trainers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{stats.totalTrainers}</div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{stats.activeClients}</div>
              <Users className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Sessions (Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{stats.completionRate.toFixed(1)}%</div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Revenue (Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Payroll</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">${stats.pendingPayroll.toLocaleString()}</div>
              <AlertCircle className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="trainers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trainers">Trainer Performance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Management</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Analytics</TabsTrigger>
        </TabsList>

        {/* Trainer Performance Tab */}
        <TabsContent value="trainers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Trainer Performance Metrics</CardTitle>
                  <CardDescription>Session tracking, completion rates, and client management</CardDescription>
                </div>
                <Button onClick={() => exportReport('trainers')}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Trainer</th>
                      <th className="text-right py-3 px-4">Sessions</th>
                      <th className="text-right py-3 px-4">Completed</th>
                      <th className="text-right py-3 px-4">Cancelled</th>
                      <th className="text-right py-3 px-4">Rate</th>
                      <th className="text-right py-3 px-4">Clients</th>
                      <th className="text-right py-3 px-4">Revenue</th>
                      <th className="text-right py-3 px-4">Payment Type</th>
                      <th className="text-right py-3 px-4">Pending Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainerMetrics.map((trainer) => (
                      <tr key={trainer.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{trainer.name}</td>
                        <td className="py-3 px-4 text-right">{trainer.totalSessions}</td>
                        <td className="py-3 px-4 text-right text-green-600">{trainer.completedSessions}</td>
                        <td className="py-3 px-4 text-right text-red-600">{trainer.cancelledSessions}</td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant={trainer.completionRate >= 80 ? 'default' : 'destructive'}>
                            {trainer.completionRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">{trainer.activeClients}</td>
                        <td className="py-3 px-4 text-right font-medium">${trainer.revenue.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="outline">{trainer.paymentType}</Badge>
                        </td>
                        <td className="py-3 px-4 text-right text-orange-600 font-medium">
                          ${trainer.pendingPay.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Management Tab */}
        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Payroll Periods</CardTitle>
                  <CardDescription>Manage weekly, bi-weekly, and monthly payroll</CardDescription>
                </div>
                <div className="flex gap-2">
                  <select 
                    value={selectedPeriodType}
                    onChange={(e) => setSelectedPeriodType(e.target.value as any)}
                    className="px-3 py-2 border rounded-md"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <Button onClick={createPayrollPeriod}>
                    <FileText className="w-4 h-4 mr-2" />
                    Create Period
                  </Button>
                  <Button variant="outline" onClick={() => exportReport('payroll')}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payrollPeriods.map((period) => (
                  <div key={period.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{period.period_type}</Badge>
                        <span className="font-medium">{period.start_date} to {period.end_date}</span>
                        <Badge 
                          variant={
                            period.status === 'paid' ? 'default' :
                            period.status === 'approved' ? 'secondary' :
                            period.status === 'pending' ? 'destructive' : 'outline'
                          }
                        >
                          {period.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {period.entries_count} entries • Total: ${period.total_amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">View Details</Button>
                      {period.status === 'draft' && (
                        <Button size="sm">Approve</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Analytics Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Analytics</CardTitle>
              <CardDescription>Track revenue, commissions, and bonuses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <TrendingUp className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">Revenue Analytics Coming Soon</p>
                <p className="text-sm mt-2">Charts and detailed revenue breakdown will be available here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  )
}
