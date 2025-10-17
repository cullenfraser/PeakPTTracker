// @ts-nocheck
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
  DollarSign,
  TrendingUp,
  CheckCircle,
  XCircle,
  Download,
  BarChart3
} from 'lucide-react'

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
  payment_amount?: number | null
  trainers?:
    | {
        first_name: string | null
        last_name: string | null
      }
    | Array<{
        first_name: string | null
        last_name: string | null
      }>
    | null
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
  trainerName?: string | null
  contractIds: string[]
  contractNumbers: string[]
  remainingSessions?: number
}

const STATUS_PRIORITY: Record<string, number> = {
  active: 3,
  pending: 2,
  completed: 1,
  cancelled: 0,
}

const getStatusPriority = (value?: string | null) => {
  if (!value) return -1
  return STATUS_PRIORITY[value.toLowerCase()] ?? -1
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

const getTrainerName = (contract: ContractRecord) => {
  const trainer = Array.isArray(contract.trainers) ? contract.trainers[0] : contract.trainers
  if (!trainer) return null
  const first = trainer.first_name?.trim() ?? ''
  const last = trainer.last_name?.trim() ?? ''
  const combined = `${first} ${last}`.trim()
  return combined.length > 0 ? combined : null
}

const normalizeContractStatus = (
  contract: ContractRecord,
  totalSessions: number,
  completedSessions: number,
): string | null => {
  const raw = (contract.status ?? '').toLowerCase()

  if (['cancelled', 'expired'].includes(raw)) {
    return 'closed'
  }

  if (raw === 'completed' || (totalSessions > 0 && completedSessions >= totalSessions)) {
    return 'completed'
  }

  if (completedSessions > 0) {
    return 'active'
  }

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
    const trainerName = getTrainerName(contract)
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

      const incomingPriority = getStatusPriority(status)
      const existingPriority = getStatusPriority(existing.status)
      if (incomingPriority > existingPriority) {
        existing.status = status
      }
      if (contract.customer_name && !existing.name) existing.name = contract.customer_name
      if (contract.customer_email && !existing.email) existing.email = contract.customer_email
      if (contract.customer_phone && !existing.phone) existing.phone = contract.customer_phone
      if (trainerName) {
        if (!existing.trainerName || existing.trainerName === 'Multiple') {
          existing.trainerName = trainerName
        } else if (existing.trainerName !== trainerName) {
          existing.trainerName = 'Multiple'
        }
      }
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
        trainerName,
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

  return Array.from(map.values()).sort((a, b) => {
    const aDate = pickLatest(a.latestCreated, a.latestStartDate)
    const bDate = pickLatest(b.latestCreated, b.latestStartDate)
    if (!aDate && !bDate) return 0
    if (!bDate) return -1
    if (!aDate) return 1
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
}

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
  const [, setLoading] = useState(true)

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
        .select('*, trainers(first_name, last_name)')

      const contractRows = (contracts ?? []) as unknown as ContractRecord[]

      const totalSessionsByContract = new Map<string, number>()
      for (const contract of contractRows) {
        if (!contract?.id) continue
        totalSessionsByContract.set(contract.id, contract.total_sessions ?? 0)
      }

      const completedByContract = new Map<string, number>()
      const contractIds = contractRows.map((contract) => contract.id).filter((id) => typeof id === 'string' && id.length > 0)

      if (contractIds.length > 0) {
        const { data: sessionRows } = await supabase
          .from('training_sessions')
          .select('contract_id, status')
          .in('contract_id', contractIds)

        for (const session of (sessionRows ?? []) as Array<{ contract_id: string | null; status: string | null }>) {
          if (!session?.contract_id) continue
          if ((session.status ?? '').toLowerCase() !== 'completed') continue
          completedByContract.set(
            session.contract_id,
            (completedByContract.get(session.contract_id) ?? 0) + 1,
          )
        }
      }

      const aggregatedClients = aggregateClients(contractRows, completedByContract, totalSessionsByContract)
      const ACTIVE_STATUSES = new Set(['active', 'expiring soon'])
      const activeClientCount = aggregatedClients.filter((client) =>
        ACTIVE_STATUSES.has((client.status ?? '').toLowerCase()),
      ).length
      const totalClientCount = aggregatedClients.length

      const activeContracts = contractRows.filter((c) => (c.status ?? '').toLowerCase() === 'active')

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
        totalClients: totalClientCount,
        activeClients: activeClientCount,
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

      // Build aggregated client groups (matching Clients page grouping) and trainer names per group
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, customer_name, customer_email, customer_phone, total_sessions, status, created_at, start_date, end_date, trainer_id, trainers(first_name, last_name)')

      const baseRows = (contracts ?? []) as Array<{
        id: string
        customer_name: string | null
        customer_email: string | null
        customer_phone: string | null
        total_sessions: number | null
        status: string | null
        created_at: string | null
        start_date: string | null
        end_date: string | null
        trainer_id?: string | null
        trainers?: { first_name?: string | null; last_name?: string | null } | null
      }>
      const contractIds = baseRows.map(r => r.id)

      const getPrimaryTrainerName = (row: any) => {
        const t = row?.trainers ?? null
        const first = (t?.first_name ?? '').trim()
        const last = (t?.last_name ?? '').trim()
        const label = `${first} ${last}`.trim()
        return label.length > 0 ? label : null
      }

      const { data: participantRows } = await supabase
        .from('participant_contracts')
        .select('contract_id, participant_email')
        .in('contract_id', contractIds)

      const augmented = [...baseRows]
      for (const p of (participantRows ?? [])) {
        const parent = baseRows.find(b => b.id === p.contract_id)
        if (!parent) continue
        const email = (p.participant_email ?? '').trim()
        if (!email) continue
        augmented.push({
          ...parent,
          customer_email: email,
        })
      }

      const emailPairs = augmented.reduce<{ raw: string; normalized: string }[]>((acc, row) => {
        const raw = (row.customer_email ?? '').trim()
        if (!raw) return acc
        acc.push({ raw, normalized: normalizeEmail(raw) ?? raw.toLowerCase() })
        return acc
      }, [])

      const rawEmails = Array.from(new Set(emailPairs.map((p) => p.raw)))

      const trainerAssignmentsByEmail = new Map<string, string[]>()
      const trainerIdsByEmail = new Map<string, string[]>()
      if (rawEmails.length > 0) {
        const { data: clientAssigns } = await supabase
          .from('clients')
          .select('email, client_trainer_assignments(trainer_id, trainers(first_name, last_name), unassigned_date)')
          .in('email', rawEmails)

        clientAssigns?.forEach((client: any) => {
          const nEmail = normalizeEmail(client?.email)
          if (!nEmail) return
          const assigns = (Array.isArray(client?.client_trainer_assignments) ? client.client_trainer_assignments : [])
          const ids = assigns
            .filter((a: any) => !a?.unassigned_date && a?.trainer_id)
            .map((a: any) => a.trainer_id as string)
          if (ids.length > 0) trainerIdsByEmail.set(nEmail, Array.from(new Set(ids)))
          const names = assigns
            .filter((a: any) => !a?.unassigned_date)
            .map((a: any) => {
              const t = Array.isArray(a.trainers) ? a.trainers[0] : a.trainers
              const first = (t?.first_name ?? '').trim()
              const last = (t?.last_name ?? '').trim()
              const label = `${first} ${last}`.trim()
              return label.length > 0 ? label : null
            })
            .filter((v: any): v is string => Boolean(v))
          if (names.length > 0) trainerAssignmentsByEmail.set(nEmail, Array.from(new Set(names)))
        })
      }

      // Build per-contract totals and completed counts
      const totalSessionsByContract = new Map<string, number>()
      baseRows.forEach((r) => totalSessionsByContract.set(r.id, r.total_sessions ?? 0))

      const { data: sess } = await supabase
        .from('training_sessions')
        .select('contract_id, status')
        .in('contract_id', contractIds)

      const completedByContract = new Map<string, number>()
      for (const s of (sess ?? []) as Array<{ contract_id: string; status: string }>) {
        if ((s.status || '').toLowerCase() === 'completed') {
          completedByContract.set(s.contract_id, (completedByContract.get(s.contract_id) ?? 0) + 1)
        }
      }

      const groups = new Map<string, { trainerNames: string[]; trainerIds: Set<string>; contractIds: Set<string> }>()
      augmented.forEach((row) => {
        const key = normalizeEmail(row.customer_email) ?? `${row.customer_name}|${row.customer_phone ?? row.id}`
        const existing = groups.get(key) ?? { trainerNames: [], trainerIds: new Set<string>(), contractIds: new Set<string>() }
        const primary = getPrimaryTrainerName(row)
        const email = normalizeEmail(row.customer_email)
        const emailNames = email ? (trainerAssignmentsByEmail.get(email) ?? []) : []
        const emailIds = email ? (trainerIdsByEmail.get(email) ?? []) : []
        const merged = new Set<string>([...existing.trainerNames, ...(primary ? [primary] : []), ...emailNames])
        emailIds.forEach((tid) => existing.trainerIds.add(tid))
        if (row.trainer_id) existing.trainerIds.add(row.trainer_id)
        existing.contractIds.add(row.id)
        groups.set(key, { trainerNames: Array.from(merged), trainerIds: existing.trainerIds, contractIds: existing.contractIds })
      })

      const trainerIdToName = new Map<string, string>(
        trainers.map((t: any) => [t.id, `${(t.first_name ?? '').trim()} ${(t.last_name ?? '').trim()}`.trim()])
      )

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
          ['cancelled', 'late_cancellation', 'no_show'].includes(s.status || '')
        ).length || 0
        const total = sessions?.length || 0

        const completionRate = total > 0 ? (completed / total) * 100 : 0
        let clientCount = 0
        {
          const isActiveGroup = (g: { contractIds: Set<string> }) => {
            let remaining = 0
            for (const id of g.contractIds) {
              const total = totalSessionsByContract.get(id) ?? 0
              if (total <= 0) continue
              const done = completedByContract.get(id) ?? 0
              remaining += Math.max(0, total - done)
            }
            if (remaining === 0) return false
            // Active or Expiring Soon
            return true
          }
          groups.forEach((value) => {
            const matchesById = value.trainerIds.has(trainer.id)
            const matchesByName = (trainerIdToName.get(trainer.id) ?? '') && value.trainerNames.includes(trainerIdToName.get(trainer.id)!)
            if (matchesById || matchesByName) clientCount += 1
          })
        }

        trainerPerformance.push({
          id: trainer.id,
          name: `${trainer.first_name} ${trainer.last_name}`,
          totalSessions: total,
          completedSessions: completed,
          cancelledSessions: cancelled,
          activeClients: clientCount,
          completionRate,
          revenue: 0,
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
