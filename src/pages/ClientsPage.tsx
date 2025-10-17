import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Users, Search, Download, Loader2, FileText, ExternalLink } from 'lucide-react'

const CONTRACT_PDF_BUCKET = import.meta.env.VITE_SUPABASE_CONTRACT_BUCKET ?? 'contract-pdfs'

interface ContractRecord {
  id: string
  contract_number: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  status: string | null
  total_sessions: number | null
  frequency: string | null
  package_length: number | null
  price_per_session: number | null
  start_date: string | null
  end_date: string | null
  created_at: string | null
  total_amount: number | null
  payment_schedule: string | null
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
  trainerNames: string[]
  contractIds: string[]
  contractNumbers: string[]
  remainingSessions?: number
  latestFrequency?: string | null
  latestPackageLength?: number | null
  latestPricePerSession?: number | null
}

interface ContractDetail {
  id: string
  contractNumber: string
  status: string | null
  startDate: string | null
  endDate: string | null
  totalAmount: number | null
  paymentSchedule: string | null
  signedStatus: string
  signedDate: string | null
  pdfLinks: { label: string; url: string }[]
}

interface InvoiceDetail {
  id: string
  dueDate: string
  status: string
  total: number
  contractNumber: string
  publicUrl: string | null
  scheduledAt: string | null
  squareInvoiceId: string | null
  squareInvoiceNumber: string | null
}

interface ClientDetailData {
  contracts: ContractDetail[]
  invoices: InvoiceDetail[]
  clientId?: string | null
  trainers?: Array<{ trainer_id: string; name: string }>
  splits?: Array<{ trainer_id: string; name: string; allocated_sessions: number }>
  trainerSessions?: Record<string, number>
}

const ADHERENCE_RANGES = [
  { key: '30d', label: 'Last 30 Days', type: 'days' as const, value: 30 },
  { key: '3m', label: 'Last 3 Months', type: 'months' as const, value: 3 },
  { key: '6m', label: 'Last 6 Months', type: 'months' as const, value: 6 },
  { key: '1y', label: 'Last 1 Year', type: 'months' as const, value: 12 },
  { key: 'all', label: 'All-time', type: 'all' as const, value: null },
] as const

type AdherenceRangeKey = (typeof ADHERENCE_RANGES)[number]['key']

type AdherenceStats = Record<
  AdherenceRangeKey,
  {
    booked: number
    attended: number
    noShows: number
    lateCancels: number
    rate: number | null
  }
>

type EngagementMetrics = {
  firstAttended: Date | null
  lastAttended: Date | null
  currentStreakDays: number
  longestStreakDays: number
  currentStreakStart: Date | null
  currentStreakEnd: Date | null
  longestStreakStart: Date | null
  longestStreakEnd: Date | null
  totalAttended: number
  best30DayAttendance: {
    count: number
    windowStart: Date | null
    windowEnd: Date | null
  }
}

const subtractMonths = (anchor: Date, months: number) => {
  const copy = new Date(anchor)
  copy.setMonth(copy.getMonth() - months)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const subtractDays = (anchor: Date, days: number) => {
  const copy = new Date(anchor)
  copy.setDate(copy.getDate() - days)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const formatPercentage = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}

const formatDateRange = (start?: Date | null, end?: Date | null) => {
  if (!start || !end) return '—'
  const startText = formatDateDisplay(start.toISOString())
  const endText = formatDateDisplay(end.toISOString())
  return startText === endText ? startText : `${startText} – ${endText}`
}

const computeAdherenceStatsForSessions = (
  sessions: Array<{ session_date?: string | null; status?: string | null; attendance_data?: any }>,
): { adherence: AdherenceStats; engagement: EngagementMetrics } => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const result = {} as AdherenceStats
  const boundaries = new Map<AdherenceRangeKey, Date | null>()

  ADHERENCE_RANGES.forEach((range) => {
    result[range.key] = { booked: 0, attended: 0, noShows: 0, lateCancels: 0, rate: null }
    if (range.type === 'all') {
      boundaries.set(range.key, null)
    } else if (range.type === 'days') {
      boundaries.set(range.key, subtractDays(now, range.value ?? 0))
    } else {
      boundaries.set(range.key, subtractMonths(now, range.value ?? 0))
    }
  })

  const normalized = sessions
    .map((session) => {
      const status = (session.status ?? '').toLowerCase()
      const dateRaw = session.session_date ?? null
      if (typeof dateRaw !== 'string' || dateRaw.length === 0) {
        return null
      }
      const date = new Date(dateRaw)
      if (Number.isNaN(date.getTime())) {
        return null
      }
      date.setHours(0, 0, 0, 0)
      const attendanceRaw = session.attendance_data as Record<string, unknown> | null
      const attendance = attendanceRaw && typeof attendanceRaw === 'object' ? attendanceRaw : {}
      const hasPresent = Object.values(attendance).some(
        (value) => typeof value === 'string' && value.toLowerCase() === 'present',
      )
      const attended = hasPresent || status === 'completed'
      const lateCancels = status === 'late_cancellation'
      const noShow = status === 'no_show'
      return {
        date,
        status,
        attended,
        lateCancels,
        noShow,
      }
    })
    .filter((value): value is { date: Date; status: string; attended: boolean; lateCancels: boolean; noShow: boolean } =>
      value !== null,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let firstAttended: Date | null = null
  let lastAttended: Date | null = null
  let ongoingStreakCount = 0
  let ongoingStreakStart: Date | null = null
  let ongoingStreakEnd: Date | null = null
  let bestStreakCount = 0
  let bestStreakStart: Date | null = null
  let bestStreakEnd: Date | null = null
  let totalAttended = 0

  for (const session of normalized) {
    if (session.date > now) continue
    if (session.status === 'cancelled') continue

    for (const range of ADHERENCE_RANGES) {
      const boundary = boundaries.get(range.key)
      if (boundary && session.date < boundary) {
        continue
      }

      const stats = result[range.key]
      stats.booked += 1
      if (session.attended) stats.attended += 1
      if (session.noShow) stats.noShows += 1
      if (session.lateCancels) stats.lateCancels += 1
    }

    if (session.attended) {
      if (!firstAttended) firstAttended = session.date
      lastAttended = session.date
      totalAttended += 1

      if (ongoingStreakCount === 0) {
        ongoingStreakStart = session.date
      }
      ongoingStreakCount += 1
      ongoingStreakEnd = session.date

      if (ongoingStreakCount > bestStreakCount) {
        bestStreakCount = ongoingStreakCount
        bestStreakStart = ongoingStreakStart
        bestStreakEnd = ongoingStreakEnd
      }
    } else if (session.noShow || session.lateCancels) {
      ongoingStreakCount = 0
      ongoingStreakStart = null
      ongoingStreakEnd = null
    }
  }

  const currentStreakDays = ongoingStreakCount
  const currentStreakStart = ongoingStreakCount > 0 ? ongoingStreakStart : null
  const currentStreakEnd = ongoingStreakCount > 0 ? ongoingStreakEnd : null
  const longestStreakDays = bestStreakCount

  ADHERENCE_RANGES.forEach((range) => {
    const stats = result[range.key]
    stats.rate = stats.booked > 0 ? stats.attended / stats.booked : null
  })

  let bestWindowCount = 0
  let bestWindowStart: Date | null = null
  let bestWindowEnd: Date | null = null
  const attendedDates = normalized.filter((session) => session.attended).map((session) => session.date)
  let left = 0
  for (let right = 0; right < attendedDates.length; right += 1) {
    const rightDate = attendedDates[right]
    const windowStartCandidate = new Date(rightDate)
    windowStartCandidate.setDate(windowStartCandidate.getDate() - 29)
    while (left <= right && attendedDates[left] < windowStartCandidate) {
      left += 1
    }
    const count = right - left + 1
    if (count > bestWindowCount) {
      bestWindowCount = count
      bestWindowStart = attendedDates[left]
      bestWindowEnd = rightDate
    }
  }

  return {
    adherence: result,
    engagement: {
      firstAttended,
      lastAttended,
      currentStreakDays,
      currentStreakStart,
      currentStreakEnd,
      longestStreakDays,
      longestStreakStart: bestStreakStart,
      longestStreakEnd: bestStreakEnd,
      totalAttended,
      best30DayAttendance: {
        count: bestWindowCount,
        windowStart: bestWindowStart,
        windowEnd: bestWindowEnd,
      },
    },
  }
}

const FUNCTIONS_BASE = (() => {
  const configured = (import.meta.env.VITE_NETLIFY_FUNCTIONS_BASE as string | undefined)?.trim()
  if (configured && configured.length > 0) return configured.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://localhost:8888'
  return ''
})()

const withFunctionsBase = (path: string) => (FUNCTIONS_BASE ? `${FUNCTIONS_BASE}${path}` : path)

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

const FREQUENCY_LABELS: Record<string, string> = {
  once_month: 'Once / Month',
  bi_weekly: 'Every 2 Weeks',
  once_week: 'Once / Week',
  twice_week: 'Twice / Week',
  three_week: 'Three / Week',
  four_week: 'Four / Week',
  five_week: 'Five / Week',
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
  trainerAssignmentsByClient: Map<string, string[]>,
  contractClientIdMap: Map<string, string | null>,
  clientIdByKey: Map<string, string | null>,
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
    const normalizedEmail = normalizeEmail(contract.customer_email)
    const key = normalizedEmail ?? `${contract.customer_name}|${contract.customer_phone ?? contract.id}`
    const trainerName = getTrainerName(contract)
    const contractClientId = contractClientIdMap.get(contract.id) ?? null
    const aggregateClientId = clientIdByKey.get(key) ?? contractClientId ?? null
    const clientAssignments = aggregateClientId ? trainerAssignmentsByClient.get(aggregateClientId) ?? [] : []
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
        existing.latestFrequency = contract.frequency ?? existing.latestFrequency ?? null
        existing.latestPackageLength = contract.package_length ?? existing.latestPackageLength ?? null
        existing.latestPricePerSession = contract.price_per_session ?? existing.latestPricePerSession ?? null
      }

      const incomingPriority = getStatusPriority(status)
      const existingPriority = getStatusPriority(existing.status)
      if (incomingPriority > existingPriority) {
        existing.status = status
      }
      if (contract.customer_name && !existing.name) existing.name = contract.customer_name
      if (contract.customer_email && !existing.email) existing.email = contract.customer_email
      if (contract.customer_phone && !existing.phone) existing.phone = contract.customer_phone
      const candidateNames = [trainerName, ...clientAssignments].filter((value): value is string => Boolean(value))
      candidateNames.forEach((name) => {
        if (!existing.trainerNames.includes(name)) {
          existing.trainerNames.push(name)
        }
      })
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
        trainerNames: [...new Set([trainerName, ...clientAssignments].filter((value): value is string => Boolean(value)))],
        contractIds: [contract.id],
        contractNumbers: [contractNumber],
        latestFrequency: contract.frequency ?? null,
        latestPackageLength: contract.package_length ?? null,
        latestPricePerSession: contract.price_per_session ?? null,
      })
    }
  })

  // After aggregation, compute remaining sessions per client and assign status buckets
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

const formatStatusLabel = (status?: string | null) => {
  if (!status) return 'Unknown'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const getStatusBadgeColor = (status?: string | null) => {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
      return 'bg-green-100 text-green-800'
    case 'expiring soon':
      return 'bg-amber-100 text-amber-800'
    case 'expired':
      return 'bg-red-100 text-red-800'
    case 'completed':
      return 'bg-blue-100 text-blue-800'
    case 'cancelled':
      return 'bg-red-100 text-red-800'
    case 'closed':
      return 'bg-slate-200 text-slate-700'
    case 'pending':
      return 'bg-amber-100 text-amber-800'
    case 'draft':
      return 'bg-slate-100 text-slate-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const formatDateDisplay = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

const formatFrequencyLabel = (value?: string | null) => {
  if (!value) return '—'
  return FREQUENCY_LABELS[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatPackageLength = (value?: number | null) => {
  if (!value || value <= 0) return '—'
  switch (value) {
    case 1:
      return 'Month to Month'
    case 2:
      return '2 Months'
    case 3:
      return '3 Months'
    default:
      return `${value} Months`
  }
}

const buildSignedStatus = (participants: any[]) => {
  if (participants.length === 0) return { label: 'No contracts', latestSigned: null }
  const signedParticipants = participants.filter((p) => !!p.signed_date)
  const latestSigned = signedParticipants.reduce<string | null>((latest, participant) => {
    return pickLatest(latest, participant.signed_date ?? null)
  }, null)
  if (signedParticipants.length === participants.length) {
    return { label: 'Signed', latestSigned }
  }
  if (signedParticipants.length > 0) {
    return { label: 'Partially Signed', latestSigned }
  }
  return { label: 'Pending Signature', latestSigned }
}

const getInvoiceStatusDisplay = (invoice: InvoiceDetail) => {
  const lowerStatus = invoice.status?.toLowerCase() ?? ''
  const hasSquareInvoice = Boolean(invoice.squareInvoiceId || invoice.publicUrl)

  if (!hasSquareInvoice) {
    return { label: 'Incomplete', badgeClass: 'bg-slate-100 text-slate-800' }
  }

  const paidStatuses = new Set(['paid', 'completed', 'complete'])
  if (paidStatuses.has(lowerStatus)) {
    return { label: 'Paid', badgeClass: 'bg-green-100 text-green-800' }
  }

  const sentTimestamp = invoice.scheduledAt ? Date.parse(invoice.scheduledAt) : Number.NaN
  const dueTimestamp = invoice.dueDate ? Date.parse(invoice.dueDate) : Number.NaN
  const baseTimestamp = Number.isNaN(sentTimestamp) ? dueTimestamp : sentTimestamp
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
  const nowMs = Date.now()
  const isOverdueByTime = !Number.isNaN(baseTimestamp) && nowMs - baseTimestamp >= fourteenDaysMs

  if (lowerStatus === 'overdue' || (isOverdueByTime && !paidStatuses.has(lowerStatus))) {
    return { label: 'Overdue', badgeClass: 'bg-red-100 text-red-800' }
  }

  const sentStatuses = new Set(['sent', 'scheduled'])
  if (sentStatuses.has(lowerStatus) || !Number.isNaN(sentTimestamp)) {
    return { label: 'Sent', badgeClass: 'bg-green-100 text-green-800' }
  }

  if (lowerStatus === 'unpaid') {
    return { label: 'Unpaid', badgeClass: 'bg-amber-100 text-amber-800' }
  }

  return {
    label: formatStatusLabel(invoice.status),
    badgeClass: getStatusBadgeColor(invoice.status),
  }
}

export default function ClientsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [clients, setClients] = useState<AggregatedClient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<AggregatedClient | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<ClientDetailData | null>(null)
  const [adherenceStats, setAdherenceStats] = useState<AdherenceStats | null>(null)
  const [adherenceRange, setAdherenceRange] = useState<AdherenceRangeKey>('30d')
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null)
  const selectedClientRef = useRef<AggregatedClient | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showPayNowModal, setShowPayNowModal] = useState(false)
  const [payNowInvoice, setPayNowInvoice] = useState<InvoiceDetail | null>(null)
  const [trainerOptions, setTrainerOptions] = useState<Array<{ id: string; name: string }>>([])
  const [assignRows, setAssignRows] = useState<Array<{ trainerId: string; sessions: number }>>([{ trainerId: '', sessions: 0 }])
  const [updateCalendarNow, setUpdateCalendarNow] = useState(false)

  const currentAdherence = useMemo(() => {
    if (!adherenceStats) return null
    return adherenceStats[adherenceRange] ?? null
  }, [adherenceStats, adherenceRange])

  const adherenceRangeLabel = useMemo(() => {
    return ADHERENCE_RANGES.find((range) => range.key === adherenceRange)?.label ?? ''
  }, [adherenceRange])

  useEffect(() => {
    checkAdminStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const filteredClients = useMemo(() => {
    let list = [...clients]

    if (searchTerm.trim()) {
      const needle = searchTerm.trim().toLowerCase()
      list = list.filter((client) => {
        const inName = client.name?.toLowerCase().includes(needle) ?? false
        const inEmail = client.email?.toLowerCase().includes(needle) ?? false
        const inPhone = client.phone?.includes(searchTerm) ?? false
        const inContracts = client.contractNumbers.some((number) => number.toLowerCase().includes(needle))
        return inName || inEmail || inPhone || inContracts
      })
    }

    if (statusFilter !== 'all') {
      list = list.filter((client) => (client.status ?? '').toLowerCase() === statusFilter)
    }

    return list
  }, [clients, searchTerm, statusFilter])

  const checkAdminStatus = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (error) throw error

      if (adminData && adminData.length > 0) {
        setIsAdmin(true)
        await fetchClients()
      } else {
        setIsAdmin(false)
        await fetchTrainerClients()
      }
    } catch (error) {
      console.error('Error loading clients:', error)
      toast({
        title: 'Error',
        description: 'Unable to load clients. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchClients = async (trainerId?: string) => {
    let query = supabase
      .from('contracts')
      .select('*, trainers(first_name, last_name)')
      .order('created_at', { ascending: false })

    if (trainerId) {
      query = query.eq('trainer_id', trainerId)
    }

    const { data, error } = await query
    if (error) throw error

    const baseRows = ((data ?? []) as unknown as ContractRecord[])
    const contractMap = new Map<string, ContractRecord>()
    baseRows.forEach(row => contractMap.set(row.id, row))
    const contractIds = baseRows.map(row => row.id)

    const contractClientIdMap = new Map<string, string | null>()
    baseRows.forEach((row) => {
      contractClientIdMap.set(row.id, null)
    })

    // Build map of total sessions per contract
    const totalSessionsByContract = new Map<string, number>()
    baseRows.forEach(row => totalSessionsByContract.set(row.id, row.total_sessions ?? 0))

    // Fetch participants for these contracts and project them into ContractRecord-like rows
    const { data: participantRows, error: pErr } = await supabase
      .from('participant_contracts')
      .select('id, participant_email, participant_name, participant_phone, contract_id')
      .in('contract_id', contractIds)

    if (pErr) throw pErr

    const augmented: ContractRecord[] = [...baseRows]
    for (const p of participantRows ?? []) {
      const base = contractMap.get(p.contract_id as string)
      if (!base) continue

      const email = (p.participant_email ?? '').trim()
      const name = (p.participant_name ?? base.customer_name) as string
      const phone = (p.participant_phone ?? base.customer_phone) as string | null

      // Only add if we have some identity info
      if (!email && !name && !phone) continue

      const augmentedRow: ContractRecord = {
        ...base,
        customer_email: email || null,
        customer_name: name,
        customer_phone: phone,
      }
      augmented.push(augmentedRow)
    }

    // Fetch completed sessions per contract to compute remaining
    const { data: sess, error: sessErr } = await supabase
      .from('training_sessions')
      .select('contract_id, status')
      .in('contract_id', contractIds)
    if (sessErr) throw sessErr
    const completedByContract = new Map<string, number>()
    for (const s of (sess ?? []) as Array<{ contract_id: string; status: string }>) {
      if ((s.status || '').toLowerCase() !== 'completed') continue
      completedByContract.set(s.contract_id, (completedByContract.get(s.contract_id) ?? 0) + 1)
    }

    const trainerAssignmentsByClient = new Map<string, string[]>()
    const clientTrainerIds = new Map<string, Set<string>>()
    const trainerIdToName = new Map<string, string>()
    const pendingTrainerIds = new Set<string>()
    const clientIdByKey = new Map<string, string | null>()
    const clientIdByEmail = new Map<string, string>()

    const emailPairs = augmented.reduce<{ raw: string; normalized: string }[]>((acc, row) => {
      const raw = (row.customer_email ?? '').trim()
      if (!raw) return acc
      acc.push({ raw, normalized: normalizeEmail(raw) ?? raw.toLowerCase() })
      return acc
    }, [])

    const emailsToLookup = Array.from(new Set(emailPairs.map((pair) => pair.raw)))

    if (emailsToLookup.length > 0) {
      try {
        const { data: clientAssignments, error: clientAssignmentsError } = await supabase
          .from('clients')
          .select('id, email, client_trainer_assignments(trainer_id, trainers(first_name, last_name), unassigned_date)')
          .in('email', emailsToLookup)

        if (clientAssignmentsError) throw clientAssignmentsError

        clientAssignments?.forEach((client: any) => {
          const clientId = client?.id ?? null
          const rawEmail = (client?.email ?? '').trim()
          const normalizedEmail = normalizeEmail(rawEmail)
          if (!clientId || !normalizedEmail) return

          const assignments: any[] = Array.isArray(client?.client_trainer_assignments)
            ? client.client_trainer_assignments
            : []

          assignments.forEach((assignment) => {
            if (!assignment || assignment.unassigned_date) return
            const trainerData = Array.isArray(assignment.trainers) ? assignment.trainers[0] : assignment.trainers
            const first = (trainerData?.first_name ?? '').trim()
            const last = (trainerData?.last_name ?? '').trim()
            const label = `${first} ${last}`.trim()
            if (assignment.trainer_id) {
              const idSet = clientTrainerIds.get(clientId) ?? new Set<string>()
              idSet.add(assignment.trainer_id)
              clientTrainerIds.set(clientId, idSet)
              if (label) {
                trainerIdToName.set(assignment.trainer_id, label)
              } else {
                pendingTrainerIds.add(assignment.trainer_id)
              }
            }
          })

          clientIdByEmail.set(normalizedEmail, clientId)
        })

        if (pendingTrainerIds.size > 0) {
          const { data: pendingTrainers, error: pendingError } = await supabase
            .from('trainers')
            .select('id, first_name, last_name')
            .in('id', Array.from(pendingTrainerIds))

          if (!pendingError) {
            pendingTrainers?.forEach((row: any) => {
              const first = (row?.first_name ?? '').trim()
              const last = (row?.last_name ?? '').trim()
              const label = `${first} ${last}`.trim()
              if (label && row?.id) trainerIdToName.set(row.id, label)
            })
          }
        }
      } catch (error: any) {
        console.warn('Client trainer assignments lookup failed:', error?.message ?? error)
      }
    }

    clientTrainerIds.forEach((ids, clientId) => {
      const names = Array.from(ids)
        .map((id) => trainerIdToName.get(id) ?? 'Trainer')
        .filter((value) => Boolean(value))
      if (names.length > 0) {
        trainerAssignmentsByClient.set(clientId, Array.from(new Set(names)))
      }
    })

    augmented.forEach((row) => {
      const normalizedEmail = normalizeEmail(row.customer_email)
      const key = normalizedEmail ?? `${row.customer_name}|${row.customer_phone ?? row.id}`
      const clientId = normalizedEmail ? clientIdByEmail.get(normalizedEmail) ?? null : null
      clientIdByKey.set(key, clientId ?? null)
      if ((contractClientIdMap.get(row.id) ?? null) === null && clientId) {
        contractClientIdMap.set(row.id, clientId)
      }
    })

    const aggregated = aggregateClients(augmented, completedByContract, totalSessionsByContract, trainerAssignmentsByClient, contractClientIdMap, clientIdByKey)
    setClients(aggregated)
  }

  const fetchTrainerClients = async () => {
    if (!user) return

    const { data: trainer, error } = await supabase
      .from('trainers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!trainer?.id) {
      setClients([])
      return
    }

    await fetchClients(trainer.id)
  }

  const exportToCSV = () => {
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Status',
      'Frequency',
      'Package Length',
      'Session Rate',
      'Total Sessions',
      'Latest Start',
      'Latest End',
    ]
    if (isAdmin) headers.push('Trainer')

    const rows = filteredClients.map((client) => [
      client.name ?? '',
      client.email ?? '',
      client.phone ?? '',
      formatStatusLabel(client.status),
      formatFrequencyLabel(client.latestFrequency),
      formatPackageLength(client.latestPackageLength),
      client.latestPricePerSession != null ? formatCurrency(client.latestPricePerSession) : '—',
      String(client.totalSessions),
      client.latestStartDate ? formatDateDisplay(client.latestStartDate) : '',
      client.latestEndDate ? formatDateDisplay(client.latestEndDate) : '',
      ...(isAdmin ? [client.trainerNames.length ? client.trainerNames.join(' / ') : ''] : []),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const loadClientDetail = useCallback(async (client: AggregatedClient) => {
    setDetailLoading(true)
    const resetEditState = () => {
      /* no-op: legacy edit UI removed */
    }
    resetEditState()
    setDetailError(null)
    setDetailData(null)
    setAdherenceStats(null)
    setAdherenceRange('30d')
    setEngagementMetrics(null)

    try {
      const participantSelect = 'participant_contracts(*), contract_invoice_instances(*)'

      const { data: directContracts, error: directError } = await supabase
        .from('contracts')
        .select(`*, trainers(id, first_name, last_name), ${participantSelect}`)
        .order('created_at', { ascending: false })
        .match(
          client.email
            ? { customer_email: client.email }
            : client.phone
            ? { customer_phone: client.phone }
            : client.name
            ? { customer_name: client.name }
            : {},
        )

      if (directError) throw directError

      let dataRows = directContracts ?? []

      // If this client entry came from a participant (email exists but not on the contract row),
      // do a fallback query that joins participant_contracts by email to find their contracts.
      if (client.email) {
        const { data: participantContracts, error: participantError } = await supabase
          .from('contracts')
          .select(`*, trainers(id, first_name, last_name), participant_contracts!inner(*), contract_invoice_instances(*)`)
          .order('created_at', { ascending: false })
          .eq('participant_contracts.participant_email', client.email)

        if (participantError) throw participantError

        if (participantContracts && participantContracts.length > 0) {
          const merged = new Map<string, any>()
          ;[...dataRows, ...participantContracts].forEach((row: any) => {
            if (row?.id) {
              merged.set(row.id, row)
            }
          })
          dataRows = Array.from(merged.values())
        }
      }

      const contractIds = (dataRows ?? []).map((row: any) => row.id).filter((id: any) => typeof id === 'string' && id.length > 0)

      const participantIdsForClient = new Set<string>()
      const relevantParticipantsByContract = new Map<string, any[]>()
      for (const contract of dataRows ?? []) {
        if (!contract?.id) continue
        const participants: any[] = Array.isArray(contract.participant_contracts)
          ? contract.participant_contracts
          : []

        const relevantParticipants = client.email
          ? participants.filter(
              (participant) => participant?.participant_email?.toLowerCase() === client.email?.toLowerCase(),
            )
          : participants

        relevantParticipantsByContract.set(contract.id, relevantParticipants)
        for (const participant of relevantParticipants) {
          const participantId = typeof participant?.id === 'string' ? participant.id : null
          if (participantId) participantIdsForClient.add(participantId)
        }
      }

      const totalSessionsByContract = new Map<string, number>()
      for (const row of dataRows ?? []) {
        if (!row?.id) continue
        totalSessionsByContract.set(row.id, row.total_sessions ?? 0)
      }

      const completedByContract = new Map<string, number>()
      let sessionRows: any[] = []
      if (contractIds.length > 0) {
        const { data: fetchedSessions, error: sessionErr } = await supabase
          .from('training_sessions')
          .select('id, contract_id, status, session_date, attendance_data, participant_ids')
          .in('contract_id', contractIds)

        if (sessionErr) throw sessionErr
        sessionRows = fetchedSessions ?? []

        for (const session of sessionRows) {
          if (!session?.contract_id) continue
          if ((session.status ?? '').toLowerCase() !== 'completed') continue
          completedByContract.set(
            session.contract_id,
            (completedByContract.get(session.contract_id) ?? 0) + 1,
          )
        }

        const sessionsForClient = sessionRows.filter((session: any) => {
          if (!session) return false
          const contractId = session.contract_id
          if (!contractId) return false
          const participants = Array.isArray(session.participant_ids) ? session.participant_ids : []
          if (participantIdsForClient.size === 0) return true
          if (participants.length === 0) return true
          return participants.some((id: unknown) => typeof id === 'string' && participantIdsForClient.has(id))
        })

        const { adherence, engagement } = computeAdherenceStatsForSessions(sessionsForClient)
        setAdherenceStats(adherence)
        setEngagementMetrics(engagement)
      } else {
        const { adherence, engagement } = computeAdherenceStatsForSessions([])
        setAdherenceStats(adherence)
        setEngagementMetrics(engagement)
      }

      const resolveStorageUrl = async (pdfInfo: any): Promise<string | null> => {
        if (!pdfInfo) return null

        const directUrlCandidates = [pdfInfo.url, pdfInfo.publicUrl, pdfInfo.signedUrl]
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value!.trim())

        for (const direct of directUrlCandidates) {
          if (direct.startsWith('http')) return direct
          if (direct.startsWith('//')) return `https:${direct}`
        }

        const pathRaw = typeof pdfInfo.path === 'string' ? pdfInfo.path.trim() : ''
        if (!pathRaw) return null

        const bucketHint = typeof pdfInfo.bucket === 'string' ? pdfInfo.bucket.trim() : ''
        const fallbackBucket = CONTRACT_PDF_BUCKET?.trim() ?? ''

        const extractBucketFromPath = (value: string) => {
          if (!value) return ''
          const trimmed = value.replace(/^\/+/ , '')
          const segments = trimmed.split('/')
          if (segments[0] === 'storage' && segments[1] === 'v1' && segments[2] === 'object' && segments[3] === 'public') {
            return segments[4] ?? ''
          }
          if (segments[0] === 'public' && segments.length > 1) {
            return segments[1]
          }
          return segments[0]
        }

        const derivedBucket = extractBucketFromPath(pathRaw)

        const seedBuckets = [bucketHint, derivedBucket, fallbackBucket]
          .map((candidate) => candidate?.trim())
          .filter((candidate) => candidate && candidate.length > 0) as string[]

        if (seedBuckets.length === 0) {
          return directUrlCandidates.find((candidate) => candidate.startsWith('http')) ?? null
        }

        const bucketCandidates = new Set<string>()
        seedBuckets.forEach((bucket) => {
          bucketCandidates.add(bucket)
          bucketCandidates.add(bucket.replace(/-/g, '_'))
          bucketCandidates.add(bucket.replace(/_/g, '-'))
        })

        const sanitizedPath = pathRaw.replace(/^\/+/ , '')
        const pathCandidates = new Set<string>()
        pathCandidates.add(sanitizedPath)
        pathCandidates.add(sanitizedPath.replace(/^public\//, ''))
        pathCandidates.add(sanitizedPath.replace(/^storage\/v1\/object\/public\//, ''))

        bucketCandidates.forEach((bucket) => {
          const regex = new RegExp(`^${bucket}/`)
          const altRegex = new RegExp(`^public/${bucket}/`)
          pathCandidates.add(sanitizedPath.replace(regex, ''))
          pathCandidates.add(sanitizedPath.replace(altRegex, ''))
          pathCandidates.add(sanitizedPath.replace(new RegExp(`^storage/v1/object/public/${bucket}/`), ''))
        })

        for (const bucket of bucketCandidates) {
          for (const candidatePath of pathCandidates) {
            const finalPath = candidatePath.replace(/^\/+/ , '')
            if (!finalPath) continue

            const { data, error } = await supabase.storage.from(bucket).createSignedUrl(finalPath, 60 * 60)
            if (!error && data?.signedUrl) {
              return data.signedUrl
            }

            const alt = await supabase.storage.from(bucket).createSignedUrl(`public/${finalPath}`, 60 * 60)
            if (!alt.error && alt.data?.signedUrl) {
              return alt.data.signedUrl
            }
          }
        }

        return directUrlCandidates.find((candidate) => candidate.startsWith('http')) ?? null
      }

      const contracts: ContractDetail[] = await Promise.all(
        (dataRows ?? []).map(async (contract: any) => {
          const participants: any[] = Array.isArray(contract.participant_contracts)
            ? contract.participant_contracts
            : []

          const relevantParticipants = relevantParticipantsByContract.get(contract.id) ?? participants

          const { label: signedStatus, latestSigned } = buildSignedStatus(relevantParticipants)

          const pdfLinks = (
            await Promise.all(
              relevantParticipants.map(async (participant, index) => {
                const payload = (participant.contract_payload as Record<string, any> | null) ?? null
                const pdfInfo = payload?.contract_pdf ?? null
                const publicUrl = await resolveStorageUrl(pdfInfo)
                if (!publicUrl) return null
                const displayLabel = participant.participant_name?.trim()
                  || participant.participant_email?.trim()
                  || `Participant ${index + 1}`
                return { label: displayLabel, url: publicUrl }
              }),
            )
          ).filter(Boolean) as ContractDetail['pdfLinks']

          const totalSessions = totalSessionsByContract.get(contract.id) ?? (contract.total_sessions ?? 0)
          const completedSessions = completedByContract.get(contract.id) ?? 0
          const normalizedStatus = normalizeContractStatus(contract, totalSessions, completedSessions)

          return {
            id: contract.id,
            contractNumber: contract.contract_number ?? 'Unknown',
            status: normalizedStatus,
            startDate: contract.start_date ?? null,
            endDate: contract.end_date ?? null,
            totalAmount: typeof contract.total_amount === 'number' ? contract.total_amount : null,
            paymentSchedule: contract.payment_schedule ?? null,
            signedStatus,
            signedDate: latestSigned,
            pdfLinks,
          }
        }),
      )

      const invoicesAll: InvoiceDetail[] = (dataRows ?? [])
        .flatMap((contract: any) => {
          const instances: any[] = Array.isArray(contract.contract_invoice_instances)
            ? contract.contract_invoice_instances
            : []
          const participantIds = new Set(
            (Array.isArray(contract.participant_contracts) ? contract.participant_contracts : [])
              .filter((p: any) => !client.email || (p.participant_email?.toLowerCase() === client.email?.toLowerCase()))
              .map((p: any) => p.id),
          )

          return instances
            .filter((instance) => {
              // Only show invoices tied to the selected participant(s)
              if (participantIds.size === 0) return true
              return participantIds.has(instance.participant_contract_id)
            })
            .map((instance) => ({
              id: instance.id,
              dueDate: instance.due_date,
              status: instance.status,
              total: (instance.installment_total_cents ?? 0) / 100,
              contractNumber: contract.contract_number ?? 'Unknown',
              publicUrl: instance.square_public_url ?? null,
              scheduledAt: instance.scheduled_at ?? null,
              squareInvoiceId: instance.square_invoice_id ?? null,
              squareInvoiceNumber: instance.square_invoice_number ?? null,
            }))
        })

      // De-duplicate by Square invoice ID (fallback to instance id if missing)
      const uniqueMap = new Map<string, InvoiceDetail>()
      for (const inv of invoicesAll) {
        const key = inv.squareInvoiceId ?? inv.id
        if (!uniqueMap.has(key)) uniqueMap.set(key, inv)
      }

      const invoices: InvoiceDetail[] = Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      )

      // Resolve `clients.id` via email for trainer assignment context
      let clientId: string | null = null
      if (client.email) {
        const { data: cRow } = await supabase
          .from('clients')
          .select('id')
          .eq('email', client.email)
          .maybeSingle()
        clientId = cRow?.id ?? null
      }

      const trainerMap = new Map<string, { trainer_id: string; name: string }>()
      const pendingTrainerIds = new Set<string>()
      const trainerSessionCount = new Map<string, number>()
      const addTrainer = (id?: string | null, first?: string | null, last?: string | null) => {
        if (!id) return
        if (trainerMap.has(id)) return
        const label = `${first?.trim() ?? ''} ${last?.trim() ?? ''}`.trim()
        trainerMap.set(id, { trainer_id: id, name: label || 'Trainer' })
        pendingTrainerIds.delete(id)
      }
      const markTrainerId = (id?: string | null) => {
        if (!id) return
        if (trainerMap.has(id)) return
        pendingTrainerIds.add(id)
      }
      const incrementSessions = (id?: string | null) => {
        if (!id) return
        trainerSessionCount.set(id, (trainerSessionCount.get(id) ?? 0) + 1)
      }

      // Pull trainers from contracts directly (calculator flow assignment)
      for (const contract of dataRows ?? []) {
        const t = Array.isArray(contract.trainers) ? contract.trainers[0] : contract.trainers
        addTrainer(t?.id ?? null, t?.first_name ?? null, t?.last_name ?? null)
        if ((!t || !t.id) && contract.trainer_id) {
          markTrainerId(contract.trainer_id)
        }
      }

      // Derive trainers from scheduled/completed sessions and schedule entries
      if (contractIds.length > 0) {
        const { data: sessionRows } = await supabase
          .from('training_sessions')
          .select('trainer_id, trainers(id, first_name, last_name)')
          .in('contract_id', contractIds)

        for (const session of sessionRows ?? []) {
          if (session?.trainer_id) {
            const t = Array.isArray(session.trainers) ? session.trainers[0] : session.trainers
            addTrainer(session.trainer_id, t?.first_name ?? null, t?.last_name ?? null)
            incrementSessions(session.trainer_id)
            if (!t || !t.id) markTrainerId(session.trainer_id)
          }
        }

        const { data: scheduleRows } = await supabase
          .from('contract_schedule_entries')
          .select('trainer_id')
          .in('contract_id', contractIds)

        for (const entry of scheduleRows ?? []) {
          if (entry?.trainer_id) markTrainerId(entry.trainer_id)
        }
      }

      let splits: Array<{ trainer_id: string; name: string; allocated_sessions: number }> = []
      if (clientId) {
        const { data: assigns } = await supabase
          .from('client_trainer_assignments')
          .select('trainer_id, trainers(id, first_name, last_name)')
          .eq('client_id', clientId)
          .is('unassigned_date', null)

        for (const row of assigns ?? []) {
          const t = Array.isArray(row.trainers) ? row.trainers[0] : row.trainers
          addTrainer(row.trainer_id, t?.first_name ?? null, t?.last_name ?? null)
        }

        try {
          const { data: splitRows } = await (supabase as any)
            .rpc('get_client_current_trainer_splits', { input_client_id: clientId })

          splits = (splitRows ?? []).map((row: any) => {
            const t = Array.isArray(row.trainers) ? row.trainers[0] : row.trainers
            const first = t?.first_name?.trim() ?? ''
            const last = t?.last_name?.trim() ?? ''
            const id = row.trainer_id ?? t?.id ?? null
            if (id) {
              addTrainer(id, first, last)
            }
            return { trainer_id: row.trainer_id, name: `${first} ${last}`.trim() || 'Trainer', allocated_sessions: row.allocated_sessions ?? 0 }
          })
        } catch (rpcError) {
          console.warn('Trainer split RPC unavailable:', (rpcError as any)?.message ?? rpcError)
        }
      }

      if (pendingTrainerIds.size > 0) {
        const { data: pendingRows } = await supabase
          .from('trainers')
          .select('id, first_name, last_name')
          .in('id', Array.from(pendingTrainerIds))

        for (const row of pendingRows ?? []) {
          addTrainer(row?.id ?? null, row?.first_name ?? null, row?.last_name ?? null)
        }
      }

      const trainers = Array.from(trainerMap.values())

      const trainerSessionsObj = Object.fromEntries(Array.from(trainerSessionCount.entries())) as Record<string, number>

      setDetailData({ contracts, invoices, clientId, trainers, splits, trainerSessions: trainerSessionsObj })
      const populateEditForm = () => {
        /* no-op: legacy edit UI removed */
      }
      populateEditForm()
    } catch (error) {
      console.error('Error loading client detail:', error)
      setDetailError('Unable to load client details. Please try again.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    selectedClientRef.current = selectedClient
  }, [selectedClient])

  useEffect(() => {
    const channel = supabase
      .channel('contract_invoice_instances_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_invoice_instances' }, payload => {
        if (!detailOpen) return
        const client = selectedClientRef.current
        if (!client) return

        const newRow = (payload.new as { contract_id?: string | null } | null) ?? null
        const oldRow = (payload.old as { contract_id?: string | null } | null) ?? null
        const contractId = newRow?.contract_id ?? oldRow?.contract_id ?? null
        if (!contractId) return

        if (client.contractIds.includes(contractId)) {
          void loadClientDetail(client)
        }
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [detailOpen, loadClientDetail])

  // Fetch trainer options when detail opens (admin only)
  useEffect(() => {
    const run = async () => {
      if (!detailOpen || !isAdmin) return
      const { data } = await supabase
        .from('trainers')
        .select('id, first_name, last_name')
        .order('first_name')
      const options = (data ?? []).map(t => ({ id: t.id, name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Trainer' }))
      setTrainerOptions(options)
    }
    void run()
  }, [detailOpen, isAdmin])

  const openAssignModal = () => {
    // Prefill with current splits if available; otherwise one empty row
    if (detailData?.splits && detailData.splits.length > 0) {
      setAssignRows(detailData.splits.map(s => ({ trainerId: s.trainer_id, sessions: Number(s.allocated_sessions || 0) })))
    } else if (detailData?.trainerSessions && Object.keys(detailData.trainerSessions).length > 0) {
      const rows = Object.entries(detailData.trainerSessions)
        .map(([trainerId, sessions]) => ({ trainerId, sessions }))
        .sort((a, b) => Number(b.sessions) - Number(a.sessions))
        .slice(0, 3)
      setAssignRows(rows)
    } else if (detailData?.trainers && detailData.trainers.length > 0) {
      setAssignRows(detailData.trainers.slice(0, 3).map(t => ({ trainerId: t.trainer_id, sessions: 0 })))
    } else {
      setAssignRows([{ trainerId: '', sessions: 0 }])
    }
    setUpdateCalendarNow(false)
    setShowAssignModal(true)
  }

  const addAssignRow = () => {
    if (assignRows.length >= 3) return
    setAssignRows(prev => [...prev, { trainerId: '', sessions: 0 }])
  }

  const removeAssignRow = (index: number) => {
    setAssignRows(prev => prev.filter((_, i) => i !== index))
  }

  const saveAssignments = async () => {
    try {
      if (!detailData?.clientId) return
      const cleaned = assignRows
        .filter(r => r.trainerId)
        .map(r => ({ trainer_id: r.trainerId, allocated_sessions: Math.max(0, Number(r.sessions) || 0) }))
        .slice(0, 3)

      const total = cleaned.reduce((sum, r) => sum + (r.allocated_sessions || 0), 0)
      const remaining = selectedClientRef.current?.remainingSessions ?? 0
      if (total > remaining) {
        toast({ title: 'Too many sessions', description: `You allocated ${total} but only ${remaining} remain.`, variant: 'destructive' })
        return
      }

      const res = await fetch(withFunctionsBase('/.netlify/functions/assignClientTrainers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: detailData.clientId, assignments: cleaned, updateCalendar: updateCalendarNow, replaceAssignments: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to assign trainers')
      toast({ title: 'Trainers assigned', description: json?.message || 'Assignments saved.' })
      setShowAssignModal(false)
      if (selectedClientRef.current) await loadClientDetail(selectedClientRef.current)
    } catch (error: any) {
      toast({ title: 'Save failed', description: error?.message || 'Unable to save trainer assignments.', variant: 'destructive' })
    }
  }

  const runSyncInvoices = useCallback(async () => {
    try {
      setSyncing(true)
      const res = await fetch(withFunctionsBase('/.netlify/functions/syncInvoices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Sync failed')
      }
      toast({ title: 'Invoices synchronized', description: `Updated ${json.updated ?? 0} invoice(s).` })
      const client = selectedClientRef.current
      if (client) await loadClientDetail(client)
    } catch (error: any) {
      toast({ title: 'Sync failed', description: error?.message || 'Unable to sync invoices.', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }, [loadClientDetail, toast])

  const openDetail = (client: AggregatedClient) => {
    setSelectedClient(client)
    setDetailOpen(true)
    void loadClientDetail(client)
  }

  const closeDetail = (open: boolean) => {
    setDetailOpen(open)
    if (!open) {
      setSelectedClient(null)
      setDetailData(null)
      setDetailError(null)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <p>Loading clients...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Users className="h-8 w-8 text-primary mt-1" />
            <div>
              <h1 className="text-3xl font-bold">{isAdmin ? 'All Clients' : 'My Clients'}</h1>
              <p className="text-sm text-muted-foreground">
                Clients are grouped by email. Click a name to view contracts, invoices, and signatures.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void runSyncInvoices()} disabled={syncing}>
              {syncing ? (
                <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing…</span>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 mr-2" />
                  Sync Invoices
                </>
              )}
            </Button>
            <Button onClick={exportToCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Clients</CardTitle>
            <CardDescription>Search by name, email, phone number, or contract number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full md:w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="expiring soon">Expiring Soon</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {filteredClients.length} of {clients.length} clients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client List</CardTitle>
            <CardDescription>Grouped by unique email address.</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredClients.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No clients found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="p-3 text-left font-semibold">Client</th>
                      <th className="p-3 text-left font-semibold">Status</th>
                      <th className="p-3 text-left font-semibold">Frequency</th>
                      <th className="p-3 text-left font-semibold">Package Length</th>
                      <th className="p-3 text-left font-semibold">Session Rate</th>
                      <th className="p-3 text-left font-semibold">Total Sessions</th>
                      <th className="p-3 text-left font-semibold">Latest Start</th>
                      <th className="p-3 text-left font-semibold">Latest End</th>
                      {isAdmin && <th className="p-3 text-left font-semibold">Trainer</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr key={client.key} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <button
                            type="button"
                            className="text-left text-primary font-semibold hover:underline"
                            onClick={() => openDetail(client)}
                          >
                            {client.name ?? client.email ?? 'Unknown Client'}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            {client.email || 'No email on file'}
                          </div>
                          {client.phone && (
                            <div className="text-xs text-muted-foreground">{client.phone}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(client.status)}`}>
                            {formatStatusLabel(client.status)}
                          </span>
                        </td>
                        <td className="p-3">{formatFrequencyLabel(client.latestFrequency)}</td>
                        <td className="p-3">{formatPackageLength(client.latestPackageLength)}</td>
                        <td className="p-3">
                          {client.latestPricePerSession != null ? formatCurrency(client.latestPricePerSession) : '—'}
                        </td>
                        <td className="p-3">{client.totalSessions}</td>
                        <td className="p-3">{formatDateDisplay(client.latestStartDate)}</td>
                        <td className="p-3">{formatDateDisplay(client.latestEndDate)}</td>
                        {isAdmin && (
                          <td className="p-3 text-xs text-muted-foreground">
                            {client.trainerNames.length ? client.trainerNames.join(', ') : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader className="pr-12">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{selectedClient?.name ?? selectedClient?.email ?? 'Client Details'}</DialogTitle>
                <DialogDescription>
                  {selectedClient?.email && <span className="block">Email: {selectedClient.email}</span>}
                  {selectedClient?.phone && <span className="block">Phone: {selectedClient.phone}</span>}
                  <span className="block">Contracts: {selectedClient?.contractCount ?? 0}</span>
                </DialogDescription>
              </div>
              <div className="text-right space-y-2">
                <div className="text-xs text-muted-foreground">Current trainer(s)</div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(detailData?.trainers ?? []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    (detailData?.trainers ?? []).map(t => (
                      <span key={t.trainer_id} className="px-2 py-0.5 rounded-full bg-muted text-xs">{t.name}</span>
                    ))
                  )}
                </div>
                {isAdmin && (
                  <div className="pt-1">
                    <Button size="sm" variant="outline" onClick={openAssignModal}>Assign Trainers</Button>
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading client details...</span>
            </div>
          )}

          {detailError && (
            <p className="text-destructive text-sm py-4">{detailError}</p>
          )}

          {!detailLoading && detailData && (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Adherence</h3>
                    <p className="text-sm text-muted-foreground">
                      Attendance performance across recent activity.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {ADHERENCE_RANGES.map((range) => (
                      <Button
                        key={range.key}
                        size="sm"
                        variant={range.key === adherenceRange ? 'default' : 'outline'}
                        onClick={() => setAdherenceRange(range.key)}
                        className="text-xs"
                      >
                        {range.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-5 text-sm">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Sessions booked</div>
                    <div className="text-lg font-semibold">
                      {currentAdherence ? currentAdherence.booked : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">{adherenceRangeLabel}</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Sessions attended</div>
                    <div className="text-lg font-semibold">
                      {currentAdherence ? currentAdherence.attended : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">Marked present / completed</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">No shows</div>
                    <div className="text-lg font-semibold">
                      {currentAdherence ? currentAdherence.noShows : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">Counted penalties</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Late cancels</div>
                    <div className="text-lg font-semibold">
                      {currentAdherence ? currentAdherence.lateCancels : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">Client forfeits session</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Adherence rate</div>
                    <div className="text-lg font-semibold">
                      {currentAdherence ? formatPercentage(currentAdherence.rate) : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">Attended ÷ booked</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Engagement</h3>
                    <p className="text-sm text-muted-foreground">
                      Lifetime markers based on attended sessions.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-6 text-sm">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Total sessions</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics ? engagementMetrics.totalAttended : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">All-time attended</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">First session</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics?.firstAttended ? formatDateDisplay(engagementMetrics.firstAttended.toISOString()) : '—'}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Last session</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics?.lastAttended ? formatDateDisplay(engagementMetrics.lastAttended.toISOString()) : '—'}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Attendance streak (days)</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics ? engagementMetrics.currentStreakDays : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {engagementMetrics
                        ? formatDateRange(engagementMetrics.currentStreakStart, engagementMetrics.currentStreakEnd)
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Highest streak</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics ? engagementMetrics.longestStreakDays : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {engagementMetrics
                        ? formatDateRange(engagementMetrics.longestStreakStart, engagementMetrics.longestStreakEnd)
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Most in 30 days</div>
                    <div className="text-lg font-semibold">
                      {engagementMetrics ? engagementMetrics.best30DayAttendance.count : '—'}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {engagementMetrics
                        ? formatDateRange(
                            engagementMetrics.best30DayAttendance.windowStart,
                            engagementMetrics.best30DayAttendance.windowEnd,
                          )
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contracts
                </h3>
                {detailData.contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contracts found for this client.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-left">Contract #</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Schedule</th>
                          <th className="p-2 text-left">Total</th>
                          <th className="p-2 text-left">Signed</th>
                          <th className="p-2 text-left">Documents</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.contracts.map((contract) => (
                          <tr key={contract.id} className="border-b">
                            <td className="p-2">
                              <div className="font-medium">{contract.contractNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateDisplay(contract.startDate)} – {formatDateDisplay(contract.endDate)}
                              </div>
                            </td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(contract.status)}`}>
                                {formatStatusLabel(contract.status)}
                              </span>
                            </td>
                            <td className="p-2 text-xs text-muted-foreground">{formatStatusLabel(contract.paymentSchedule)}</td>
                            <td className="p-2">{contract.totalAmount ? formatCurrency(contract.totalAmount) : '—'}</td>
                            <td className="p-2">
                              <div className="text-sm">{contract.signedStatus}</div>
                              <div className="text-xs text-muted-foreground">
                                {contract.signedDate ? `Latest: ${formatDateDisplay(contract.signedDate)}` : '—'}
                              </div>
                            </td>
                            <td className="p-2">
                              {contract.pdfLinks.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No PDF stored</span>
                              ) : (
                                <div className="space-y-1">
                                  {contract.pdfLinks.map((pdf) => (
                                    <a
                                      key={pdf.url}
                                      href={pdf.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" /> {pdf.label}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Invoices
                </h3>
                {detailData.invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices found for this client.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-left">Due Date</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Amount</th>
                          <th className="p-2 text-left">Contract</th>
                          <th className="p-2 text-left">Link</th>
                          <th className="p-2 text-left">Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.invoices.map((invoice) => (
                          <tr key={invoice.id} className="border-b">
                            <td className="p-2">{formatDateDisplay(invoice.dueDate)}</td>
                            <td className="p-2">
                              {(() => {
                                const { label, badgeClass } = getInvoiceStatusDisplay(invoice)
                                return (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                                    {label}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="p-2">{formatCurrency(invoice.total)}</td>
                            <td className="p-2 text-xs text-muted-foreground">{invoice.contractNumber}</td>
                            <td className="p-2">
                              {invoice.publicUrl ? (
                                <a
                                  href={invoice.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {invoice.squareInvoiceNumber
                                    ? `#${invoice.squareInvoiceNumber}`
                                    : invoice.squareInvoiceId ?? 'Invoice'}
                                </a>
                              ) : invoice.squareInvoiceNumber || invoice.squareInvoiceId ? (
                                <span className="text-xs text-muted-foreground">
                                  {invoice.squareInvoiceNumber
                                    ? `#${invoice.squareInvoiceNumber}`
                                    : invoice.squareInvoiceId}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-2">
                              {(() => {
                                const normalizedStatus = (invoice.status ?? '').toLowerCase()
                                const statusAllowsPay = ['unpaid', 'overdue', 'past_due'].includes(normalizedStatus)
                                const hasUrl = typeof invoice.publicUrl === 'string' && invoice.publicUrl.length > 0
                                if (!statusAllowsPay || !hasUrl) {
                                  return <span className="text-xs text-muted-foreground">—</span>
                                }

                                return (
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => {
                                      setPayNowInvoice(invoice)
                                      setShowPayNowModal(true)
                                    }}
                                  >
                                    Pay Now
                                  </button>
                                )
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showAssignModal && (
        <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign Trainers</DialogTitle>
              <DialogDescription>
                Distribute up to {selectedClient?.remainingSessions ?? 0} remaining sessions among up to 3 trainers.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Currently assigned: {assignRows.reduce((sum, row) => sum + (Number(row.sessions) || 0), 0)} / {selectedClient?.remainingSessions ?? 0} sessions
              </div>
              {assignRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_110px_28px] items-end gap-2">
                  <div>
                    <Label className="text-xs">Trainer</Label>
                    <select
                      className="w-full border rounded h-9 px-2"
                      value={row.trainerId}
                      onChange={e => setAssignRows(prev => prev.map((r, i) => i === idx ? { ...r, trainerId: e.target.value } : r))}
                    >
                      <option value="">Select trainer…</option>
                      {trainerOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Sessions</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sessions}
                      onChange={e => setAssignRows(prev => prev.map((r, i) => i === idx ? { ...r, sessions: Number(e.target.value || 0) } : r))}
                    />
                  </div>
                  <div className="flex items-end h-9">
                    {assignRows.length > 1 && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => removeAssignRow(idx)}>✕</button>
                    )}
                  </div>
                </div>
              ))}
              {assignRows.length < 3 && (
                <Button variant="ghost" size="sm" onClick={addAssignRow}>+ Add trainer</Button>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={updateCalendarNow} onChange={(e) => setUpdateCalendarNow(e.target.checked)} />
                Also update upcoming calendar sessions now
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancel</Button>
              <Button onClick={saveAssignments}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showPayNowModal} onOpenChange={(open) => {
        setShowPayNowModal(open)
        if (!open) setPayNowInvoice(null)
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pay Invoice</DialogTitle>
            <DialogDescription>
              Complete payment for invoice {payNowInvoice?.squareInvoiceNumber ? `#${payNowInvoice.squareInvoiceNumber}` : payNowInvoice?.squareInvoiceId ?? ''}.
            </DialogDescription>
          </DialogHeader>
          {payNowInvoice?.publicUrl ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                The secure payment page is embedded below. If it does not load, <a className="text-primary hover:underline" href={payNowInvoice.publicUrl} target="_blank" rel="noreferrer">open in a new tab</a>.
              </div>
              <div className="border-t border-border" />
              <div className="h-[70vh] border rounded-md overflow-hidden">
                <iframe
                  title="Invoice Payment"
                  src={payNowInvoice.publicUrl}
                  className="w-full h-full"
                  allow="payment"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This invoice does not have an available payment link.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPayNowModal(false)
              setPayNowInvoice(null)
            }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
