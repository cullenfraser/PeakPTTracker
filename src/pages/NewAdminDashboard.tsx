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
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils'

const loadTrainerClients = async (trainerId: string) => {
  const { data: splitRows, error: splitError } = await supabase
    .from('client_trainer_session_splits')
    .select('client_id, allocated_sessions, clients(first_name, last_name, email, phone)')
    .eq('trainer_id', trainerId)
    .is('effective_to', null)

  if (splitError) throw splitError

  const rows = (splitRows ?? []) as Array<{
    client_id: string
    allocated_sessions: number | null
    clients?: {
      first_name: string | null
      last_name: string | null
      email: string | null
      phone: string | null
    } | null
  }>

  return rows
    .map((row) => {
      const first = row.clients?.first_name?.trim() ?? ''
      const last = row.clients?.last_name?.trim() ?? ''
      const name = `${first} ${last}`.trim()
      return {
        id: row.client_id,
        name: name.length > 0 ? name : 'Client',
        email: row.clients?.email ?? null,
        phone: row.clients?.phone ?? null,
        sessionCount: row.allocated_sessions ?? 0,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (rows.length > 0) {
    return rows
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('client_trainer_assignments')
    .select('client_id, clients(first_name, last_name, email, phone)')
    .eq('trainer_id', trainerId)
    .is('unassigned_date', null)

  if (assignmentError) throw assignmentError

  return (assignmentRows ?? [])
    .filter((row) => row.client_id && row.clients)
    .map((row) => {
      const first = row.clients?.first_name?.trim() ?? ''
      const last = row.clients?.last_name?.trim() ?? ''
      const name = `${first} ${last}`.trim()
      return {
        id: row.client_id as string,
        name: name.length > 0 ? name : 'Client',
        email: row.clients?.email ?? null,
        phone: row.clients?.phone ?? null,
        sessionCount: 0,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const loadTrainerClientCount = async (trainerId: string) => {
  const { data: splitRows, error: splitError } = await supabase
    .from('client_trainer_session_splits')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .is('effective_to', null)

  if (splitError) throw splitError

  if (splitRows && splitRows.length > 0) {
    return new Set(splitRows.map((row) => row.client_id)).size
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('client_trainer_assignments')
    .select('client_id')
    .eq('trainer_id', trainerId)
    .is('unassigned_date', null)

  if (assignmentError) throw assignmentError

  return assignmentRows ? new Set(assignmentRows.map((row) => row.client_id)).size : 0
}

// Minimal client aggregation types and helpers (aligned with ClientsPage logic)
interface ContractRecord {
  id: string
  contract_number: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  status: string | null
  total_sessions: number | null
  start_date: string | null
  end_date: string | null
  created_at: string | null
  total_amount: number | null
  trainers?: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  '1_on_1': '1 on 1',
  one_on_one: '1 on 1',
  small_group: 'Small Group',
  peak_class: 'Peak Class',
  pfa_class: 'PFA Class',
  pfa_team: 'PFA Team',
  meeting: 'Meeting',
  onboarding: 'Onboarding',
  tasks: 'Tasks',
  general: 'General',
}

const CHART_COLORS = ['#16a34a', '#2563eb', '#f97316', '#f43f5e', '#8b5cf6', '#14b8a6', '#facc15']

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

const formatSessionTypeLabel = (value?: string | null) => {
  if (!value) return 'Other'
  const normalized = value.toLowerCase()
  if (SESSION_TYPE_LABELS[normalized]) return SESSION_TYPE_LABELS[normalized]
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const ensureMonthKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const formatMonthLabel = (key: string) => {
  if (!key) return ''
  try {
    const [year, month] = key.split('-').map((part) => Number.parseInt(part, 10))
    if (!Number.isFinite(year) || !Number.isFinite(month)) return key
    const date = new Date(year, month - 1, 1)
    return monthFormatter.format(date)
  } catch (error) {
    return key
  }
}

type SessionSlice = {
  name: string
  value: number
  percentage: number
}

const buildPieChartData = (counts: Record<string, number>): SessionSlice[] => {
  const entries = Object.entries(counts)
  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  if (total === 0) return []
  return entries
    .map(([key, value]) => ({
      name: formatSessionTypeLabel(key),
      value,
      percentage: Math.round((value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value)
}

interface AggregatedClient {
  key: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
  totalSessions: number
  contractCount: number
  latestStartDate: string | null
  latestEndDate: string | null
  latestCreated: string | null
  contractIds: string[]
  contractNumbers: string[]
  remainingSessions?: number
}

const normalizeEmail = (email?: string | null) => {
  const trimmed = email?.trim().toLowerCase()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const pickLatest = (current: string | null, incoming: string | null) => {
  if (!incoming) return current
  if (!current) return incoming
  return new Date(incoming).getTime() > new Date(current).getTime() ? incoming : current
}

const normalizeContractStatus = (
  contract: ContractRecord,
  totalSessions: number,
  completedSessions: number,
): string | null => {
  const raw = (contract.status ?? '').toLowerCase()
  if (['cancelled', 'expired'].includes(raw)) return 'closed'
  if (raw === 'completed' || (totalSessions > 0 && completedSessions >= totalSessions)) return 'completed'
  if (completedSessions > 0) return 'active'
  return 'pending'
}

const aggregateClients = (
  rows: ContractRecord[],
  completedByContract: Map<string, number>,
  totalSessionsByContract: Map<string, number>,
): AggregatedClient[] => {
  const map = new Map<string, AggregatedClient>()

  const getSortTime = (contract: ContractRecord) => {
    const created = contract.created_at ? new Date(contract.created_at).getTime() : Number.NaN
    if (!Number.isNaN(created)) return created
    const start = contract.start_date ? new Date(contract.start_date).getTime() : Number.NaN
    if (!Number.isNaN(start)) return start
    const end = contract.end_date ? new Date(contract.end_date).getTime() : Number.NaN
    if (!Number.isNaN(end)) return end
    return 0
  }

  const sortedRows = [...rows].sort((a, b) => getSortTime(a) - getSortTime(b))

  sortedRows.forEach((contract) => {
    const key = normalizeEmail(contract.customer_email) ?? `${contract.customer_name}|${contract.customer_phone ?? contract.id}`
    const totalSessions = contract.total_sessions ?? 0
    const completedSessions = completedByContract.get(contract.id) ?? 0
    const status = normalizeContractStatus(contract, totalSessions, completedSessions)

    const startDate = contract.start_date ?? null
    const endDate = contract.end_date ?? null
    const createdAt = contract.created_at ?? null
    const contractNumber = contract.contract_number ?? 'Unknown'

    const existing = map.get(key)
    if (existing) {
      const alreadyHas = existing.contractIds.includes(contract.id) || existing.contractNumbers.includes(contractNumber)
      if (!alreadyHas) {
        existing.totalSessions += totalSessions
        existing.contractCount += 1
        existing.latestStartDate = pickLatest(existing.latestStartDate, startDate)
        existing.latestEndDate = pickLatest(existing.latestEndDate, endDate)
        existing.latestCreated = pickLatest(existing.latestCreated, createdAt)
        existing.contractIds.push(contract.id)
        existing.contractNumbers.push(contractNumber)
      }
      existing.status = status
    } else {
      map.set(key, {
        key,
        name: contract.customer_name ?? null,
        email: contract.customer_email ?? null,
        phone: contract.customer_phone ?? null,
        status,
        totalSessions,
        contractCount: 1,
        latestStartDate: startDate,
        latestEndDate: endDate,
        latestCreated: createdAt,
        contractIds: [contract.id],
        contractNumbers: [contractNumber],
      })
    }
  })

  for (const client of map.values()) {
    let remaining = 0
    for (const id of client.contractIds) {
      const total = totalSessionsByContract.get(id) ?? 0
      if (total <= 0) continue
      const completed = completedByContract.get(id) ?? 0
      remaining += Math.max(0, total - completed)
    }
    client.remainingSessions = remaining
    if (remaining === 0) client.status = 'Expired'
    else if (remaining <= 10) client.status = 'Expiring Soon'
    else client.status = 'Active'
  }

  return Array.from(map.values())
}

interface DashboardStats {
  totalTrainers: number
  activeClients: number
  currentMonthSessions: number
  currentMonthCompleted: number
  previousMonthSessions: number
  currentMonthLabel: string
  previousMonthLabel: string
  previousMonthCompleted: number
  currentCompletionRate: number
  previousCompletionRate: number
  paidRevenue: number
  expectedRevenue: number
  previousPaidRevenue: number
  previousExpectedRevenue: number
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
  level?: number | null
}

type TrainerModalChartData = {
  firstHalf: SessionSlice[]
  secondHalf: SessionSlice[]
  totalSessions: number
}

type TrainerModalClient = {
  id: string
  name: string
  email: string | null
  phone: string | null
  sessionCount: number
}

type TrainerModalMonthOption = {
  key: string
  label: string
}

type TrainerMonthSessionBuckets = {
  firstHalf: Record<string, number>
  secondHalf: Record<string, number>
  total: number
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

const renderSessionDelta = (stats: DashboardStats) => {
  const diff = stats.currentMonthSessions - stats.previousMonthSessions
  if (!Number.isFinite(diff) || (stats.currentMonthSessions === 0 && stats.previousMonthSessions === 0)) {
    return (
      <span className="text-gray-500 inline-flex items-center">
        <Minus className="w-3 h-3 mr-1" />
        No change
      </span>
    )
  }

  const isPositive = diff >= 0
  const ArrowIcon = isPositive ? ArrowUpRight : ArrowDownRight
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600'
  const label = `${diff > 0 ? '+' : ''}${diff}`

  return (
    <span className={`${colorClass} inline-flex items-center`}>
      <ArrowIcon className="w-3 h-3 mr-1" />
      {label} vs {stats.previousMonthSessions}
    </span>
  )
}

const renderCompletionDelta = (stats: DashboardStats) => {
  const diff = stats.currentCompletionRate - stats.previousCompletionRate
  if (!Number.isFinite(diff)) {
    return (
      <span className="text-gray-500 inline-flex items-center">
        <Minus className="w-3 h-3 mr-1" />
        No change
      </span>
    )
  }

  if (diff === 0) {
    return (
      <span className="text-gray-500 inline-flex items-center">
        <Minus className="w-3 h-3 mr-1" />
        {stats.currentCompletionRate.toFixed(1)}% vs {stats.previousCompletionRate.toFixed(1)}%
      </span>
    )
  }

  const isPositive = diff >= 0
  const ArrowIcon = isPositive ? ArrowUpRight : ArrowDownRight
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600'
  const label = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`

  return (
    <span className={`${colorClass} inline-flex items-center`}>
      <ArrowIcon className="w-3 h-3 mr-1" />
      {label} vs {stats.previousCompletionRate.toFixed(1)}%
    </span>
  )
}

const renderRevenueDelta = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return (
      <span className="text-gray-500 inline-flex items-center">
        <Minus className="w-3 h-3 mr-1" />
        No change
      </span>
    )
  }

  const diff = current - previous
  if (diff === 0) {
    return (
      <span className="text-gray-500 inline-flex items-center">
        <Minus className="w-3 h-3 mr-1" />
        {formatCurrency(current)} vs {formatCurrency(previous)}
      </span>
    )
  }

  const isPositive = diff >= 0
  const ArrowIcon = isPositive ? ArrowUpRight : ArrowDownRight
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600'
  return (
    <span className={`${colorClass} inline-flex items-center`}>
      <ArrowIcon className="w-3 h-3 mr-1" />
      {`${diff >= 0 ? '+' : ''}${formatCurrency(Math.abs(diff))}`} vs {formatCurrency(previous)}
    </span>
  )
}

export default function NewAdminDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalTrainers: 0,
    activeClients: 0,
    currentMonthSessions: 0,
    currentMonthCompleted: 0,
    previousMonthSessions: 0,
    currentMonthLabel: '',
    previousMonthLabel: '',
    previousMonthCompleted: 0,
    currentCompletionRate: 0,
    previousCompletionRate: 0,
    paidRevenue: 0,
    expectedRevenue: 0,
    previousPaidRevenue: 0,
    previousExpectedRevenue: 0,
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
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null)
  const [trainerModalOpen, setTrainerModalOpen] = useState(false)
  const [trainerModalLoading, setTrainerModalLoading] = useState(false)
  const [trainerModalForm, setTrainerModalForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    payment_type: 'per_session',
    hourly_rate: '',
    salary: '',
    level: '1',
  })
  const [trainerModalSaving, setTrainerModalSaving] = useState(false)
  const [trainerModalCharts, setTrainerModalCharts] = useState<Record<string, TrainerMonthSessionBuckets>>({})
  const [trainerModalMonthOptions, setTrainerModalMonthOptions] = useState<TrainerModalMonthOption[]>([])
  const [trainerModalSelectedMonth, setTrainerModalSelectedMonth] = useState('')
  const [trainerModalChartData, setTrainerModalChartData] = useState<TrainerModalChartData | null>(null)
  const [trainerModalClients, setTrainerModalClients] = useState<TrainerModalClient[]>([])
  const [trainerSplitsAvailable, setTrainerSplitsAvailable] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  useEffect(() => {
    if (!trainerModalOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [trainerModalOpen])

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

  const handleTrainerModalInput = (key: keyof typeof trainerModalForm, value: string) => {
    setTrainerModalForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSendTrainerPasswordReset = async () => {
    try {
      const email = (trainerModalForm.email || '').trim()
      if (!email) {
        alert('Trainer email is missing')
        return
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      alert('Password reset email sent.')
    } catch (err: any) {
      console.error('Error sending reset email:', err)
      alert(err?.message || 'Failed to send password reset email')
    }
  }

  const openTrainerModal = async (trainerId: string) => {
    setSelectedTrainerId(trainerId)
    setTrainerModalOpen(true)
    setTrainerModalLoading(true)
    setTrainerModalCharts({})
    setTrainerModalMonthOptions([])
    setTrainerModalSelectedMonth('')
    setTrainerModalChartData(null)
    setTrainerModalClients([])
    setTrainerSplitsAvailable((prev) => {
      const clone = { ...prev }
      if (selectedTrainerId) delete clone[selectedTrainerId]
      return clone
    })
    try {
      const { data, error } = await supabase
        .from('trainers')
        .select('id, first_name, last_name, email, phone, payment_type, hourly_rate, salary, level')
        .eq('id', trainerId)
        .maybeSingle()

      if (error) throw error
      if (data) {
        setTrainerModalForm({
          first_name: data.first_name ?? '',
          last_name: data.last_name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          payment_type: data.payment_type ?? 'per_session',
          hourly_rate: data.hourly_rate?.toString() ?? '',
          salary: data.salary?.toString() ?? '',
          level: (data.level ?? 1).toString(),
        })
      }

      const { data: sessionRows, error: sessionError } = await supabase
        .from('training_sessions')
        .select('session_date, session_type')
        .eq('trainer_id', trainerId)

      if (sessionError) throw sessionError

      const buckets: Record<string, TrainerMonthSessionBuckets> = {}
      if (sessionRows) {
        const now = new Date()
        const currentMonthKey = ensureMonthKey(new Date(now.getFullYear(), now.getMonth(), 1))

        for (const row of sessionRows as Array<{ session_date: string; session_type: string | null }>) {
          const date = new Date(row.session_date)
          if (Number.isNaN(date.getTime())) continue

          const monthKey = ensureMonthKey(new Date(date.getFullYear(), date.getMonth(), 1))
          if (!buckets[monthKey]) {
            buckets[monthKey] = {
              firstHalf: {},
              secondHalf: {},
              total: 0,
            }
          }

          const bucket = buckets[monthKey]
          const typeKey = (row.session_type ?? 'other').toLowerCase()
          const day = date.getDate()
          const target = day <= 15 ? bucket.firstHalf : bucket.secondHalf
          target[typeKey] = (target[typeKey] ?? 0) + 1
          bucket.total += 1
        }

        const monthKeys = Object.keys(buckets).sort((a, b) => (a > b ? -1 : 1))
        const options = monthKeys.map((key) => ({ key, label: formatMonthLabel(key) }))
        const selected = options.length > 0 ? options.find((opt) => opt.key === currentMonthKey) ?? options[0] : null

        setTrainerModalCharts(buckets)
        setTrainerModalMonthOptions(options)
        if (selected) {
          setTrainerModalSelectedMonth(selected.key)
          const chartPayload = buckets[selected.key]
          if (chartPayload) {
            setTrainerModalChartData({
              firstHalf: buildPieChartData(chartPayload.firstHalf),
              secondHalf: buildPieChartData(chartPayload.secondHalf),
              totalSessions: chartPayload.total,
            })
          }
        }
      }

      const clientList = await loadTrainerClients(trainerId)
      setTrainerModalClients(clientList)
      setTrainerSplitsAvailable((prev) => ({ ...prev, [trainerId]: clientList.some((client) => client.sessionCount > 0) }))
    } catch (err) {
      console.error('Error loading trainer', err)
    } finally {
      setTrainerModalLoading(false)
    }
  }

  const handleAdminInput = (key: keyof typeof adminForm, value: string) => {
    setAdminForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleClientInput = (key: keyof typeof clientForm, value: string) => {
    setClientForm((prev) => ({ ...prev, [key]: value }))
  }

  const closeTrainerModal = () => {
    setTrainerModalOpen(false)
    setSelectedTrainerId(null)
    setTrainerModalForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      payment_type: 'per_session',
      hourly_rate: '',
      salary: '',
      level: '1',
    })
    setTrainerModalCharts({})
    setTrainerModalMonthOptions([])
    setTrainerModalSelectedMonth('')
    setTrainerModalChartData(null)
    setTrainerModalClients([])
  }

  const handleSaveTrainerModal = async () => {
    if (!selectedTrainerId) return
    setTrainerModalSaving(true)
    try {
      const payload: Record<string, unknown> = {
        first_name: trainerModalForm.first_name || null,
        last_name: trainerModalForm.last_name || null,
        email: trainerModalForm.email || null,
        phone: trainerModalForm.phone || null,
        payment_type: trainerModalForm.payment_type || null,
        level: Number.parseInt(trainerModalForm.level, 10) || 1,
      }

      const hourly = trainerModalForm.hourly_rate.trim()
      const salary = trainerModalForm.salary.trim()
      payload.hourly_rate = hourly.length > 0 ? Number.parseFloat(hourly) : null
      payload.salary = salary.length > 0 ? Number.parseFloat(salary) : null

      const { error } = await supabase
        .from('trainers')
        .update(payload)
        .eq('id', selectedTrainerId)

      if (error) throw error

      await fetchDashboardData()
      closeTrainerModal()
    } catch (err) {
      console.error('Error updating trainer', err)
    } finally {
      setTrainerModalSaving(false)
    }
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
    
    // Active clients via contract aggregation (Active + Expiring Soon)
    const { data: contractRowsRaw } = await supabase
      .from('contracts')
      .select('id, contract_number, customer_name, customer_email, customer_phone, status, total_sessions, start_date, end_date, created_at')
    const contractRows = (contractRowsRaw ?? []) as unknown as ContractRecord[]

    // Build map/id list
    const contractMap = new Map<string, ContractRecord>()
    for (const c of contractRows) contractMap.set(c.id, c)
    const contractIds = contractRows.map((c) => c.id).filter((id) => typeof id === 'string' && id.length > 0)

    // Fetch participants and augment rows to count participant emails as clients (same approach as ClientsPage)
    let augmentedRows: ContractRecord[] = [...contractRows]
    if (contractIds.length > 0) {
      const { data: participants } = await supabase
        .from('participant_contracts')
        .select('participant_email, participant_name, participant_phone, contract_id')
        .in('contract_id', contractIds)

      for (const p of (participants ?? []) as Array<{
        participant_email: string | null
        participant_name: string | null
        participant_phone: string | null
        contract_id: string | null
      }>) {
        if (!p?.contract_id) continue
        const base = contractMap.get(p.contract_id)
        if (!base) continue

        const email = (p.participant_email ?? '').trim()
        const name = (p.participant_name ?? base.customer_name) as string | null
        const phone = (p.participant_phone ?? base.customer_phone) as string | null
        if (!email && !name && !phone) continue

        augmentedRows.push({
          ...base,
          customer_email: email || null,
          customer_name: name,
          customer_phone: phone,
        })
      }
    }

    const totalSessionsByContract = new Map<string, number>()
    for (const c of contractRows) {
      if (!c?.id) continue
      totalSessionsByContract.set(c.id, c.total_sessions ?? 0)
    }
    const completedByContract = new Map<string, number>()
    if (contractIds.length > 0) {
      const { data: sessionRows } = await supabase
        .from('training_sessions')
        .select('contract_id, status')
        .in('contract_id', contractIds)
      for (const s of (sessionRows ?? []) as Array<{ contract_id: string | null; status: string | null }>) {
        if (!s?.contract_id) continue
        if ((s.status ?? '').toLowerCase() !== 'completed') continue
        completedByContract.set(s.contract_id, (completedByContract.get(s.contract_id) ?? 0) + 1)
      }
    }
    const aggregatedClients = aggregateClients(augmentedRows, completedByContract, totalSessionsByContract)
    const activeClientsCount = aggregatedClients.filter((c) => (c.remainingSessions ?? 0) > 0).length
    // Debug: compare client status distribution (remove after validation)
    if (process.env.NODE_ENV !== 'production') {
      const statusCounts = aggregatedClients.reduce<Record<string, number>>((acc, c) => {
        const s = (c.status ?? 'unknown').toLowerCase()
        acc[s] = (acc[s] ?? 0) + 1
        return acc
      }, {})
      // eslint-disable-next-line no-console
      console.log('[AdminDashboard] Aggregated clients summary:', {
        total: aggregatedClients.length,
        activeClientsCount,
        statusCounts,
      })
    }
    
    // Get sessions (current month)
    const monthStart = new Date()
    monthStart.setDate(1)
    const prevMonthStart = new Date(monthStart)
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
    const prevMonthEnd = new Date(monthStart)
    const nextMonthStart = new Date(monthStart)
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1)
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('*')
      .gte('session_date', monthStart.toISOString())
      .lt('session_date', nextMonthStart.toISOString())

    const { data: prevSessionsRaw } = await supabase
      .from('training_sessions')
      .select('id, status')
      .gte('session_date', prevMonthStart.toISOString())
      .lt('session_date', prevMonthEnd.toISOString())

    const completed = sessions?.filter((s) => (s.status ?? '').toLowerCase() === 'completed').length || 0
    const total = sessions?.length || 0
    const prevSessions = prevSessionsRaw ?? []
    const prevTotal = prevSessions.length
    const prevCompleted = prevSessions.filter((s) => (s.status ?? '').toLowerCase() === 'completed').length
    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long' })
    const currentMonthLabel = monthFormatter.format(monthStart)
    const previousMonthLabel = monthFormatter.format(prevMonthStart)
    
    // Get revenue using invoice instances
    const invoiceSelection = 'installment_total_cents, status, scheduled_at, due_date'
    const { data: currentInvoices } = await supabase
      .from('contract_invoice_instances')
      .select(invoiceSelection)
      .gte('due_date', monthStart.toISOString())
      .lt('due_date', nextMonthStart.toISOString())

    const { data: previousInvoices } = await supabase
      .from('contract_invoice_instances')
      .select(invoiceSelection)
      .gte('due_date', prevMonthStart.toISOString())
      .lt('due_date', prevMonthEnd.toISOString())

    const centsToDollars = (value: number) => Math.round(value) / 100

    const summarizeInvoices = (
      invoices: Array<{ installment_total_cents?: number | null; status?: string | null }> = [],
    ) => {
      let paidCents = 0
      let expectedCents = 0
      for (const invoice of invoices) {
        const amountCents = typeof invoice.installment_total_cents === 'number' ? invoice.installment_total_cents : 0
        expectedCents += amountCents
        const status = (invoice.status ?? '').toLowerCase()
        if (['paid', 'completed', 'complete'].includes(status)) {
          paidCents += amountCents
        }
      }
      return {
        paid: centsToDollars(paidCents),
        expected: centsToDollars(expectedCents),
      }
    }

    const currentRevenue = summarizeInvoices(currentInvoices ?? [])
    const previousRevenue = summarizeInvoices(previousInvoices ?? [])

    // Get pending payroll
    const { data: pendingPayroll } = await supabase
      .from('payroll_entries')
      .select('net_amount')
      .eq('status', 'pending')
    
    const pendingAmount = pendingPayroll?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0

    const currentCompletionRate = total > 0 ? (completed / total) * 100 : 0
    const previousCompletionRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0

    setStats({
      totalTrainers: trainers?.length || 0,
      activeClients: activeClientsCount,
      currentMonthSessions: total,
      currentMonthCompleted: completed,
      previousMonthSessions: prevTotal,
      currentMonthLabel,
      previousMonthLabel,
      previousMonthCompleted: prevCompleted,
      currentCompletionRate,
      previousCompletionRate,
      paidRevenue: currentRevenue.paid,
      expectedRevenue: currentRevenue.expected,
      previousPaidRevenue: previousRevenue.paid,
      previousExpectedRevenue: previousRevenue.expected,
      pendingPayroll: pendingAmount,
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
      const activeClientsCount = await loadTrainerClientCount(trainer.id)

      // Get contracts for revenue
      const { data: contracts } = await supabase
        .from('contracts')
        .select('total_amount')
        .eq('trainer_id', trainer.id)
        .eq('status', 'active')
        .gte('start_date', monthStart.toISOString())

      const revenue = contracts?.reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0

      // Get pending payroll
      const { data: pendingEntries } = await supabase
        .from('payroll_entries')
        .select('net_amount')
        .eq('trainer_id', trainer.id)
        .eq('status', 'pending')

      metrics.push({
        id: trainer.id,
        name: `${trainer.first_name} ${trainer.last_name}`,
        totalSessions: total,
        completedSessions: completed,
        cancelledSessions: cancelled,
        activeClients: activeClientsCount,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        revenue,
        pendingPay:
          pendingEntries?.reduce((sum, entry) => sum + (entry?.net_amount ?? 0), 0) ?? 0,
        paymentType: trainer.payment_type || 'per_session',
        hourlyRate: trainer.hourly_rate ?? undefined,
        salary: trainer.salary ?? undefined,
        level: (trainer as Record<string, unknown>).level as number | undefined,
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
            <CardTitle className="text-sm font-medium text-gray-600">
              Sessions ({stats.currentMonthLabel || '—'})
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Compared to {stats.previousMonthLabel || 'previous month'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{stats.currentMonthSessions}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {renderSessionDelta(stats)}
                </div>
              </div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Completion Rate ({stats.currentMonthLabel || '—'})
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              {stats.currentMonthCompleted} of {stats.currentMonthSessions} sessions completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{stats.currentCompletionRate.toFixed(1)}%</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  {renderCompletionDelta(stats)}
                </div>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenue ({stats.currentMonthLabel || '—'})
            </CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Paid invoices vs expected this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatCurrency(stats.paidRevenue ?? 0)}</div>
                <div className="text-xs text-gray-500">
                  Expected {formatCurrency(stats.expectedRevenue ?? 0)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                  {renderRevenueDelta(stats.paidRevenue ?? 0, stats.previousPaidRevenue ?? 0)}
                  <span className="text-gray-400">•</span>
                  {renderRevenueDelta(stats.expectedRevenue ?? 0, stats.previousExpectedRevenue ?? 0)}
                </div>
              </div>
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
                        <td className="py-3 px-4 font-medium">
                          <button
                            type="button"
                            className="text-left text-primary font-semibold hover:underline cursor-pointer"
                            onClick={() => openTrainerModal(trainer.id)}
                          >
                            {trainer.name}
                          </button>
                          {typeof trainer.level === 'number' && (
                            <div className="text-xs text-gray-500">Level {trainer.level}</div>
                          )}
                        </td>
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

      {/* Trainer Details Modal */}
      <Dialog open={trainerModalOpen} onOpenChange={(open) => {
        if (!open) closeTrainerModal()
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Trainer Details</DialogTitle>
            <DialogDescription>View and edit trainer information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {trainerModalLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
              </div>
            ) : (
              <>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="tm_first_name">First Name</Label>
                <Input id="tm_first_name" value={trainerModalForm.first_name} onChange={(e) => handleTrainerModalInput('first_name', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tm_last_name">Last Name</Label>
                <Input id="tm_last_name" value={trainerModalForm.last_name} onChange={(e) => handleTrainerModalInput('last_name', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="tm_email">Email (login)</Label>
                <Input id="tm_email" type="email" value={trainerModalForm.email} onChange={(e) => handleTrainerModalInput('email', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tm_phone">Phone</Label>
                <Input id="tm_phone" value={trainerModalForm.phone} onChange={(e) => handleTrainerModalInput('phone', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <Label htmlFor="tm_payment_type">Payment Type</Label>
                <select
                  id="tm_payment_type"
                  className="px-3 py-2 border rounded-md w-full"
                  value={trainerModalForm.payment_type}
                  onChange={(e) => handleTrainerModalInput('payment_type', e.target.value)}
                >
                  <option value="per_session">Per Session</option>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              <div>
                <Label htmlFor="tm_hourly_rate">Hourly Rate</Label>
                <Input id="tm_hourly_rate" type="number" min="0" step="0.01" value={trainerModalForm.hourly_rate} onChange={(e) => handleTrainerModalInput('hourly_rate', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tm_salary">Salary</Label>
                <Input id="tm_salary" type="number" min="0" step="0.01" value={trainerModalForm.salary} onChange={(e) => handleTrainerModalInput('salary', e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="tm_level">Trainer Level</Label>
              <select
                id="tm_level"
                className="px-3 py-2 border rounded-md w-full"
                value={trainerModalForm.level}
                onChange={(e) => handleTrainerModalInput('level', e.target.value)}
              >
                <option value="1">Level 1</option>
                <option value="2">Level 2</option>
                <option value="3">Level 3</option>
                <option value="4">Level 4</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={handleSendTrainerPasswordReset}>Send password reset</Button>
              <p className="text-xs text-gray-500">Emails the trainer a reset link using Supabase Auth.</p>
            </div>

            {trainerModalMonthOptions.length > 0 && trainerModalChartData ? (
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <Label htmlFor="tm_month_filter">Session Breakdown</Label>
                    <p className="text-xs text-gray-500">First half (1-15) vs second half (16-end) of the month.</p>
                  </div>
                  <select
                    id="tm_month_filter"
                    className="px-3 py-2 border rounded-md md:w-48"
                    value={trainerModalSelectedMonth}
                    onChange={(e) => {
                      const key = e.target.value
                      setTrainerModalSelectedMonth(key)
                      const payload = trainerModalCharts[key]
                      if (payload) {
                        setTrainerModalChartData({
                          firstHalf: buildPieChartData(payload.firstHalf),
                          secondHalf: buildPieChartData(payload.secondHalf),
                          totalSessions: payload.total,
                        })
                      }
                    }}
                  >
                    {trainerModalMonthOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <p className="font-medium text-sm mb-2">Days 1-15</p>
                    {trainerModalChartData.firstHalf.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={trainerModalChartData.firstHalf} dataKey="value" nameKey="name" outerRadius={80}>
                              {trainerModalChartData.firstHalf.map((entry, index) => (
                                <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number, name: string, { payload }: { payload: SessionSlice }) => [
                                `${value} sessions (${payload.percentage}% )`,
                                name,
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-3 space-y-1 text-sm">
                          {trainerModalChartData.firstHalf.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm"
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              <span>{entry.name} — {entry.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No sessions recorded.</p>
                    )}
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="font-medium text-sm mb-2">Days 16-end</p>
                    {trainerModalChartData.secondHalf.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={trainerModalChartData.secondHalf} dataKey="value" nameKey="name" outerRadius={80}>
                              {trainerModalChartData.secondHalf.map((entry, index) => (
                                <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number, name: string, props: any) => [`${value} sessions (${props.payload.percentage}% )`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-3 space-y-1 text-sm">
                          {trainerModalChartData.secondHalf.map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm"
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              <span>{entry.name} — {entry.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">No sessions recorded.</p>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  Total sessions for selected month: <span className="font-semibold">{trainerModalChartData.totalSessions}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-gray-50 border border-dashed rounded-md p-3">
                Session breakdown unavailable. Add sessions for this trainer to see charts.
              </div>
            )}

            <div>
              <Label>Active Clients</Label>
              {trainerModalClients.length > 0 ? (
                <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {trainerModalClients.map((client) => (
                    <li key={client.id} className="border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{client.name}</p>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {client.sessionCount} {client.sessionCount === 1 ? 'session' : 'sessions'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{client.email ?? 'No email provided'}</p>
                      {client.phone && <p className="text-xs text-gray-500">{client.phone}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No active clients assigned.</p>
              )}
            </div>

              </>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={closeTrainerModal} disabled={trainerModalSaving}>Close</Button>
            <Button onClick={handleSaveTrainerModal} disabled={trainerModalSaving}>{trainerModalSaving ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </Layout>
  )
}
