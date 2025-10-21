import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { habitConsistencyFromPillars, badgesFromCheckinFlags } from '@/features/elevate/domain/compute'

interface ElevationTiles {
  safety: { status: string | null; notes: string | null }
  goals: { status: string | null; notes: string | null }
  habits: { consistency_pct: number | null; commentary: string | null }
  grip: { delta_pct: number | null; commentary: string | null }
  body_comp: { delta: number | null; commentary: string | null }
  movement: { quality_score: number | null; priorities: string[]; failing_kpis: { key: string; why: string; cues: string[] }[] }
}

interface ElevationPlan {
  actions: { kpi: string; focus: string; regression: string | null; progression: string | null }[]
  notes: string | null
}

interface ElevationPriorities {
  highlights: string[]
  rationale: { key: string; why: string; cues: string[] }[]
}

interface FuseResponse {
  snapshotId: string
  createdAt: string
  tiles: ElevationTiles
  priorities: ElevationPriorities
  plan: ElevationPlan | null
}

interface PulseCheckin {
  id: string
  date: string | null
  readiness_0_100: number | null
  attendance_pct: number | null
  pillars_json: Record<string, number | null> | null
  flags: any[] | null
}

const movementPriorityLabel: Record<string, string> = {
  squat_depth_control: 'Depth control',
  squat_knee_tracking: 'Knee tracking',
  squat_trunk_brace: 'Trunk brace',
  squat_foot_stability: 'Foot stability',
  lunge_front_knee_path: 'Front knee path',
  lunge_pelvis_control: 'Pelvis control',
  lunge_depth_symmetry: 'Depth symmetry',
  lunge_push_back_drive: 'Push-back drive',
  hinge_hip_ratio: 'Hip/hinge ratio',
  hinge_spine_neutral: 'Spine neutral',
  hinge_midfoot_pressure: 'Midfoot pressure',
  hinge_lockout_finish: 'Lockout finish',
  push_setup_brace: 'Setup & brace',
  push_range_control: 'Range control',
  push_tempo_bracing: 'Tempo & brace',
  push_symmetry_stability: 'Symmetry & stability',
  pull_torso_brace: 'Torso brace',
  pull_scap_timing: 'Scap timing',
  pull_elbow_path: 'Elbow path',
  pull_grip_control: 'Grip control'
}

const tileClass =
  'rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/65 to-emerald-50/35 p-6 space-y-4 shadow-[0_42px_120px_-60px_rgba(15,118,110,0.45)] transition-shadow hover:shadow-[0_52px_160px_-70px_rgba(15,118,110,0.52)] h-full print:shadow-none print:border-slate-200 print:bg-white'

const sectionShellClass =
  'rounded-[36px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/55 to-emerald-50/30 px-8 py-9 shadow-[0_70px_180px_-90px_rgba(15,118,110,0.55)] backdrop-blur print:bg-white print:border-slate-200 print:shadow-none'

const statusColor = (status: string | null) => {
  switch ((status ?? 'unknown').toLowerCase()) {
    case 'clear':
    case 'stable':
    case 'green':
      return 'text-emerald-600 bg-emerald-50 border border-emerald-200'
    case 'watch':
    case 'amber':
    case 'moderate':
      return 'text-amber-600 bg-amber-50 border border-amber-200'
    case 'red':
    case 'critical':
    case 'high':
      return 'text-red-600 bg-red-50 border border-red-200'
    default:
      return 'text-slate-600 bg-slate-50 border border-slate-200'
  }
}

type SmartGoalSummary = {
  goal_type: string | null
  specific: string | null
  measurable: string | null
  achievable: string | null
  relevant: string | null
  time_bound: string | null
  non_negs: string[]
  horizon: string | null
  workouts_per_week: number | null
}

type InbodyHistoryRow = {
  date: string
  waist_to_height: number | null
  waist_cm: number | null
  weight_kg: number | null
  body_fat_pct: number | null
}

type VitalsHistoryRow = {
  date: string
  bp_sys: number | null
  bp_dia: number | null
  resting_hr: number | null
}

type MovementScreenHistoryRow = {
  id: string
  recorded_at: string
  pattern: string | null
  overall_score_0_3: number | null
  kpis: { key: string; pass: boolean; score_0_3: number | null }[]
}

const BRAND = {
  emerald: '#3FAE52',
  emeraldDark: '#2d8b3f',
  forest: '#0C3B2E',
  sky: '#38BDF8',
  navy: '#0F172A',
  slate: '#1F2933',
  amber: '#F59E0B',
  violet: '#6366F1'
} as const

const PILLAR_META = {
  movement_0_4: { label: 'Movement', color: BRAND.sky },
  nutrition_0_4: { label: 'Nutrition', color: BRAND.emerald },
  sleep_0_4: { label: 'Sleep', color: BRAND.violet },
  stress_0_4: { label: 'Stress', color: BRAND.amber }
} as const

type PillarKey = keyof typeof PILLAR_META

const PILLAR_COPY: Record<PillarKey, string> = {
  movement_0_4: 'Form, control, and confidence in every lift.',
  nutrition_0_4: 'Fuel choices that keep energy and recovery high.',
  sleep_0_4: 'Nightly recharge routines and sleep quality.',
  stress_0_4: 'Reset habits that keep stress in check.'
}

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const scaleToPercent = (value: number | null | undefined, min: number, max: number) => {
  if (value == null || !Number.isFinite(value) || max === min) return null
  return clampNumber(((value - min) / (max - min)) * 100, 0, 100)
}

const scaleInverseToPercent = (value: number | null | undefined, min: number, max: number) => {
  if (value == null || !Number.isFinite(value) || max === min) return null
  return clampNumber(((max - value) / (max - min)) * 100, 0, 100)
}

const scoreFromWaistHeight = (ratio: number | null) => scaleInverseToPercent(ratio, 0.45, 0.6)

const scoreFromRestingHr = (hr: number | null) => scaleInverseToPercent(hr, 50, 90)

const scoreFromGripDelta = (deltaPct: number | null) => {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null
  return clampNumber(((deltaPct + 5) / 15) * 100, 0, 100)
}

const scoreFromAttendance = (attendancePct: number | null) => scaleToPercent(attendancePct, 60, 100)

const scoreFromMovementQuality = (score0to3: number | null) => {
  if (score0to3 == null || !Number.isFinite(score0to3)) return null
  return clampNumber((score0to3 / 3) * 100, 0, 100)
}

const scoreFromGoalCompletion = (goal: SmartGoalSummary | null) => {
  if (!goal) return null
  const fields: Array<string | number | string[] | null> = [
    goal.goal_type,
    goal.specific,
    goal.measurable,
    goal.achievable,
    goal.relevant,
    goal.time_bound,
    goal.non_negs.length > 0 ? goal.non_negs : null,
    goal.horizon,
    goal.workouts_per_week
  ]
  const filled = fields.reduce<number>((acc, item) => {
    if (item == null) return acc
    if (Array.isArray(item)) return item.length === 0 ? acc : acc + 1
    return acc + 1
  }, 0)
  return clampNumber((filled / fields.length) * 100, 0, 100)
}

const scoreFromFlags = (flags: any[] | null | undefined) => {
  if (!Array.isArray(flags)) return 90
  let score = 100
  for (const flag of flags) {
    const severity = typeof flag?.severity === 'string' ? flag.severity.toLowerCase() : 'info'
    if (severity === 'warn' || severity === 'warning') score -= 20
    else if (severity === 'critical') score -= 35
    else score -= 10
  }
  return clampNumber(score, 0, 100)
}

const scoreFromSafetyStatus = (status: string | null | undefined) => {
  const normalized = (status ?? '').toLowerCase()
  if (!normalized) return 60
  if (['clear', 'cleared', 'green', 'stable'].includes(normalized)) return 95
  if (['watch', 'amber', 'moderate'].includes(normalized)) return 65
  if (['needs_clearance', 'red', 'critical', 'high'].includes(normalized)) return 35
  return 60
}

const scoreFromBloodPressure = (sys: number | null, dia: number | null) => {
  if (sys == null || dia == null || !Number.isFinite(sys) || !Number.isFinite(dia)) return null
  if (sys <= 120 && dia <= 80) return 100
  if (sys <= 130 && dia <= 85) return 85
  if (sys <= 140 && dia <= 90) return 70
  if (sys <= 160 && dia <= 100) return 45
  return 25
}

const formatDeltaBadge = (delta: number | null, unit = '%', precision = 0) => {
  if (delta == null || !Number.isFinite(delta)) return null
  if (Math.abs(delta) < Math.pow(10, -precision) / 2) return null
  const sign = delta > 0 ? '+' : ''
  return `Δ ${sign}${delta.toFixed(precision)}${unit}`
}

const buildFallbackSnapshot = (): FuseResponse => ({
  snapshotId: 'pending',
  createdAt: new Date().toISOString(),
  tiles: {
    safety: { status: 'Unknown', notes: 'Run a consult to review safety notes.' },
    goals: { status: 'Not set', notes: 'Set SMART goals during the consult to spotlight their focus.' },
    habits: { consistency_pct: null, commentary: 'Pillars will populate after the consult and monthly check-ins.' },
    grip: { delta_pct: null, commentary: 'Grip changes appear once consult strength tests are logged.' },
    body_comp: { delta: null, commentary: 'Body composition deltas appear after InBody scans.' },
    movement: { quality_score: null, priorities: [], failing_kpis: [] }
  },
  priorities: { highlights: [], rationale: [] },
  plan: null
})

const latestNumeric = (values: Array<number | null | undefined>) => {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const val = values[i]
    if (typeof val === 'number' && Number.isFinite(val)) return val
  }
  return null
}

type HeroMetric = {
  id: string
  label: string
  score: number | null
  weight: number
  color: string
  display: string
  deltaLabel?: string | null
  description: string
}

const TAU = Math.PI * 2

const polarToCartesian = (cx: number, cy: number, radius: number, angleRad: number) => ({
  x: cx + radius * Math.cos(angleRad),
  y: cy + radius * Math.sin(angleRad)
})

const describeArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, startAngle)
  const end = polarToCartesian(cx, cy, radius, endAngle)
  const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

const ImpactDial = ({ score, metrics, className }: { score: number | null; metrics: HeroMetric[]; className?: string }) => {
  const normalized = score == null || !Number.isFinite(score) ? 0 : clampNumber(score, 0, 100)
  const gaugeSpan = (5 * TAU) / 6
  const startAngle = -Math.PI / 2 - gaugeSpan / 2
  const endAngle = startAngle + gaugeSpan
  const sweepAngle = startAngle + (normalized / 100) * gaugeSpan
  const trackPath = describeArc(130, 130, 100, startAngle, endAngle)
  const valuePath = describeArc(130, 130, 100, startAngle, sweepAngle)
  const topOpportunities = metrics.filter((m) => m.score != null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 3)
  return (
    <div className={`relative flex w-full max-w-[320px] flex-col items-center gap-6 lg:items-end ${className ?? ''}`}>
      <svg width={260} height={260} className="overflow-visible">
        <defs>
          <linearGradient id="impactDialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={BRAND.emerald} />
            <stop offset="55%" stopColor={BRAND.sky} />
            <stop offset="100%" stopColor={BRAND.violet} />
          </linearGradient>
          <linearGradient id="impactDialTrack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(148,163,184,0.35)" />
            <stop offset="100%" stopColor="rgba(203,213,225,0.2)" />
          </linearGradient>
        </defs>
        <path d={trackPath} stroke="url(#impactDialTrack)" strokeWidth={20} strokeLinecap="round" fill="none" />
        <path d={valuePath} stroke="url(#impactDialGradient)" strokeWidth={20} strokeLinecap="round" fill="none" />
        <circle cx={130} cy={130} r={78} fill="#ffffff" stroke="rgba(15,23,42,0.08)" strokeWidth={1.5} />
        <text x={130} y={120} textAnchor="middle" className="text-[52px] font-semibold" fill="#0C3B2E" dominantBaseline="middle">
          {Math.round(normalized)}
        </text>
        <text x={130} y={152} textAnchor="middle" className="text-sm font-medium" fill="#475569" dominantBaseline="middle">
          Overall momentum
        </text>
      </svg>
      <div className="w-full space-y-2 text-xs text-slate-600">
        <div className="font-semibold uppercase tracking-wide text-emerald-600">Coach focus next</div>
        {topOpportunities.map((metric) => (
          <div key={metric.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.55)]">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
              {metric.label}
            </span>
            <span className="font-semibold text-slate-900">{metric.score != null ? `${Math.round(metric.score)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const KpiChip = ({ metric }: { metric: HeroMetric }) => {
  const valueText = metric.score != null ? `${Math.round(metric.score)}%` : '—'
  const gradientStyle = {
    background: `linear-gradient(135deg, rgba(255,255,255,0.96), rgba(240,253,244,0.92)), linear-gradient(135deg, ${metric.color}1f, transparent)`
  }
  return (
    <div className="flex min-w-[200px] flex-1 flex-col justify-between rounded-2xl border border-emerald-200/50 px-5 py-4 text-slate-900 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.25)]" style={gradientStyle}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/90">{metric.label}</span>
      <div className="mt-3 flex items-end justify-between gap-4">
        <span className="text-[28px] font-semibold leading-none text-slate-900">{metric.display || valueText}</span>
        {metric.deltaLabel && <span className="text-[11px] font-semibold text-emerald-600/90">{metric.deltaLabel}</span>}
      </div>
      <span className="mt-2 text-xs text-slate-600">{metric.description}</span>
    </div>
  )
}

export default function ElevationMapPage() {
  const [params, setParams] = useSearchParams()
  const clientId = params.get('clientId')
  const tabParam = (params.get('tab') || 'all').toLowerCase()
  const tab: 'consult'|'screen'|'pulse'|'all' = tabParam === 'consult' || tabParam === 'screen' || tabParam === 'pulse' ? (tabParam as any) : 'all'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<FuseResponse | null>(null)
  const [latestCheckin, setLatestCheckin] = useState<PulseCheckin | null>(null)
  const [recentCheckins, setRecentCheckins] = useState<Array<{ date: string; readiness_0_100: number | null; attendance_pct: number | null; pillars_json: Record<string, number | null> | null }>>([])
  const [smartGoal, setSmartGoal] = useState<SmartGoalSummary | null>(null)
  const [inbodyHistory, setInbodyHistory] = useState<InbodyHistoryRow[]>([])
  const [vitalsHistory, setVitalsHistory] = useState<VitalsHistoryRow[]>([])
  const [screenHistory, setScreenHistory] = useState<MovementScreenHistoryRow[]>([])
  const [banner, setBanner] = useState<string | null>(null)
  const [actionHint, setActionHint] = useState<string | null>(null)
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false)

  useEffect(() => {
    const fuse = async () => {
      if (!clientId) {
        setError('Missing clientId in query string.')
        return
      }
      setLoading(true)
      setError(null)
      setBanner(null)
      try {
        const res = await fetch('/.netlify/functions/elevation-fuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId })
        })
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({} as any))
          if (res.status === 404) {
            setBanner(errJson.error || 'No consult or movement data found yet. Capture an Elevate consult or Movement Screen to populate these tiles.')
            setSnapshot(buildFallbackSnapshot())
          } else {
            throw new Error(errJson.error ?? `Fusion failed (${res.status})`)
          }
        } else {
          const data = await res.json()
          setSnapshot(data as FuseResponse)
        }
      } catch (err: any) {
        console.error('Elevation map load error', err)
        const message = err?.message ?? 'Unable to load elevation map snapshot.'
        const fallback = buildFallbackSnapshot()
        setSnapshot(fallback)
        if (typeof message === 'string' && message.toLowerCase().includes('failed to fetch')) {
          setError(null)
          setBanner('Unable to reach the Elevation service. Showing sample data until the connection is restored.')
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
      }
    }
    void fuse()
  }, [clientId])

  useEffect(() => {
    if (!actionHint) return
    const timeout = setTimeout(() => setActionHint(null), 3200)
    return () => clearTimeout(timeout)
  }, [actionHint])

  useEffect(() => {
    if (!clientId) return
    let active = true
    const fetchCheckin = async () => {
      try {
        const { data, error: checkinError } = await supabase
          .from('checkins' as any)
          .select('id, date, readiness_0_100, attendance_pct, pillars_json, flags')
          .eq('client_id', clientId)
          .order('date', { ascending: false })
          .limit(8)
        if (!active) return
        if (checkinError) {
          console.error('Elevation map checkin fetch error', checkinError)
          setLatestCheckin(null)
          setRecentCheckins([])
          return
        }
        const rows = Array.isArray(data) ? (data as unknown as any[]) : []
        setLatestCheckin(rows.length > 0 ? (rows[0] as PulseCheckin) : null)
        setRecentCheckins(rows.slice().reverse().map((r) => ({
          date: r.date,
          readiness_0_100: r.readiness_0_100 ?? null,
          attendance_pct: r.attendance_pct ?? null,
          pillars_json: r.pillars_json ?? null
        })))
      } catch (err) {
        if (!active) return
        console.error('Elevation map checkin fetch error', err)
        setLatestCheckin(null)
        setRecentCheckins([])
      }
    }
    void fetchCheckin()
    return () => {
      active = false
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) {
      setSmartGoal(null)
      setInbodyHistory([])
      setVitalsHistory([])
      setScreenHistory([])
      return
    }
    let active = true
    const load = async () => {
      try {
        const { data: sessionRow } = await (supabase as any)
          .from('elevate_session' as any)
          .select('id')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!active) return
        const sessionId = sessionRow?.id ?? null
        if (sessionId) {
          const [
            { data: goalRow },
            { data: inbodyRows },
            { data: vitalsRows }
          ] = await Promise.all([
            (supabase as any)
              .from('elevate_goals' as any)
              .select('goal_type,specific,measurable,achievable,relevant,time_bound,non_negs,horizon,workouts_per_week')
              .eq('session_id', sessionId)
              .maybeSingle(),
            (supabase as any)
              .from('inbody_history' as any)
              .select('created_at, waist_to_height, waist_cm, weight_kg, body_fat_pct')
              .eq('client_id', clientId)
              .order('created_at', { ascending: false })
              .limit(12),
            (supabase as any)
              .from('vitals' as any)
              .select('created_at, bp_sys, bp_dia, resting_hr')
              .eq('client_id', clientId)
              .order('created_at', { ascending: false })
              .limit(12)
          ])
          if (!active) return
          setSmartGoal(goalRow ? {
            goal_type: goalRow.goal_type ?? null,
            specific: goalRow.specific ?? null,
            measurable: goalRow.measurable ?? null,
            achievable: goalRow.achievable ?? null,
            relevant: goalRow.relevant ?? null,
            time_bound: goalRow.time_bound ?? null,
            non_negs: Array.isArray(goalRow.non_negs) ? goalRow.non_negs : [],
            horizon: goalRow.horizon ?? null,
            workouts_per_week: goalRow.workouts_per_week ?? null
          } : null)
          setInbodyHistory(Array.isArray(inbodyRows) ? [...inbodyRows].reverse().map((row: any) => ({
            date: row.created_at ?? null,
            waist_to_height: typeof row.waist_to_height === 'number' ? row.waist_to_height : null,
            waist_cm: typeof row.waist_cm === 'number' ? row.waist_cm : null,
            weight_kg: typeof row.weight_kg === 'number' ? row.weight_kg : null,
            body_fat_pct: typeof row.body_fat_pct === 'number' ? row.body_fat_pct : null
          })) : [])
          setVitalsHistory(Array.isArray(vitalsRows) ? [...vitalsRows].reverse().map((row: any) => ({
            date: row.created_at ?? null,
            bp_sys: typeof row.bp_sys === 'number' ? row.bp_sys : null,
            bp_dia: typeof row.bp_dia === 'number' ? row.bp_dia : null,
            resting_hr: typeof row.resting_hr === 'number' ? row.resting_hr : null
          })) : [])
        } else {
          setSmartGoal(null)
          setInbodyHistory([])
          setVitalsHistory([])
        }

        const { data: screenRows } = await (supabase as any)
          .from('movement_screen' as any)
          .select('id, recorded_at, pattern, overall_score_0_3, movement_kpi_logs(key,pass,score_0_3)')
          .eq('client_id', clientId)
          .order('recorded_at', { ascending: false })
          .limit(5)
        if (!active) return
        setScreenHistory(Array.isArray(screenRows) ? [...screenRows].reverse().map((row: any) => ({
          id: row.id,
          recorded_at: row.recorded_at ?? new Date().toISOString(),
          pattern: row.pattern ?? null,
          overall_score_0_3: typeof row.overall_score_0_3 === 'number' ? row.overall_score_0_3 : null,
          kpis: Array.isArray(row.movement_kpi_logs)
            ? row.movement_kpi_logs.map((kpi: any) => ({
              key: kpi.key,
              pass: Boolean(kpi.pass),
              score_0_3: typeof kpi.score_0_3 === 'number' ? kpi.score_0_3 : null
            }))
            : []
        })) : [])
      } catch (err) {
        console.error('Elevation map consult/screen load error', err)
        if (!active) return
        setSmartGoal(null)
        setInbodyHistory([])
        setVitalsHistory([])
        setScreenHistory([])
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [clientId])

  const tiles = snapshot?.tiles
  const priorities = snapshot?.priorities
  const plan = snapshot?.plan

  const showConsult = tab === 'consult' || tab === 'all'
  const showScreen = tab === 'screen' || tab === 'all'
  const showPulse = tab === 'pulse' || tab === 'all'

  const setTab = (next: 'consult'|'screen'|'pulse'|'all') => {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    setParams(p, { replace: true })
  }

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    const baseUrl = `${window.location.origin}${window.location.pathname}`
    const shareUrl = clientId ? `${baseUrl}?clientId=${clientId}` : window.location.href
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Elevation Map', url: shareUrl })
        setActionHint('Shared elevation map link.')
        return
      }
    } catch {
      setActionHint('Share canceled.')
      return
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        setActionHint('Link copied to clipboard.')
        return
      }
    } catch {
      setActionHint('Unable to copy link.')
      return
    }
    setActionHint('Share unavailable on this device.')
  }, [clientId])

  const triggerSnapshotRefresh = useCallback(async () => {
    if (!clientId) {
      setActionHint('Add a client before refreshing the snapshot.')
      return
    }
    setRefreshingSnapshot(true)
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          clearTimeout(timeout)
          resolve(null)
        }, 900)
      })
      setActionHint('Snapshot refresh queued. Automation will update shortly.')
    } finally {
      setRefreshingSnapshot(false)
    }
  }, [clientId])

  const Sparkline = ({
    values,
    color = '#3FAE52',
    width = 240,
    height = 56,
    min,
    max,
    strokeWidth = 2,
    placeholder = 'No data yet.'
  }: {
    values: Array<number | null | undefined>
    color?: string
    width?: number
    height?: number
    min?: number
    max?: number
    strokeWidth?: number
    placeholder?: string
  }) => {
    const pad = 6
    const numeric = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (numeric.length === 0) {
      return <div className="text-xs text-muted-foreground">{placeholder}</div>
    }
    const computedMin = typeof min === 'number' ? min : Math.min(...numeric)
    const computedMax = typeof max === 'number' ? max : Math.max(...numeric)
    const span = computedMax - computedMin || 1
    const pts: Array<[number, number]> = numeric.map((value, idx) => {
      const x = numeric.length === 1 ? width / 2 : pad + ((width - 2 * pad) * idx) / (numeric.length - 1)
      const clamped = Math.max(computedMin, Math.min(computedMax, value))
      const y = pad + (height - 2 * pad) * (1 - (clamped - computedMin) / span)
      return [x, y]
    })
    const d = pts.reduce((acc, [x, y], i) => (i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`), '')
    return (
      <svg width={width} height={height} className="overflow-visible" aria-hidden="true" role="presentation">
        <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={strokeWidth + 0.5} fill={color} />
        ))}
      </svg>
    )
  }

  const formatNumber = (value: number | null, digits = 1, suffix = '') => {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(digits)}${suffix}`
  }

  const formatDelta = (value: number | null, digits = 1, suffix = '') => {
    if (value == null || !Number.isFinite(value)) return '—'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(digits)}${suffix}`
  }

  const formatDate = (iso: string | null | undefined, fallback = '—') => {
    if (!iso) return fallback
    const dt = new Date(iso)
    if (Number.isNaN(dt.valueOf())) return fallback
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const summarizeTrend = (values: Array<number | null | undefined>) => {
    const numeric = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (numeric.length === 0) return { latest: null as number | null, delta: null as number | null }
    const latest = numeric[numeric.length - 1]
    const delta = numeric.length >= 2 ? latest - numeric[numeric.length - 2] : null
    return { latest, delta }
  }

  const priorityLabels = useMemo(() => {
    if (!priorities) return []
    return priorities.highlights.map((key) => movementPriorityLabel[key] ?? key)
  }, [priorities])

  const AttendanceRing = ({ percent, deltaLabel }: { percent: number | null; deltaLabel?: string | null }) => {
    const normalized = percent != null && Number.isFinite(percent) ? clampNumber(percent, 0, 100) : null
    const size = 200
    const radius = 72
    const center = size / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = normalized != null ? circumference * (1 - normalized / 100) : circumference
    const accessibleLabel = normalized != null ? `Session follow-through ${Math.round(normalized)} percent.` : 'Session follow-through data unavailable.'
    const accessibleDelta = deltaLabel ? ` ${deltaLabel.replace('Δ', 'Change')}.` : ''
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)] print:shadow-none print:border-slate-200" role="group">
        <span className="sr-only">{`${accessibleLabel}${accessibleDelta}`}</span>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session follow-through</span>
          {deltaLabel && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{deltaLabel}</span>}
        </div>
        <div className="mt-4 flex flex-col items-center gap-4">
          <svg width={size} height={size} className="-mt-2" aria-hidden="true" role="presentation">
            <defs>
              <linearGradient id="attendanceRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={BRAND.emerald} />
                <stop offset="50%" stopColor={BRAND.sky} />
                <stop offset="100%" stopColor={BRAND.violet} />
              </linearGradient>
            </defs>
            <circle cx={center} cy={center} r={radius} stroke="rgba(203,213,225,0.5)" strokeWidth={16} fill="none" />
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="url(#attendanceRingGradient)"
              strokeWidth={16}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              fill="none"
              transform={`rotate(-90 ${center} ${center})`}
            />
            <text x={center} y={center - 6} textAnchor="middle" className="text-[48px] font-semibold" fill={BRAND.forest} dominantBaseline="middle">
              {normalized != null ? Math.round(normalized) : '—'}
            </text>
            <text x={center} y={center + 28} textAnchor="middle" className="text-sm font-medium" fill="#475569" dominantBaseline="middle">
              % of sessions
            </text>
          </svg>
          <p className="text-sm text-slate-600 text-center">
            {normalized != null ? 'Great work—keep protecting their training slots like gold.' : 'Log weekly sessions to start tracking their follow-through.'}
          </p>
        </div>
      </div>
    )
  }

  const habitConsistency = useMemo(() => {
    if (!latestCheckin?.pillars_json) return null
    return habitConsistencyFromPillars(latestCheckin.pillars_json)
  }, [latestCheckin])

  const waistTrend = useMemo(() => inbodyHistory.map((row) => (typeof row.waist_to_height === 'number' ? row.waist_to_height : null)), [inbodyHistory])
  const waistSummary = useMemo(() => summarizeTrend(waistTrend), [waistTrend])

  const restingHrTrend = useMemo(() => vitalsHistory.map((row) => (typeof row.resting_hr === 'number' ? row.resting_hr : null)), [vitalsHistory])
  const restingHrSummary = useMemo(() => summarizeTrend(restingHrTrend), [restingHrTrend])

  const attendanceTrend = useMemo(() => recentCheckins.map((row) => (typeof row.attendance_pct === 'number' ? row.attendance_pct : null)), [recentCheckins])
  const attendanceSummary = useMemo(() => summarizeTrend(attendanceTrend), [attendanceTrend])

  const readinessTrend = useMemo(() => recentCheckins.map((row) => (typeof row.readiness_0_100 === 'number' ? row.readiness_0_100 : null)), [recentCheckins])
  const readinessSummary = useMemo(() => summarizeTrend(readinessTrend), [recentCheckins])

  const pillarTrends = useMemo(() => {
    const keys = Object.keys(PILLAR_META) as PillarKey[]
    return keys.reduce((acc, key) => {
      acc[key] = recentCheckins.map((row) => {
        const value = row.pillars_json?.[key]
        return typeof value === 'number' ? value : null
      })
      return acc
    }, {} as Record<PillarKey, Array<number | null>>)
  }, [recentCheckins])

  const pillarCompositeTrend = useMemo(() => {
    const keys = Object.keys(PILLAR_META) as PillarKey[]
    const length = recentCheckins.length
    const values: Array<number | null> = []
    for (let i = 0; i < length; i += 1) {
      let sum = 0
      let count = 0
      for (const key of keys) {
        const val = pillarTrends[key]?.[i]
        if (typeof val === 'number' && Number.isFinite(val)) {
          sum += val * 25
          count += 1
        }
      }
      values.push(count ? sum / count : null)
    }
    return values
  }, [pillarTrends, recentCheckins.length])

  const habitSummary = useMemo(() => summarizeTrend(pillarCompositeTrend), [pillarCompositeTrend])

  const habitDisplay = useMemo(() => {
    if (habitConsistency != null) return clampNumber(habitConsistency, 0, 100)
    if (tiles?.habits?.consistency_pct != null && Number.isFinite(tiles.habits.consistency_pct)) return clampNumber(tiles.habits.consistency_pct, 0, 100)
    if (habitSummary.latest != null) return Math.round(habitSummary.latest)
    return null
  }, [habitConsistency, tiles, habitSummary])

  const pillarScore = habitDisplay

  const pulseBadges = useMemo(() => badgesFromCheckinFlags(latestCheckin?.flags), [latestCheckin])

  const latestReadiness = useMemo(() => latestNumeric(readinessTrend), [readinessTrend])
  const latestAttendance = useMemo(() => latestNumeric(attendanceTrend), [attendanceTrend])
  const movementQualityScore = useMemo(() => scoreFromMovementQuality(tiles?.movement?.quality_score ?? null), [tiles])
  const attendanceScore = useMemo(() => scoreFromAttendance(latestAttendance), [latestAttendance])
  const safetyScore = useMemo(() => scoreFromSafetyStatus(tiles?.safety?.status ?? null), [tiles])
  const goalScore = useMemo(() => scoreFromGoalCompletion(smartGoal), [smartGoal])
  const readinessScore = useMemo(() => (latestReadiness != null ? clampNumber(latestReadiness, 0, 100) : null), [latestReadiness])
  const waistScore = useMemo(() => scoreFromWaistHeight(latestNumeric(waistTrend)), [waistTrend])
  const gripScore = useMemo(() => scoreFromGripDelta(tiles?.grip?.delta_pct ?? null), [tiles])
  const bpScore = useMemo(() => {
    const latest = vitalsHistory.length ? vitalsHistory[vitalsHistory.length - 1] : null
    return latest ? scoreFromBloodPressure(latest.bp_sys ?? null, latest.bp_dia ?? null) : null
  }, [vitalsHistory])
  const hrScore = useMemo(() => scoreFromRestingHr(restingHrSummary.latest), [restingHrSummary])
  const vitalsScore = useMemo(() => {
    const values = [bpScore, hrScore].filter((val): val is number => typeof val === 'number')
    if (!values.length) return null
    return clampNumber(values.reduce((acc, val) => acc + val, 0) / values.length, 0, 100)
  }, [bpScore, hrScore])
  const flagScore = useMemo(() => scoreFromFlags(latestCheckin?.flags), [latestCheckin])

  const readinessDeltaLabel = readinessSummary.delta != null ? formatDeltaBadge(readinessSummary.delta, '%', 0) : null
  const attendanceDeltaLabel = attendanceSummary.delta != null ? formatDeltaBadge(attendanceSummary.delta, '%', 0) : null
  const habitsDeltaLabel = habitSummary.delta != null ? formatDeltaBadge(habitSummary.delta, '%', 0) : null

  const pillarMomentum = useMemo(() => {
    const entries = Object.entries(PILLAR_META) as Array<[PillarKey, { label: string; color: string }]>
    return entries.map(([key, meta]) => {
      const source = pillarTrends[key] ?? []
      const values = source.map((val) => (typeof val === 'number' ? clampNumber(val * 25, 0, 100) : null))
      const summary = summarizeTrend(values)
      return {
        key,
        label: meta.label,
        color: meta.color,
        copy: PILLAR_COPY[key],
        values,
        latest: summary.latest != null ? Math.round(summary.latest) : null,
        deltaLabel: summary.delta != null ? formatDeltaBadge(summary.delta, '%', 0) : null,
        deltaRaw: summary.delta ?? null
      }
    })
  }, [pillarTrends])

  const readinessHistory = useMemo(
    () =>
      recentCheckins.map((row) => ({
        value: typeof row.readiness_0_100 === 'number' ? clampNumber(row.readiness_0_100, 0, 100) : null,
        label: formatDate(row.date ?? null)
      })),
    [recentCheckins]
  )

  const ReadinessAreaChart = ({
    history,
    latest,
    deltaLabel
  }: {
    history: Array<{ value: number | null; label: string }>
    latest: number | null
    deltaLabel?: string | null
  }) => {
    const width = 380
    const height = 220
    const padX = 18
    const padY = 20
    const baseline = height - 38
    const points = history
      .map((entry, idx) => ({ ...entry, idx }))
      .filter((entry): entry is { value: number; label: string; idx: number } => entry.value != null)

    const accessibilityText = latest != null ? `Average readiness ${Math.round(latest)} percent.` : 'Readiness history unavailable.'
    const areaPath = useMemo(() => {
      if (points.length === 0) return null
      const pathPoints = points.map((entry, idx) => {
        const x = points.length === 1 ? width / 2 : padX + ((width - padX * 2) * idx) / (points.length - 1)
        const y = padY + (baseline - padY) * (1 - clampNumber(entry.value, 0, 100) / 100)
        return { x, y, label: entry.label }
      })
      let area = `M ${pathPoints[0].x} ${baseline} `
      let line = `M ${pathPoints[0].x} ${pathPoints[0].y}`
      for (let i = 0; i < pathPoints.length; i += 1) {
        area += `L ${pathPoints[i].x} ${pathPoints[i].y} `
        line += ` L ${pathPoints[i].x} ${pathPoints[i].y}`
      }
      area += `L ${pathPoints[pathPoints.length - 1].x} ${baseline} Z`
      return { area, line, pathPoints }
    }, [points, width, padX, padY, baseline])

    const tickIndices = useMemo(() => {
      if (!areaPath) return []
      const { pathPoints } = areaPath
      if (pathPoints.length <= 3) return pathPoints.map((_, idx) => idx)
      const mid = Math.floor((pathPoints.length - 1) / 2)
      return [0, mid, pathPoints.length - 1]
    }, [areaPath])

    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)] print:shadow-none print:border-slate-200" role="group">
        <span className="sr-only">{accessibilityText}</span>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recovery pulse trend</span>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{latest != null ? `${Math.round(latest)}%` : '—'}</div>
            <p className="text-xs text-slate-500">Recent readiness check-ins (higher = more recovered)</p>
          </div>
          {deltaLabel && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{deltaLabel}</span>}
        </div>
        <div className="mt-6">
          {!areaPath ? (
            <p className="text-sm text-slate-500">Capture two Pulse check-ins to light up this trend.</p>
          ) : (
            <svg width={width} height={height} className="overflow-visible" aria-hidden="true" role="presentation">
              <defs>
                <linearGradient id="readinessAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={BRAND.emerald} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND.sky} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <path d={areaPath.area} fill="url(#readinessAreaGradient)" stroke="none" />
              <path d={areaPath.line} fill="none" stroke={BRAND.emerald} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              {areaPath.pathPoints.map((pt, idx) => (
                <circle key={idx} cx={pt.x} cy={pt.y} r={4} fill="white" stroke={BRAND.emerald} strokeWidth={2} />
              ))}
              <line x1={padX} y1={baseline} x2={width - padX} y2={baseline} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
              {tickIndices.map((tickIdx) => {
                const pt = areaPath.pathPoints[tickIdx]
                return (
                  <text key={tickIdx} x={pt.x} y={baseline + 18} textAnchor="middle" className="text-[11px] font-medium text-slate-500">
                    {points[tickIdx]?.label ?? ''}
                  </text>
                )
              })}
            </svg>
          )}
        </div>
      </div>
    )
  }

  const heroMetrics = useMemo<HeroMetric[]>(() => {
    const formattedWaist = waistSummary.latest != null ? `${waistSummary.latest.toFixed(2)}` : '—'
    const waistDelta = waistSummary.delta != null ? formatDeltaBadge(-waistSummary.delta, '', 2) : null
    const restingDisplay = restingHrSummary.latest != null ? `${Math.round(restingHrSummary.latest)} bpm` : '—'
    const readinessDelta = readinessDeltaLabel
    const attendanceDelta = attendanceDeltaLabel
    const habitsDelta = habitsDeltaLabel
    const gripDeltaLabel = tiles?.grip?.delta_pct != null ? formatDeltaBadge(tiles.grip.delta_pct, '%', 1) : null
    return [
      {
        id: 'readiness',
        label: 'Recovery Pulse',
        score: readinessScore,
        weight: 18,
        color: '#3FAE52',
        display: readinessScore != null ? `${Math.round(readinessScore)}%` : '—',
        deltaLabel: readinessDelta,
        description: 'How recharged they feel today. Keep sleep + stress dialed to lift this number.'
      },
      {
        id: 'movement',
        label: 'Movement Quality',
        score: movementQualityScore,
        weight: 14,
        color: '#0ea5e9',
        display: movementQualityScore != null ? `${Math.round(movementQualityScore)}%` : '—',
        deltaLabel: tiles?.movement?.quality_score != null ? `Score ${tiles.movement.quality_score.toFixed(1)}/3` : null,
        description: 'Technique from the last movement screen. Celebrate wins, fix the weakest pattern next.'
      },
      {
        id: 'habits',
        label: 'Habit Momentum',
        score: pillarScore,
        weight: 12,
        color: '#22c55e',
        display: habitDisplay != null ? `${habitDisplay}%` : '—',
        deltaLabel: habitsDelta,
        description: 'Consistency on movement, nutrition, sleep, stress. Nudge one pillar per week.'
      },
      {
        id: 'attendance',
        label: 'Session Follow-Through',
        score: attendanceScore,
        weight: 10,
        color: '#2563eb',
        display: latestAttendance != null ? `${Math.round(latestAttendance)}%` : '—',
        deltaLabel: attendanceDelta,
        description: 'How often they show up. Treat workouts like non-negotiable calendar dates.'
      },
      {
        id: 'body_comp',
        label: 'Body Composition',
        score: waistScore,
        weight: 10,
        color: '#9333ea',
        display: formattedWaist,
        deltaLabel: waistDelta,
        description: 'Waist-to-height trend. Celebrate every notch closer to their target zone.'
      },
      {
        id: 'vitals',
        label: 'Vitals Resilience',
        score: vitalsScore,
        weight: 10,
        color: '#ef4444',
        display: restingDisplay,
        deltaLabel: restingHrSummary.delta != null ? formatDeltaBadge(-restingHrSummary.delta, ' bpm', 0) : null,
        description: 'Heart rate and blood pressure trends. Use breathwork + recovery walks to keep it green.'
      },
      {
        id: 'strength',
        label: 'Strength Momentum',
        score: gripScore,
        weight: 8,
        color: '#f97316',
        display: tiles?.grip?.delta_pct != null ? `${tiles.grip.delta_pct.toFixed(1)}%` : '—',
        deltaLabel: gripDeltaLabel,
        description: 'Grip change since consult. Stronger hands = stronger lifts and day-to-day confidence.'
      },
      {
        id: 'goals',
        label: 'Goal Clarity',
        score: goalScore,
        weight: 8,
        color: '#a855f7',
        display: goalScore != null ? `${Math.round(goalScore)}%` : '—',
        deltaLabel: smartGoal?.horizon ?? null,
        description: 'How dialed their SMART goal is. Make the roadmap vivid and celebrate milestones.'
      },
      {
        id: 'narrative',
        label: 'Momentum Story',
        score: flagScore,
        weight: 6,
        color: '#14b8a6',
        display: flagScore != null ? `${Math.round(flagScore)}%` : '—',
        deltaLabel: pulseBadges.length ? `${pulseBadges.length} wins` : null,
        description: 'Headlines from recent check-ins. Double down on wins, clear blockers fast.'
      },
      {
        id: 'safety',
        label: 'Safety & Clearance',
        score: safetyScore,
        weight: 4,
        color: '#22d3ee',
        display: tiles?.safety?.status ?? 'Unknown',
        deltaLabel: tiles?.safety?.notes ? tiles.safety.notes : null,
        description: 'Green means cleared. Any notes here? Chat with them and adapt the plan.'
      }
    ]
  }, [
    readinessScore,
    readinessSummary,
    movementQualityScore,
    tiles,
    pillarScore,
    habitDisplay,
    attendanceScore,
    latestAttendance,
    attendanceSummary,
    waistScore,
    waistSummary,
    vitalsScore,
    restingHrSummary,
    gripScore,
    goalScore,
    smartGoal,
    flagScore,
    pulseBadges,
    safetyScore,
    habitSummary,
    readinessDeltaLabel,
    attendanceDeltaLabel,
    habitsDeltaLabel
  ])

  const heroScore = useMemo(() => {
    const weighted = heroMetrics
      .filter((metric) => metric.score != null)
      .map((metric) => ({ weight: metric.weight, score: metric.score as number }))
    const totalWeight = weighted.reduce((acc, metric) => acc + metric.weight, 0)
    if (!totalWeight) return null
    const totalScore = weighted.reduce((acc, metric) => acc + (metric.score * metric.weight), 0)
    return totalScore / totalWeight
  }, [heroMetrics])

  const heroKpiMetrics = heroMetrics.filter((metric) => metric.score != null).slice(0, 6)

  const pulseDateLabel = useMemo(() => {
    if (!latestCheckin?.date) return null
    const dt = new Date(latestCheckin.date)
    return Number.isNaN(dt.valueOf()) ? null : dt.toLocaleDateString()
  }, [latestCheckin])

  const heroCallouts = useMemo(() => {
    const items: Array<{ id: string; title: string; body: string; tone: 'positive' | 'attention' }> = []
    if (readinessSummary.latest != null && readinessDeltaLabel) {
      const rising = (readinessSummary.delta ?? 0) > 0
      items.push({
        id: 'readiness-callout',
        title: rising ? 'Recovery climbing' : 'Recovery slipping',
        body: rising
          ? `Readiness is sitting at ${Math.round(readinessSummary.latest)}% and trending up ${readinessDeltaLabel}. Keep reinforcing sleep and stress resets.`
          : `Readiness dipped to ${Math.round(readinessSummary.latest)}% with ${readinessDeltaLabel}. Plan an extra recovery checkpoint this week.`,
        tone: rising ? 'positive' : 'attention'
      })
    }

    if (attendanceSummary.latest != null) {
      const attendanceDelta = attendanceSummary.delta ?? 0
      if (attendanceSummary.latest < 85 || attendanceDelta < -2) {
        items.push({
          id: 'attendance-focus',
          title: 'Attendance needs lift',
          body: `Attendance is ${Math.round(attendanceSummary.latest)}%. Revisit scheduling friction and reset their cadence.`,
          tone: 'attention'
        })
      } else if (attendanceDelta > 2 || attendanceDeltaLabel) {
        items.push({
          id: 'attendance-win',
          title: 'Attendance streak building',
          body: `Attendance is ${Math.round(attendanceSummary.latest)}%${attendanceDeltaLabel ? ` with ${attendanceDeltaLabel}` : ''}. Give kudos and lock their next block.`,
          tone: 'positive'
        })
      }
    }

    if (habitDisplay != null && habitDisplay >= 70) {
      items.push({
        id: 'habit-win',
        title: 'Habits locked in',
        body: `Consistency is holding at ${habitDisplay}%. Layer a micro habit once they keep this streak another week.`,
        tone: 'positive'
      })
    } else if (habitSummary.delta != null && habitSummary.delta < -2) {
      items.push({
        id: 'habit-slide',
        title: 'Habit drift spotted',
        body: `Habit momentum slid ${formatDeltaBadge(habitSummary.delta, '%', 0)}. Highlight one pillar win and tighten the rhythm.`,
        tone: 'attention'
      })
    }

    const orderedPillars = pillarMomentum
      .filter((pillar) => pillar.latest != null)
      .sort((a, b) => (a.latest ?? 0) - (b.latest ?? 0))

    const weakestPillar = orderedPillars[0]
    if (weakestPillar && weakestPillar.latest != null && weakestPillar.latest < 60) {
      items.push({
        id: `${weakestPillar.key}-focus`,
        title: `${weakestPillar.label} is lagging`,
        body: `${weakestPillar.label} is averaging ${weakestPillar.latest}%${weakestPillar.deltaLabel ? ` (${weakestPillar.deltaLabel})` : ''}. Focus a habit stack to rebuild momentum.`,
        tone: 'attention'
      })
    }

    const strongestPillar = orderedPillars[orderedPillars.length - 1]
    if (strongestPillar && strongestPillar.latest != null && strongestPillar.latest >= 80 && strongestPillar.deltaRaw != null && strongestPillar.deltaRaw >= 0) {
      items.push({
        id: `${strongestPillar.key}-strength`,
        title: `${strongestPillar.label} leading`,
        body: `${strongestPillar.label} is cruising at ${strongestPillar.latest}%${strongestPillar.deltaLabel ? ` (${strongestPillar.deltaLabel})` : ''}. Translate that win into the next priority.`,
        tone: 'positive'
      })
    }

    return items.slice(0, 4)
  }, [
    readinessSummary,
    readinessDeltaLabel,
    attendanceSummary,
    attendanceDeltaLabel,
    habitDisplay,
    habitSummary,
    pillarMomentum
  ])

  const narrativeSummary = useMemo(() => {
    const sentences: string[] = []
    if (readinessSummary.latest != null) {
      const deltaText = readinessDeltaLabel ? ` ${readinessDeltaLabel}.` : '.'
      sentences.push(`Recovery is holding at ${Math.round(readinessSummary.latest)}%.${deltaText}`)
    }
    if (attendanceSummary.latest != null) {
      const trendText = attendanceDeltaLabel ? ` ${attendanceDeltaLabel}` : ''
      sentences.push(`Attendance average sits at ${Math.round(attendanceSummary.latest)}%${trendText ? ` (${trendText})` : ''}.`)
    }
    if (habitDisplay != null) {
      sentences.push(`Consistency score now reads ${habitDisplay}%${habitsDeltaLabel ? ` (${habitsDeltaLabel})` : ''}.`)
    }
    if (waistSummary.latest != null) {
      sentences.push(`Waist-to-height is ${waistSummary.latest.toFixed(2)}, ${waistSummary.delta != null ? `shifted ${formatDelta(waistSummary.delta, 2)} since last scan.` : 'steady since last scan.'}`)
    }
    if (restingHrSummary.latest != null) {
      const hrDelta = restingHrSummary.delta != null ? ` (${formatDelta(restingHrSummary.delta, 0, ' bpm')})` : ''
      sentences.push(`Resting HR clocks in at ${Math.round(restingHrSummary.latest)} bpm${hrDelta}.`)
    }

    const risingPillars = pillarMomentum
      .filter((pillar) => pillar.deltaRaw != null && pillar.deltaRaw > 0.5)
      .map((pillar) => pillar.label)
    if (risingPillars.length) {
      sentences.push(`Momentum is building fastest in ${risingPillars.join(', ')}.`)
    }

    return sentences
  }, [
    readinessSummary,
    readinessDeltaLabel,
    attendanceSummary,
    attendanceDeltaLabel,
    habitDisplay,
    habitsDeltaLabel,
    waistSummary,
    restingHrSummary,
    pillarMomentum
  ])

  return (
    <RequireTrainer>
      <Layout>
        {actionHint && (
          <div className="pointer-events-none fixed left-1/2 top-6 z-40 w-full max-w-md -translate-x-1/2 px-4 print:hidden">
            <div className="pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg" role="status">
              {actionHint}
            </div>
          </div>
        )}
        <div className="relative mx-auto max-w-6xl px-6 py-10 space-y-8">
          <div className="absolute inset-x-0 top-0 -z-20 h-[520px] rounded-3xl bg-gradient-to-br from-white via-emerald-50/60 to-white print:hidden" />
          <div className="absolute inset-x-4 top-6 -z-10 h-[440px] rounded-[36px] border border-emerald-100/60 bg-gradient-to-r from-white via-[#f0fdf4] to-white shadow-[0_60px_140px_-80px_rgba(15,118,110,0.35)] print:hidden" />

          <div className="relative grid gap-10 rounded-[36px] border border-emerald-100/60 bg-white/95 px-10 pb-14 pt-14 text-slate-900 shadow-[0_60px_140px_-80px_rgba(15,118,110,0.25)] backdrop-blur print:border print:border-slate-200 print:shadow-none print:bg-white print:px-8 print:py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="max-w-2xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700/90">
                Elevation Map
              </div>
              <h1 className="text-[42px] font-semibold leading-tight tracking-tight text-slate-900">{clientId ? `Today’s Elevation Scorecard` : 'Elevation Map'}</h1>
              <p className="text-base text-slate-600">
                See where their effort is gaining altitude and exactly where to coach next.
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                {pulseDateLabel && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">Last check-in · {pulseDateLabel}</span>}
                {smartGoal?.horizon && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">Goal horizon · {smartGoal.horizon}</span>}
                {tiles?.safety?.status && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">Safety status · {tiles.safety.status}</span>}
                {pulseBadges.slice(0, 2).map((badge) => (
                  <span key={badge} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                    {badge}
                  </span>
                ))}
              </div>
              {loading ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {heroKpiMetrics.map((metric) => (
                    <KpiChip key={metric.id} metric={metric} />
                  ))}
                </div>
              )}
              {!loading && narrativeSummary.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Coach briefing</div>
                  <ul className="mt-2 space-y-2 text-sm text-slate-600">
                    {narrativeSummary.map((sentence, idx) => (
                      <li key={idx}>{sentence}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-6">
              <ImpactDial score={heroScore} metrics={heroMetrics} className="mx-auto lg:mx-0" />
              {!loading && heroCallouts.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">High-impact coaching notes</div>
                  <div className="space-y-3">
                    {heroCallouts.map((callout) => (
                      <div
                        key={callout.id}
                        className={`rounded-xl border px-4 py-3 text-sm ${callout.tone === 'positive' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                      >
                        <div className="font-semibold uppercase tracking-wide text-[11px]">{callout.title}</div>
                        <p className="mt-1 text-slate-700">{callout.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`${sectionShellClass} grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]`}>
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Pillar momentum</h2>
                <p className="text-sm text-slate-600">Four habits that move the dial the fastest. Track how each pillar is trending with every check-in.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {pillarMomentum.map((pillar) => (
                  <div key={pillar.key} className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pillar.color }} />
                          {pillar.label}
                        </span>
                        <div className="text-3xl font-semibold text-slate-900">{pillar.latest != null ? `${pillar.latest}%` : '—'}</div>
                        <p className="text-xs text-slate-500 max-w-[220px]">{pillar.copy}</p>
                      </div>
                      {pillar.deltaLabel && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{pillar.deltaLabel}</span>}
                    </div>
                    <Sparkline values={pillar.values} color={pillar.color} placeholder="Need check-ins to chart." />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {loading ? (
                <div className="h-[260px] rounded-3xl border border-slate-200 bg-slate-100 animate-pulse" />
              ) : (
                <AttendanceRing percent={latestAttendance} deltaLabel={attendanceDeltaLabel} />
              )}
              {loading ? (
                <div className="h-[260px] rounded-3xl border border-slate-200 bg-slate-100 animate-pulse" />
              ) : (
                <ReadinessAreaChart history={readinessHistory} latest={readinessScore} deltaLabel={readinessDeltaLabel} />
              )}
            </div>
          </div>

          {/* Top tabs: hidden on All view for a full-bleed presentation */}
          {tab !== 'all' && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-2">
              {(['all','consult','screen','pulse'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab===key}
                  aria-label={`Show ${key} view`}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${tab===key ? 'bg-[#3FAE52] text-white border-[#3FAE52]' : 'hover:bg-accent focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none'}`}
                >{key === 'all' ? 'All' : key[0].toUpperCase()+key.slice(1)}</button>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!error && banner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {banner}
            </div>
          )}
          {loading && (
            <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">Loading latest snapshot…</div>
          )}

          {snapshot && (
            <div className={`${sectionShellClass} space-y-6`}>
              <div className="flex flex-wrap items-center justify-between gap-4 print:gap-2">
                <div className="text-sm text-muted-foreground">
                  Latest snapshot <span className="font-medium text-foreground">{new Date(snapshot.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-muted"
                    onClick={handleShare}
                  >
                    Share link
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-muted"
                    onClick={handlePrint}
                  >
                    Print / export
                  </button>
                  <button
                    type="button"
                    className={`h-10 rounded-md border px-4 text-sm transition ${refreshingSnapshot ? 'cursor-wait border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700 hover:bg-muted'}`}
                    onClick={triggerSnapshotRefresh}
                    disabled={refreshingSnapshot}
                  >
                    {refreshingSnapshot ? 'Queuing…' : 'Queue refresh'}
                  </button>
                </div>
              </div>

              {/* Consult section */}
              {showConsult && (
                <div id="consult-section" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Safety</div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor(tiles?.safety?.status ?? null)}`}>
                        {tiles?.safety?.status ?? 'Unknown'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tiles?.safety?.notes ?? 'No safety notes logged.'}</p>
                  </div>

                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Goals</div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor(tiles?.goals?.status ?? null)}`}>
                        {tiles?.goals?.status ?? 'Unknown'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tiles?.goals?.notes ?? 'No goal updates logged.'}</p>
                  </div>

                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Habit Consistency</div>
                      <span className="text-lg font-semibold text-foreground">{formatNumber(habitDisplay, 0, '%')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tiles?.habits?.commentary ?? 'No habit notes logged.'}</p>
                  </div>

                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Grip Δ%</div>
                      <span className="text-lg font-semibold text-foreground">{formatNumber(tiles?.grip?.delta_pct ?? null, 1, '%')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tiles?.grip?.commentary ?? 'No grip strength notes logged.'}</p>
                  </div>

                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Body Comp Δ</div>
                      <span className="text-lg font-semibold text-foreground">{formatNumber(tiles?.body_comp?.delta ?? null, 1, '%')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tiles?.body_comp?.commentary ?? 'No body composition notes logged.'}</p>
                  </div>

                  <div className={`${tileClass} md:col-span-2`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">SMART goal snapshot</div>
                      {smartGoal?.goal_type && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{smartGoal.goal_type}</span>
                      )}
                    </div>
                    {smartGoal ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Specific</div>
                          <div className="text-foreground">{smartGoal.specific || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Measurable</div>
                          <div className="text-foreground">{smartGoal.measurable || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Achievable</div>
                          <div className="text-foreground">{smartGoal.achievable || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Relevant</div>
                          <div className="text-foreground">{smartGoal.relevant || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Time-bound</div>
                          <div className="text-foreground">{smartGoal.time_bound || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Horizon</div>
                          <div className="text-foreground">{smartGoal.horizon || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Workouts / week</div>
                          <div className="text-foreground">{smartGoal.workouts_per_week != null ? smartGoal.workouts_per_week : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Non-negotiables</div>
                          {smartGoal.non_negs.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {smartGoal.non_negs.map((item, idx) => (
                                <span key={idx} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{item}</span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-foreground">—</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Capture SMART goal details in the consult to spotlight their “why”.</p>
                    )}
                  </div>

                  <div className={`${tileClass} md:col-span-2`}>
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Health momentum</div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/70">
                          <span>Waist : Height</span>
                          <span className="font-semibold text-foreground">{formatNumber(waistSummary.latest, 2)}</span>
                        </div>
                        <Sparkline values={waistTrend} color="#0891b2" width={220} height={60} min={0.4} max={1.1} placeholder="Log InBody data to trend WAIST." />
                        <div className="text-xs text-muted-foreground">Change vs last: <span className="font-semibold text-foreground">{formatDelta(waistSummary.delta, 2)}</span></div>
                        <div className="text-xs text-muted-foreground">Last InBody: <span className="font-semibold text-foreground">{formatDate(inbodyHistory.length ? inbodyHistory[inbodyHistory.length - 1]?.date : null)}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/70">
                          <span>Resting HR</span>
                          <span className="font-semibold text-foreground">{formatNumber(restingHrSummary.latest, 0, ' bpm')}</span>
                        </div>
                        <Sparkline values={restingHrTrend} color="#ef4444" width={220} height={60} min={40} max={110} placeholder="Record vitals to track recovery." />
                        <div className="text-xs text-muted-foreground">Change vs last: <span className="font-semibold text-foreground">{formatDelta(restingHrSummary.delta, 0, ' bpm')}</span></div>
                        <div className="text-xs text-muted-foreground">Last Vitals: <span className="font-semibold text-foreground">{formatDate(vitalsHistory.length ? vitalsHistory[vitalsHistory.length - 1]?.date : null)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pulse section */}
              {showPulse && (
                <div id="pulse-section" className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {latestCheckin && (
                    <div className={`${tileClass} md:col-span-2`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pulse Check-in</div>
                        <span className="text-xs text-muted-foreground">{pulseDateLabel ?? '—'}</span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Readiness <span className="font-semibold text-foreground">{typeof latestCheckin.readiness_0_100 === 'number' && Number.isFinite(latestCheckin.readiness_0_100) ? latestCheckin.readiness_0_100 : '—'}</span></div>
                        <div>Attendance <span className="font-semibold text-foreground">{typeof latestCheckin.attendance_pct === 'number' && Number.isFinite(latestCheckin.attendance_pct) ? `${latestCheckin.attendance_pct}%` : '—'}</span></div>
                        {habitConsistency != null && (
                          <div>Consistency <span className="font-semibold text-foreground">{habitConsistency}%</span></div>
                        )}
                      </div>
                      {pulseBadges.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-3">
                          {pulseBadges.map((badge) => (
                            <span key={badge} className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Readiness trend</div>
                        <Sparkline values={readinessTrend} min={0} max={100} />
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md border bg-background p-3">
                          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/70">
                            <span>Attendance</span>
                            <span className="font-semibold text-foreground">{attendanceSummary.latest != null ? `${attendanceSummary.latest.toFixed(0)}%` : '—'}</span>
                          </div>
                          <Sparkline values={attendanceTrend} color="#2563eb" min={0} max={100} height={48} />
                          <div className="text-[11px] text-muted-foreground">Change vs last: <span className="font-semibold text-foreground">{attendanceSummary.delta != null ? `${attendanceSummary.delta > 0 ? '+' : ''}${attendanceSummary.delta.toFixed(0)}%` : '—'}</span></div>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/70">
                            <span>Consistency score</span>
                            <span className="font-semibold text-foreground">{habitDisplay != null ? `${habitDisplay}%` : '—'}</span>
                          </div>
                          <Sparkline values={pillarTrends.movement_0_4.map((v)=> v != null ? v * 25 : null)} color="#0ea5e9" min={0} max={100} height={48} placeholder="Track pillars to trend consistency." />
                          <div className="text-[11px] text-muted-foreground">EX last: <span className="font-semibold text-foreground">{pillarTrends.movement_0_4.length ? (pillarTrends.movement_0_4[pillarTrends.movement_0_4.length-1] ?? '—') : '—'}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!latestCheckin && (
                    <div className={`${tileClass} md:col-span-2`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pulse Check-ins</div>
                        <span className="text-xs text-muted-foreground">No recent entries</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Log a quick Pulse check-in to unlock readiness, attendance, and habit momentum insights.</p>
                      <p className="text-xs text-muted-foreground">Capture their energy, stress, sleep, and habit scores after each week to keep the map current.</p>
                    </div>
                  )}
                  <div className={tileClass}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pillar momentum</div>
                      <span className="text-xs text-muted-foreground">Last {recentCheckins.length} check-ins</span>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {(Object.keys(PILLAR_META) as PillarKey[]).map((key) => {
                        const meta = PILLAR_META[key]
                        const values = pillarTrends[key] ?? []
                        const latest = values.length ? values[values.length - 1] : null
                        return (
                          <div key={key} className="rounded-md border bg-background/60 p-3">
                            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground/70">
                              <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />{meta.label}</span>
                              <span className="font-semibold text-foreground">{latest != null ? latest.toFixed(1) : '—'} / 4</span>
                            </div>
                            <Sparkline values={values.map((v) => (v != null ? v * 25 : null))} color={meta.color} min={0} max={100} height={48} placeholder="Log pillar scores to trend." />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Screen section */}
              {showScreen && (
                <div id="screen-section" className="space-y-5">
                  <div className={`${tileClass} space-y-5`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Movement KPI timeline</div>
                      <span className="text-xs text-muted-foreground">Last {screenHistory.length} screens</span>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-emerald-100/70 bg-white/80 shadow-[0_24px_72px_-48px_rgba(15,118,110,0.28)]">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-emerald-50/80 text-emerald-800">
                          <tr className="text-[11px] uppercase tracking-wide">
                            <th className="border-b border-emerald-100 px-4 py-3 text-left font-semibold">Screen</th>
                            <th className="border-b border-emerald-100 px-4 py-3 text-left font-semibold">Overall</th>
                            <th className="border-b border-emerald-100 px-4 py-3 text-left font-semibold">KPI outcomes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {screenHistory.length === 0 ? (
                            <tr>
                              <td className="px-4 py-5 text-center text-slate-500" colSpan={3}>No movement screens captured yet.</td>
                            </tr>
                          ) : (
                            screenHistory.map((screen) => (
                              <tr key={screen.id} className="odd:bg-muted/40">
                                <td className="px-3 py-2 align-top">
                                  <div className="font-semibold text-foreground">{screen.pattern ?? 'Pattern'}</div>
                                  <div className="text-[11px] text-muted-foreground">{formatDate(screen.recorded_at)}</div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    {screen.overall_score_0_3 != null ? `${screen.overall_score_0_3}/3` : '—'}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {screen.kpis.length === 0 ? (
                                      <span className="text-[11px] text-muted-foreground">No KPI logs.</span>
                                    ) : (
                                      screen.kpis.map((kpi) => (
                                        <span
                                          key={`${screen.id}-${kpi.key}`}
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kpi.pass ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                                        >
                                          <span>{movementPriorityLabel[kpi.key] ?? kpi.key}</span>
                                          <span>{kpi.score_0_3 != null ? `${kpi.score_0_3}/3` : ''}</span>
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Priority board</div>
                      {priorities?.rationale.length ? (
                        <ul className="space-y-3 text-sm text-muted-foreground">
                          {priorities.rationale.map((item) => (
                            <li key={item.key} className="rounded border bg-background p-3 space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{movementPriorityLabel[item.key] ?? item.key}</div>
                              <div>{item.why}</div>
                              {item.cues.length > 0 && (
                                <ul className="list-disc pl-4 text-xs space-y-1 text-muted-foreground/80">
                                  {item.cues.map((cue, idx) => (
                                    <li key={idx}>{cue}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No priorities surfaced yet.</p>
                      )}
                    </div>

                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plan of action</div>
                      {plan ? (
                        <div className="space-y-3">
                          <ul className="space-y-2 text-sm text-muted-foreground">
                            {plan.actions.map((action) => (
                              <li key={action.kpi} className="rounded border bg-background p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{movementPriorityLabel[action.kpi] ?? action.kpi}</div>
                                <div>{action.focus}</div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                                  {action.regression && <span className="rounded bg-amber-200/70 px-2 py-0.5">Regression: {action.regression}</span>}
                                  {action.progression && <span className="rounded bg-emerald-200/70 px-2 py-0.5">Progression: {action.progression}</span>}
                                </div>
                              </li>
                            ))}
                          </ul>
                          <div className="rounded border bg-background p-3 text-sm text-muted-foreground">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Notes</div>
                            <div>{plan.notes ?? 'No additional notes.'}</div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Save & apply a screen to populate plan actions.</p>
                      )}
                    </div>
                  </div>

                  <div className={`${tileClass} lg:col-span-1 md:col-span-2`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Movement Quality</div>
                      <span className="text-lg font-semibold text-foreground">{formatNumber(tiles?.movement?.quality_score ?? null, 1)} / 3</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Top priorities</div>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {priorityLabels.length === 0 && <li>No priorities yet.</li>}
                        {priorityLabels.map((label) => (
                          <li key={label} className="flex items-center justify-between gap-2">
                            <span>{label}</span>
                          </li>
                        ))}
                      </ul>
                      {tiles?.movement?.failing_kpis?.length ? (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Watch items</div>
                          <ul className="space-y-2 text-sm text-muted-foreground">
                            {tiles.movement.failing_kpis?.map((kpi) => (
                              <li key={kpi.key} className="rounded border bg-background px-3 py-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{movementPriorityLabel[kpi.key] ?? kpi.key}</div>
                                <div>{kpi.why}</div>
                                {kpi.cues.length > 0 && (
                                  <ul className="mt-2 list-disc pl-4 space-y-1 text-xs text-muted-foreground/80">
                                    {kpi.cues.map((cue, idx) => (
                                      <li key={idx}>{cue}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">All KPIs currently passing.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !snapshot && !error && (
            <div className={`${sectionShellClass} text-sm text-muted-foreground`}>
              <p>No fusion snapshot available yet. Run an Elevate Consult or Movement Screen, then refresh to light up this elevation map.</p>
            </div>
          )}
        </div>
      </Layout>
    </RequireTrainer>
  )
}
