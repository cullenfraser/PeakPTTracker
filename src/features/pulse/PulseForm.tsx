import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ELEVATE_WEIGHTS } from '@/features/elevate/elevate.config'

type ReadinessKey = 'energy'|'soreness'|'sleep'|'stress'

type ScalePrompt = {
  key: ReadinessKey
  title: string
  prompt: string
  help: string
  descriptors: string[]
}

const READINESS_PROMPTS: ScalePrompt[] = [
  {
    key: 'energy',
    title: 'Energy check',
    prompt: 'How energized are they showing up this month?',
    help: 'Score from 0 (drained) to 4 (charged up).',
    descriptors: [
      'Running on empty most days',
      'Energy dips often—hard to stay consistent',
      'Mixed bag; decent about half the time',
      'Generally steady with rare dips',
      'Charged up and ready near-daily'
    ]
  },
  {
    key: 'soreness',
    title: 'Soreness & recovery',
    prompt: 'How is their body feeling between sessions?',
    help: 'Score from 0 (constantly sore) to 4 (recovering fast).',
    descriptors: [
      'Achy and stiff almost every day',
      'Lingering soreness slows training',
      'Manageable soreness after harder days',
      'Mild soreness that clears quickly',
      'Fresh, loose, and ready to move'
    ]
  },
  {
    key: 'sleep',
    title: 'Sleep quality',
    prompt: 'How rested are they feeling from sleep?',
    help: 'Score from 0 (restless) to 4 (deeply restored).',
    descriptors: [
      'Restless nights; under 6 hrs quality sleep',
      'Light sleep; tough to stay asleep',
      'Mixed nights; 6–7 hrs with some wake-ups',
      'Mostly solid; 7+ hrs and feel decent',
      'Sleeping deeply; wake up recharged'
    ]
  },
  {
    key: 'stress',
    title: 'Stress load',
    prompt: 'How heavy does stress feel right now?',
    help: 'Score from 0 (overloaded) to 4 (under control).',
    descriptors: [
      'Overwhelmed daily; no buffer',
      'Stress often derails routines',
      'Manageable but spikes weekly',
      'Mostly handled with a few bumps',
      'Calm, confident, and resilient'
    ]
  }
]

const SLEEP_SCALE_HOURS = [5.5, 6.5, 7, 7.5, 8.5]

const sleepScaleFromHours = (hours: number) => {
  if (!Number.isFinite(hours)) return 2
  let closest = 0
  let min = Number.POSITIVE_INFINITY
  SLEEP_SCALE_HOURS.forEach((target, idx) => {
    const diff = Math.abs(hours - target)
    if (diff < min) {
      closest = idx
      min = diff
    }
  })
  return closest
}

const sleepHoursFromScale = (scale: number) => {
  const idx = Math.min(Math.max(scale, 0), SLEEP_SCALE_HOURS.length - 1)
  return SLEEP_SCALE_HOURS[idx]
}

type PillarPrompt = {
  key: 'movement_0_4'|'nutrition_0_4'|'sleep_0_4'|'stress_0_4'
  title: string
  prompt: string
  help: string
  descriptors: string[]
}

const PILLAR_PROMPTS: PillarPrompt[] = [
  {
    key: 'movement_0_4',
    title: 'Movement consistency',
    prompt: 'Most weeks, how close are they to planned training and activity?',
    help: 'Score from 0 (rarely moving) to 4 (dialed-in sessions + steps).',
    descriptors: [
      'Workouts rarely happen; lots of sedentary days',
      'Momentum is shaky; 1–2 light sessions',
      'On the upswing; more active than not',
      'Almost automatic; sessions rarely missed',
      'Locked in; training & NEAT hit every week'
    ]
  },
  {
    key: 'nutrition_0_4',
    title: 'Nutrition rhythm',
    prompt: 'How steady are their food choices with protein, produce, and hydration?',
    help: 'Score from 0 (inconsistent) to 4 (dialed in).',
    descriptors: [
      'Meals are hit-or-miss; little structure',
      'Some wins, but lots of reactive choices',
      'Balanced most days with a few gaps',
      'On point; meals prepped and purposeful',
      'Consistent habit stack supporting goals'
    ]
  },
  {
    key: 'sleep_0_4',
    title: 'Sleep habits',
    prompt: 'How consistent are sleep duration and wind-down routines?',
    help: 'Score from 0 (erratic) to 4 (rock-solid).',
    descriptors: [
      'Bedtime varies; under-slept often',
      'Trying, but late nights are common',
      'Mostly consistent with some disruptions',
      'Dialed bedtime and wake routine',
      'Elite sleep hygiene; wake up restored'
    ]
  },
  {
    key: 'stress_0_4',
    title: 'Stress resilience',
    prompt: 'How well are they using routines to stay grounded?',
    help: 'Score from 0 (no tools) to 4 (go-to resets locked in).',
    descriptors: [
      'Stress snowballs; coping tools missing',
      'Some resets, but inconsistent',
      'Have tools, using them half the time',
      'Go-to resets happen most days',
      'Stress rarely derails momentum'
    ]
  }
]

type GoalUpdate = {
  goal_id: string | null
  status: 'on_track'|'at_risk'|'stalled'
  note?: string
  metric_update?: { value: number|null; unit?: string|null } | null
}

type SmartGoalDetails = {
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

const GOAL_PROGRESS_DESCRIPTORS = [
  '0 — Blocked. No traction yet; needs a reset.',
  '1 — Heavy lift. Action is sporadic and fragile.',
  '2 — Mixed momentum. Wins and misses are even.',
  '3 — Mostly on pace. A few gaps to tighten.',
  '4 — Crushing it. Ready to celebrate and layer the next move.',
]

const scoreFromStatus = (status: GoalUpdate['status']): number => {
  switch (status) {
    case 'on_track':
      return 4
    case 'at_risk':
      return 2
    default:
      return 0
  }
}

const statusFromScore = (score: number): GoalUpdate['status'] => {
  if (score >= 3) return 'on_track'
  if (score >= 1) return 'at_risk'
  return 'stalled'
}

type Props = { clientId: string | null; showSubmitCTA?: boolean }

export default function PulseForm({ clientId, showSubmitCTA = true }: Props) {
  const navigate = useNavigate()
  const [monthLabel, setMonthLabel] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [trainerName, setTrainerName] = useState<string>('')
  const [loadingContext, setLoadingContext] = useState(false)

  const [energy, setEnergy] = useState<number>(2)
  const [soreness, setSoreness] = useState<number>(1)
  const [sleepHours, setSleepHours] = useState<number>(7)
  const [stress, setStress] = useState<number>(1)
  const [readinessIdx, setReadinessIdx] = useState(0)
  const [goalIdx, setGoalIdx] = useState(0)
  const [step3Stage, setStep3Stage] = useState<'goals'|'pillars'>('goals')
  const [metricsIdx, setMetricsIdx] = useState(0)
  const [parqIdx, setParqIdx] = useState(0)
  const [kpiIdx, setKpiIdx] = useState(0)
  const [reflectionIdx, setReflectionIdx] = useState(0)

  const [sessionsPlanned, setSessionsPlanned] = useState<number>(8)
  const [sessionsDone, setSessionsDone] = useState<number>(6)

  const attendancePct = useMemo(() => {
    if (!sessionsPlanned || sessionsPlanned <= 0) return 0
    return Math.round((sessionsDone / sessionsPlanned) * 100)
  }, [sessionsPlanned, sessionsDone])

  const [weightKg, setWeightKg] = useState<number | ''>('')
  const [smmKg, setSmmKg] = useState<number | ''>('')
  const [bodyFatPct, setBodyFatPct] = useState<number | ''>('')
  const [waistCm, setWaistCm] = useState<number | ''>('')
  const [bpSys, setBpSys] = useState<number | ''>('')
  const [bpDia, setBpDia] = useState<number | ''>('')
  const [restingHr, setRestingHr] = useState<number | ''>('')
  const [gripBestKg, setGripBestKg] = useState<number | ''>('')

  const [winText, setWinText] = useState('')
  const [blockerText, setBlockerText] = useState('')
  const [trainerNotes, setTrainerNotes] = useState('')
  const [lastSmartGoal, setLastSmartGoal] = useState<SmartGoalDetails | null>(null)

  // Consult tie-ins
  const [goalsUpdate, setGoalsUpdate] = useState<GoalUpdate[]>([])
  const [pillars0_4, setPillars0_4] = useState<{ movement_0_4:number|null; nutrition_0_4:number|null; sleep_0_4:number|null; stress_0_4:number|null}>({ movement_0_4:null, nutrition_0_4:null, sleep_0_4:null, stress_0_4:null })
  const [parqNewFlags, setParqNewFlags] = useState<string[]>([])
  const [parqClearedFlags, setParqClearedFlags] = useState<string[]>([])
  const parqCodes = ['chest_pain','dizziness','dx_condition','sob_mild','joint_issue','balance_neuro','recent_surgery'] as const
  const [pillarIdx, setPillarIdx] = useState(0)
  const [parqRequiredCodes, setParqRequiredCodes] = useState<string[]>([])
  const parqVisibleCodes = useMemo(() => {
    const set = new Set<string>(parqCodes as unknown as string[])
    return parqRequiredCodes.filter(c => set.has(c))
  }, [parqRequiredCodes])

  // KPI follow-ups
  type FollowAnswer = 'improved'|'same'|'worse'
  const [kpiFollowups, setKpiFollowups] = useState<Record<string, { answer: FollowAnswer; notes?: string }>>({})

  // Scheduling
  const [vacFrom, setVacFrom] = useState<string>('')
  const [vacTo, setVacTo] = useState<string>('')
  const [scheduleNotes, setScheduleNotes] = useState<string>('')
  const [vacationOn, setVacationOn] = useState(false)
  const [missedDates, setMissedDates] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [prevReadiness, setPrevReadiness] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data: session } = await supabase.auth.getUser()
        const uid = session.user?.id
        if (!uid) return
        const { data } = await supabase
          .from('trainers')
          .select('first_name,last_name')
          .eq('user_id', uid)
          .maybeSingle()
        if (!active) return
        if (data) setTrainerName(`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim())
      } catch {}
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!clientId) return
      try {
        const { data: prevPulse } = await (supabase as any)
          .from('checkins')
          .select('pillars_json')
          .eq('client_id', clientId)
          .order('date', { ascending: false })
          .limit(1)
        if (!alive) return
        const pj = Array.isArray(prevPulse) && prevPulse[0]?.pillars_json
        if (pj) {
          setPillars0_4({
            movement_0_4: pj.movement_0_4 ?? null,
            nutrition_0_4: pj.nutrition_0_4 ?? null,
            sleep_0_4: pj.sleep_0_4 ?? null,
            stress_0_4: pj.stress_0_4 ?? null,
          })
        } else {
          const { data: sessions } = await (supabase as any)
            .from('elevate_session')
            .select('id, created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(1)
          const sessionId = Array.isArray(sessions) && sessions[0]?.id
          if (!sessionId) return
          const [{ data: goalsRow }, { data: answers }] = await Promise.all([
            (supabase as any).from('elevate_goals').select('goal_type,specific,measurable,achievable,relevant,time_bound,non_negs,horizon,workouts_per_week').eq('session_id', sessionId).maybeSingle(),
            (supabase as any).from('elevate_answers').select('pillar,item_code,score_0_4').eq('session_id', sessionId),
          ])
          if (!alive) return
          // Load Consult PAR-Q yes items for follow-up filtering
          try {
            const { data: parqRow } = await (supabase as any)
              .from('elevate_parq')
              .select('*')
              .eq('session_id', sessionId)
              .maybeSingle()
            if (parqRow) {
              const yes = (parqCodes as unknown as string[]).filter((k) => Boolean((parqRow as any)?.[k]))
              setParqRequiredCodes(yes)
            }
          } catch {}
          if (goalsRow) {
            setLastSmartGoal({
              goal_type: goalsRow.goal_type ?? null,
              specific: goalsRow.specific ?? null,
              measurable: goalsRow.measurable ?? null,
              achievable: goalsRow.achievable ?? null,
              relevant: goalsRow.relevant ?? null,
              time_bound: goalsRow.time_bound ?? null,
              non_negs: Array.isArray(goalsRow.non_negs) ? goalsRow.non_negs : [],
              horizon: goalsRow.horizon ?? null,
              workouts_per_week: goalsRow.workouts_per_week ?? null,
            })
            if (goalsUpdate.length === 0) setGoalsUpdate([{ goal_id: String(sessionId), status: 'on_track' }])
          }
          if (Array.isArray(answers) && answers.length > 0) {
            const grp: Record<string, number[]> = { EX: [], NU: [], SL: [], ST: [] }
            for (const a of answers) {
              const p = (a as any).pillar
              const s = Number((a as any).score_0_4) || 0
              if (grp[p]) grp[p].push(s)
            }
            const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((x,y)=>x+y,0)/arr.length) : null
            setPillars0_4({
              movement_0_4: avg(grp.EX),
              nutrition_0_4: avg(grp.NU),
              sleep_0_4: avg(grp.SL),
              stress_0_4: avg(grp.ST),
            })
          }
        }
      } catch {}
    })()
    return () => { alive = false }
  }, [clientId])

  // Clamp PAR-Q index to visible list
  useEffect(() => {
    setParqIdx((i) => {
      const max = Math.max(0, parqVisibleCodes.length - 1)
      if (i > max) return max
      return i
    })
  }, [parqVisibleCodes.length])

  // Helper: weighted avg 0-4 from answers by pillar codes
  const weightedAvg = (items: Record<string, number>, codes: readonly string[]) => {
    let s = 0, w = 0
    for (const code of codes) {
      const v = Number(items[code] ?? 0)
      const wt = ELEVATE_WEIGHTS.pillarItemWeights[code] ?? 1
      s += v * wt
      w += wt
    }
    return w > 0 ? +(s / w).toFixed(2) : null
  }

  // Compute readiness (client-side) for pre-submit nudge
  const readinessNow = useMemo(() => {
    const sleep0_4 = (() => {
      const h = Number(sleepHours)
      if (!isFinite(h)) return 2
      if (h >= 8) return 4
      if (h >= 7) return 3
      if (h >= 6) return 2
      if (h >= 5) return 1
      return 0
    })()
    const r = ((energy) + (4 - stress) + (4 - soreness) + sleep0_4) / 4
    return Math.round(r * 25)
  }, [energy, stress, soreness, sleepHours])

  const habitConsistency = useMemo(() => {
    const vals = [pillars0_4.movement_0_4, pillars0_4.nutrition_0_4, pillars0_4.sleep_0_4, pillars0_4.stress_0_4].filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) return null
    const avg = vals.reduce((a,b)=>a+b,0) / vals.length
    return Math.round(avg * 25)
  }, [pillars0_4])

  // Prefill context from latest Consult / History / Screen
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!clientId) return
      setLoadingContext(true)
      try {
        // Latest consult session
        const { data: sessions } = await (supabase as any)
          .from('elevate_session')
          .select('id, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
        const sessionId = sessions && sessions.length > 0 ? sessions[0].id : null

        if (sessionId) {
          const [{ data: goalsRow }, { data: answers }] = await Promise.all([
            (supabase as any).from('elevate_goals').select('*').eq('session_id', sessionId).maybeSingle(),
            (supabase as any).from('elevate_answers').select('item_code, score_0_4').eq('session_id', sessionId),
          ])

          // Goals recap: single SMART goal row stored
          if (goalsRow) {
            setGoalsUpdate([{
              goal_id: sessionId,
              status: 'on_track',
              note: '',
              metric_update: null,
            }])
          }

          // Pillars avg 0-4 per pillar
          const items: Record<string, number> = {}
          for (const a of (answers ?? [])) {
            if (a?.item_code) items[a.item_code] = Math.max(0, Math.min(4, a.score_0_4 ?? 0))
          }
          setPillars0_4({
            movement_0_4: weightedAvg(items, ELEVATE_WEIGHTS.pillarItems.EX),
            nutrition_0_4: weightedAvg(items, ELEVATE_WEIGHTS.pillarItems.NU),
            sleep_0_4: weightedAvg(items, ELEVATE_WEIGHTS.pillarItems.SL),
            stress_0_4: weightedAvg(items, ELEVATE_WEIGHTS.pillarItems.ST),
          })

          // PAR-Q base: we only let user mark changes, so just keep available flags if needed
          // We won't pre-check changes here.
        }

        // History: latest inbody, vitals, grip
        const [ibHist, vitHist, gripHist] = await Promise.all([
          (supabase as any).from('inbody_history').select('weight_kg, body_fat_pct, skeletal_muscle_kg, waist_cm').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
          (supabase as any).from('vitals').select('bp_sys, bp_dia, resting_hr').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
          (supabase as any).from('grip_tests').select('best_kg').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
        ])
        if (Array.isArray(ibHist?.data) && ibHist.data.length > 0) {
          setWeightKg(ibHist.data[0].weight_kg ?? '')
          setBodyFatPct(ibHist.data[0].body_fat_pct ?? '')
          setSmmKg(ibHist.data[0].skeletal_muscle_kg ?? '')
          setWaistCm(ibHist.data[0].waist_cm ?? '')
        }
        if (Array.isArray(vitHist?.data) && vitHist.data.length > 0) {
          setBpSys(vitHist.data[0].bp_sys ?? '')
          setBpDia(vitHist.data[0].bp_dia ?? '')
          setRestingHr(vitHist.data[0].resting_hr ?? '')
        }
        if (Array.isArray(gripHist?.data) && gripHist.data.length > 0) {
          setGripBestKg(gripHist.data[0].best_kg ?? '')
        }

        // Latest screen priorities
        let topK: string[] = []
        const { data: screens } = await (supabase as any)
          .from('movement_screen')
          .select('id, priority_order')
          .eq('client_id', clientId)
          .order('id', { ascending: false })
          .limit(1)
        if (Array.isArray(screens) && screens.length > 0) {
          const arr = Array.isArray(screens[0].priority_order) ? screens[0].priority_order : []
          topK = (arr as string[]).slice(0, 3)
        } else {
          // Fallback: derive from latest KPI logs
          const { data: logs } = await (supabase as any)
            .from('movement_kpi_logs')
            .select('key, score_0_3, pass')
            .order('id', { ascending: false })
            .limit(10)
          const uniq: string[] = []
          for (const r of (logs ?? []).sort((a:any,b:any)=> (a.pass?1:0) - (b.pass?1:0) || a.score_0_3 - b.score_0_3)) {
            if (!uniq.includes(r.key)) uniq.push(r.key)
            if (uniq.length >= 3) break
          }
          topK = uniq
        }
        setKpiFollowups((prev) => {
          const next = { ...prev }
          for (const k of topK) if (!next[k]) next[k] = { answer: 'same' }
          return next
        })

        // Prev readiness from last checkin
        const { data: prev } = await (supabase as any)
          .from('checkins')
          .select('readiness_0_100')
          .eq('client_id', clientId)
          .order('date', { ascending: false })
          .limit(1)
        if (Array.isArray(prev) && prev.length > 0) {
          const rr = Number(prev[0].readiness_0_100)
          setPrevReadiness(isFinite(rr) ? rr : null)
        }
      } finally {
        if (active) setLoadingContext(false)
      }
    })()
    return () => { active = false }
  }, [clientId])

  return (
    <form
      data-pulse-form
      className="space-y-8 pb-24"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!clientId) { setError('Missing clientId'); return }
        setSaving(true)
        try { window.dispatchEvent(new CustomEvent('pulse:saving', { detail: true } as any)) } catch {}
        setError(null)
        setSuccess(null)
        try {
          const payload: any = {
            cadence: 'monthly',
            client_id: clientId,
            month_label: monthLabel,
            trainer_name: trainerName || null,
            energy_0_4: energy,
            soreness_0_4: soreness,
            sleep_hours: sleepHours,
            stress_0_4: stress,
            sessions_planned: sessionsPlanned,
            sessions_done: sessionsDone,
            attendance_pct: attendancePct,
            goals_update: goalsUpdate,
            pillars_json: pillars0_4,
            parq_changes: { new_flags: parqNewFlags, cleared_flags: parqClearedFlags },
            kpi_followups: kpiFollowups,
            weight_kg: weightKg === '' ? null : Number(weightKg),
            inbody_json: {
              body_fat_pct: bodyFatPct === '' ? null : Number(bodyFatPct),
              skeletal_muscle_kg: smmKg === '' ? null : Number(smmKg),
              waist_cm: waistCm === '' ? null : Number(waistCm)
            },
            vitals_json: {
              bp_sys: bpSys === '' ? null : Number(bpSys),
              bp_dia: bpDia === '' ? null : Number(bpDia),
              resting_hr: restingHr === '' ? null : Number(restingHr)
            },
            grip_best_kg: gripBestKg === '' ? null : Number(gripBestKg),
            next_month_planned_sessions: sessionsPlanned,
            schedule_changes: ((vacationOn && (vacFrom || vacTo || scheduleNotes)) || (!vacationOn && (missedDates.length > 0 || scheduleNotes)))
              ? (vacationOn
                ? { vacation_on: true, vacation_from: vacFrom || null, vacation_to: vacTo || null, notes: scheduleNotes || null }
                : { vacation_on: false, missed_dates: missedDates.filter(Boolean), notes: scheduleNotes || null })
              : null,
            win_text: winText || null,
            blocker_text: blockerText || null,
            trainer_notes: trainerNotes || null
          }
          const res = await fetch('/.netlify/functions/checkins-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          if (!res.ok) throw new Error(`Save failed (${res.status})`)
          await res.json()
          setSuccess('Saved')
          if (clientId) {
            try { navigate(`/elevate/map?clientId=${clientId}&tab=pulse`) } catch {}
          }
        } catch (err: any) {
          setError(err?.message || 'Failed to save')
        } finally {
          setSaving(false)
          try { window.dispatchEvent(new CustomEvent('pulse:saving', { detail: false } as any)) } catch {}
        }
      }}
    >
      <section className="space-y-3" data-pulse-step data-step-index="0" id="pulse-step-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 1</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Set the scene</h2>
            <p className="text-sm text-muted-foreground">Confirm the check-in month and who’s coaching this client.</p>
          </div>
          <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
            <label className="text-sm font-medium text-muted-foreground/80">Month
              <input className="mt-2 h-10 w-full rounded-md border px-3" value={monthLabel} onChange={(e)=>setMonthLabel(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-muted-foreground/80">Trainer
              <input className="mt-2 h-10 w-full rounded-md border px-3" value={trainerName} onChange={(e)=>setTrainerName(e.target.value)} />
            </label>
          </div>
          {loadingContext && <div className="px-5 pb-4 text-xs text-muted-foreground">Pulling recent consult + screen context…</div>}
          <div className="px-5 pb-4 flex justify-end">
            <button
              type="button"
              className="px-4 h-10 rounded-md bg-[#3FAE52] text-white"
              onClick={()=>window.dispatchEvent(new Event('pulse:next'))}
            >Continue</button>
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="1" id="pulse-step-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 2</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Readiness snapshot</h2>
            <p className="text-sm text-muted-foreground">Capture how they’re feeling and showing up before you dive into the details.</p>
          </div>
          <div className="grid gap-4 px-5 py-5">
            {readinessIdx < READINESS_PROMPTS.length && (
              <div className="rounded-xl border bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b px-6 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Readiness check</div>
                    <p className="text-xs text-muted-foreground">Quick pulse across energy, recovery, sleep, and stress—each on a 0–4 scale.</p>
                  </div>
                  {prevReadiness != null && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Last month {prevReadiness}</span>
                  )}
                </div>
                <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round((readinessIdx/READINESS_PROMPTS.length)*100)}%` }} /></div>
                <div className="space-y-4 px-6 py-5">
                  {(() => {
                    const prompt = READINESS_PROMPTS[readinessIdx]
                    const value = prompt.key === 'energy' ? energy : prompt.key === 'soreness' ? soreness : prompt.key === 'sleep' ? sleepScaleFromHours(sleepHours) : stress
                    const setValue = (score: number) => {
                      if (prompt.key === 'energy') setEnergy(score)
                      else if (prompt.key === 'soreness') setSoreness(score)
                      else if (prompt.key === 'sleep') setSleepHours(sleepHoursFromScale(score))
                      else setStress(score)
                      if (readinessIdx < READINESS_PROMPTS.length - 1) setReadinessIdx(readinessIdx + 1)
                      else setReadinessIdx(READINESS_PROMPTS.length)
                    }
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">{prompt.title}</div>
                          <div className="text-xs text-muted-foreground">Step {readinessIdx + 1} of {READINESS_PROMPTS.length}</div>
                        </div>
                        <p className="text-sm text-muted-foreground">{prompt.prompt}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{prompt.help}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {[0,1,2,3,4].map((score) => (
                            <button key={score} type="button" className={`h-11 w-11 rounded-md border text-sm font-medium transition ${value === score ? 'border-[#3FAE52] bg-[#3FAE52] text-white shadow-sm' : 'hover:bg-muted/60'}`} onClick={() => setValue(score)}>{score}</button>
                          ))}
                          {prompt.key === 'sleep' && (
                            <div className="rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Avg sleep {sleepHours.toFixed(1)} hrs</div>
                          )}
                        </div>
                        <div className="grid gap-2 md:grid-cols-5 text-[11px] text-muted-foreground">
                          {prompt.descriptors.map((desc, idx) => (
                            <div key={idx} className={`rounded-md border p-2 ${idx === value ? 'border-[#3FAE52] bg-[#3FAE52]/10' : 'border-dashed'}`}>
                              <div className="mb-1 text-xs font-semibold">{idx}</div>
                              <div>{desc}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <button type="button" className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setReadinessIdx(Math.max(0, readinessIdx-1))} disabled={readinessIdx===0}>Back</button>
                          <div className="text-xs text-muted-foreground">Small daily behaviors drive big change.</div>
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                    <span>Readiness this month</span>
                    <span className="font-semibold text-foreground">{readinessNow} / 100</span>
                  </div>
                  {(prevReadiness != null && readinessNow < 55 && prevReadiness < 55) && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">Two lower scores in a row. Consider programming a deload and reinforcing recovery habits.</div>
                  )}
                </div>
              </div>
            )}

            {readinessIdx >= READINESS_PROMPTS.length && (
              <>
                <div className="rounded-xl border bg-white shadow-sm">
                  <div className="border-b px-6 py-4">
                    <div className="text-sm font-semibold text-foreground">Attendance pulse</div>
                    <p className="text-xs text-muted-foreground">Log planned vs. completed sessions. We’ll surface low consistency for you.</p>
                  </div>
                  <div className="space-y-4 px-6 py-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Sessions planned
                        <input type="number" className="mt-2 h-11 w-full rounded-md border px-3" value={sessionsPlanned} onChange={(e)=>setSessionsPlanned(Number(e.target.value))} />
                      </label>
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Sessions completed
                        <input type="number" className="mt-2 h-11 w-full rounded-md border px-3" value={sessionsDone} onChange={(e)=>setSessionsDone(Number(e.target.value))} />
                      </label>
                    </div>
                    <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                      <span>Attendance</span>
                      <span className="font-semibold text-foreground">{attendancePct}%</span>
                    </div>
                    {(attendancePct < 60) && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">Attendance under 60%. Plan an extra accountability touchpoint or tweak cadence.</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>setReadinessIdx(Math.max(0, READINESS_PROMPTS.length - 1))}>Back</button>
                  <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>window.dispatchEvent(new Event('pulse:next'))}>Continue</button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="2" id="pulse-step-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 3</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Goals & habits</h2>
            <p className="text-sm text-muted-foreground">Check each SMART goal and keep lifestyle pillars visible in the conversation.</p>
          </div>
          <div className="px-5 py-4">
            {step3Stage === 'goals' && (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="text-sm font-semibold text-foreground">SMART goal progress</div>
                {goalsUpdate.length > 0 && (
                  <div className="text-xs text-muted-foreground">Step {Math.min(goalIdx+1, goalsUpdate.length)} of {goalsUpdate.length}</div>
                )}
              </div>
              {goalsUpdate.length > 0 ? (
                <>
                  <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round((Math.min(goalIdx, goalsUpdate.length-1)/Math.max(1,goalsUpdate.length))*100)}%` }} /></div>
                  <div className="space-y-4 px-6 py-5">
                    {(() => {
                      const g = goalsUpdate[Math.min(goalIdx, goalsUpdate.length-1)]
                      const score = scoreFromStatus(g.status)
                      const setScore = (s: number) => {
                        const nextStatus = statusFromScore(s)
                        setGoalsUpdate(arr => arr.map((x,i) => i===Math.min(goalIdx, arr.length-1) ? { ...x, status: nextStatus } : x))
                      }
                      return (
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">
                            {lastSmartGoal?.specific
                              ? <>Rate progress for “<span className="font-medium text-foreground">{lastSmartGoal.specific}</span>” this month.</>
                              : <>Rate progress for Goal {Math.min(goalIdx+1, goalsUpdate.length)} this month.</>}
                          </div>
                          <div className="flex items-center gap-2">
                            {[0,1,2,3,4].map(n => (
                              <button key={n} type="button" className={`h-11 w-11 rounded-md border text-sm font-medium transition ${score===n?'border-[#3FAE52] bg-[#3FAE52] text-white shadow-sm':'hover:bg-muted/60'}`} onClick={()=>setScore(n)}>{n}</button>
                            ))}
                          </div>
                          <div className="grid gap-2 md:grid-cols-5 text-[11px] text-muted-foreground">
                            {GOAL_PROGRESS_DESCRIPTORS.map((desc, idx) => (
                              <div key={idx} className={`rounded-md border p-2 ${idx === score ? 'border-[#3FAE52] bg-[#3FAE52]/10' : 'border-dashed'}`}>
                                <div className="mb-1 text-xs font-semibold">{idx}</div>
                                <div>{desc}</div>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-2 md:grid-cols-[140px_1fr]">
                            <div className="text-xs font-semibold text-muted-foreground uppercase">Coach note</div>
                            <input className="h-10 rounded-md border px-3 text-sm" placeholder="Optional note" value={g.note ?? ''} onChange={(e)=>setGoalsUpdate(arr => arr.map((x,i)=> i===Math.min(goalIdx, arr.length-1) ? { ...x, note: e.target.value } : x))} />
                          </div>
                          <div className="rounded-md border p-3 bg-card/50">
                            <div className="text-xs font-semibold text-muted-foreground uppercase">Client's SMART goal</div>
                            <div className="mt-2 grid gap-3 md:grid-cols-2 text-sm">
                              <div><div className="text-xs uppercase text-muted-foreground">Specific</div><div>{lastSmartGoal?.specific || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Measurable</div><div>{lastSmartGoal?.measurable || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Achievable</div><div>{lastSmartGoal?.achievable || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Relevant</div><div>{lastSmartGoal?.relevant || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Time-bound</div><div>{lastSmartGoal?.time_bound || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Horizon</div><div>{lastSmartGoal?.horizon || '—'}</div></div>
                              <div><div className="text-xs uppercase text-muted-foreground">Workouts/week</div><div>{lastSmartGoal?.workouts_per_week ?? '—'}</div></div>
                              <div className="md:col-span-2"><div className="text-xs uppercase text-muted-foreground">Non‑negotiables</div><div>{(lastSmartGoal?.non_negs||[]).filter(Boolean).join(', ') || '—'}</div></div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <button type="button" className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setGoalIdx(Math.max(0, goalIdx-1))} disabled={goalIdx===0}>Back</button>
                            {goalIdx < goalsUpdate.length - 1 ? (
                              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>setGoalIdx(goalIdx+1)}>Next</button>
                            ) : (
                              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>{ setStep3Stage('pillars'); setPillarIdx(0) }}>Continue to pillars</button>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </>
              ) : (
                <div className="px-6 py-5 space-y-3">
                  <div className="text-xs text-muted-foreground">No goals on file—log reflections below if needed.</div>
                  <div className="flex items-center justify-end">
                    <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>{ setStep3Stage('pillars'); setPillarIdx(0) }}>Continue to pillars</button>
                  </div>
                </div>
              )}
            </div>
            )}

            {step3Stage === 'pillars' && (
            <div id="pillars-card" className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="text-sm font-semibold text-foreground">Lifestyle pillars</div>
                {habitConsistency != null && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Habit consistency {habitConsistency}%</span>
                )}
              </div>
              <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round((pillarIdx/PILLAR_PROMPTS.length)*100)}%` }} /></div>
              <div className="space-y-4 px-6 py-5">
                {(() => {
                  const p = PILLAR_PROMPTS[pillarIdx]
                  const value = (pillars0_4 as any)[p.key] ?? 0
                  const setVal = (score: number) => {
                    setPillars0_4(prev => ({ ...prev, [p.key]: score }))
                    if (pillarIdx < PILLAR_PROMPTS.length - 1) setPillarIdx(pillarIdx + 1)
                  }
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-foreground">{p.title}</div>
                        <div className="text-xs text-muted-foreground">Step {pillarIdx + 1} of {PILLAR_PROMPTS.length}</div>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.prompt}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{p.help}</p>
                      <div className="flex items-center gap-2">
                        {[0,1,2,3,4].map(score => (
                          <button key={score} type="button" className={`h-11 w-11 rounded-md border text-sm font-medium transition ${value === score ? 'border-[#3FAE52] bg-[#3FAE52] text-white shadow-sm' : 'hover:bg-muted/60'}`} onClick={()=>setVal(score)}>{score}</button>
                        ))}
                      </div>
                      <div className="grid gap-2 md:grid-cols-5 text-[11px] text-muted-foreground">
                        {p.descriptors.map((desc, idx) => (
                          <div key={idx} className={`rounded-md border p-2 ${idx === value ? 'border-[#3FAE52] bg-[#3FAE52]/10' : 'border-dashed'}`}>
                            <div className="mb-1 text-xs font-semibold">{idx}</div>
                            <div>{desc}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <button type="button" className="px-3 py-2 rounded border" onClick={()=>{ if (pillarIdx === 0) { setStep3Stage('goals') } else { setPillarIdx(Math.max(0, pillarIdx-1)) } }}>Back</button>
                        <div className="text-xs text-muted-foreground">Small daily behaviors drive big change.</div>
                      </div>
                    </div>
                  )
                })()}

                {goalsUpdate.some(g => g.status === 'at_risk') && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">At least one goal is at risk. Pick a supporting habit to reinforce this block.</div>
                )}
                <div className="flex items-center justify-end">
                  <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>window.dispatchEvent(new Event('pulse:next'))}>Continue</button>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="3" id="pulse-step-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 4</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Vitals & InBody</h2>
            <p className="text-sm text-muted-foreground">Capture one metric at a time. Objective data makes your plan precise.</p>
          </div>
          <div className="px-5 py-4">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="text-sm font-semibold text-foreground">Vitals & InBody</div>
                <div className="text-xs text-muted-foreground">Step {metricsIdx + 1} of {8}</div>
              </div>
              <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((metricsIdx+1)/8)*100)}%` }} /></div>
              <div className="space-y-3 px-6 py-5">
                {(() => {
                  const items = [
                    { title: 'Weight (kg)', help: 'From scale.', get: () => weightKg, set: (v: number|'' ) => setWeightKg(v), step: 0.1 },
                    { title: 'Lean muscle (kg)', help: 'SMM from InBody.', get: () => smmKg, set: (v: number|'' ) => setSmmKg(v), step: 0.1 },
                    { title: 'Body fat %', help: 'From InBody or estimate.', get: () => bodyFatPct, set: (v: number|'' ) => setBodyFatPct(v), step: 0.1 },
                    { title: 'Waist (cm)', help: 'At navel, relaxed.', get: () => waistCm, set: (v: number|'' ) => setWaistCm(v), step: 0.1 },
                    { title: 'Systolic blood pressure (mmHg)', help: 'Top number (optional if unknown).', get: () => bpSys, set: (v: number|'' ) => setBpSys(v), step: 1 },
                    { title: 'Diastolic blood pressure (mmHg)', help: 'Bottom number (optional if unknown).', get: () => bpDia, set: (v: number|'' ) => setBpDia(v), step: 1 },
                    { title: 'Resting heart rate (bpm)', help: 'Morning or seated for 5 min.', get: () => restingHr, set: (v: number|'' ) => setRestingHr(v), step: 1 },
                    { title: 'Grip (best kg)', help: 'Best of 2–3 attempts.', get: () => gripBestKg, set: (v: number|'' ) => setGripBestKg(v), step: 0.1 }
                  ] as const
                  const total = items.length
                  const i = Math.min(Math.max(metricsIdx, 0), total-1)
                  const cur = items[i]
                  const goNext = () => { if (i < total - 1) setMetricsIdx(i+1); else window.dispatchEvent(new Event('pulse:next')) }
                  const goPrev = () => { if (i > 0) setMetricsIdx(i-1); else window.dispatchEvent(new Event('pulse:prev')) }
                  const onChange = (e: any) => cur.set(e.target.value === '' ? '' : Number(e.target.value))
                  const onSkip = () => { cur.set('' as any); goNext() }
                  return (
                    <div className="space-y-3">
                      <div className="text-lg font-semibold">{cur.title}</div>
                      <p className="text-sm text-muted-foreground">{cur.help}</p>
                      <input type="number" step={cur.step} className="h-11 w-full rounded-md border px-3" value={(cur.get() as any) ?? ''} onChange={onChange} />
                      <div className="flex items-center justify-between">
                        <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-50" onClick={goPrev} disabled={i===0}>Back</button>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white text-sm" onClick={goNext}>Next</button>
                          <button type="button" className="px-3 py-2 rounded border text-sm" onClick={onSkip}>Skip</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="4" id="pulse-step-5" data-skip={parqVisibleCodes.length === 0 ? 'true' : undefined}>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 5</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">PAR-Q changes</h2>
            <p className="text-sm text-muted-foreground">Review each item one-by-one and flag changes.</p>
          </div>
          <div className="px-5 py-4">
            {parqVisibleCodes.length === 0 ? (
              <div className="hidden" aria-hidden="true" />
            ) : (
              <div className="rounded-xl border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div className="text-sm font-semibold text-foreground">PAR-Q</div>
                  <div className="text-xs text-muted-foreground">Step {parqIdx + 1} of {parqVisibleCodes.length}</div>
                </div>
                <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((parqIdx+1)/parqVisibleCodes.length)*100)}%` }} /></div>
                <div className="space-y-4 px-6 py-5">
                  {(() => {
                    const code = parqVisibleCodes[Math.min(Math.max(parqIdx, 0), parqVisibleCodes.length - 1)]
                    const labels: Record<string,string> = {
                      chest_pain: 'Chest pain with activity',
                      dizziness: 'Dizziness or fainting',
                      dx_condition: 'Diagnosed medical condition',
                      sob_mild: 'Shortness of breath with mild exertion',
                      joint_issue: 'Joint or muscle issue',
                      balance_neuro: 'Balance or neurological issue',
                      recent_surgery: 'Recent surgery'
                    }
                    const isNew = parqNewFlags.includes(code)
                    const isCleared = parqClearedFlags.includes(code)
                    const toggleNew = () => setParqNewFlags(arr => isNew ? arr.filter(x=>x!==code) : [...arr, code])
                    const toggleCleared = () => setParqClearedFlags(arr => isCleared ? arr.filter(x=>x!==code) : [...arr, code])
                    const goNext = () => { if (parqIdx < parqVisibleCodes.length - 1) setParqIdx(parqIdx + 1); else window.dispatchEvent(new Event('pulse:next')) }
                    const goPrev = () => { if (parqIdx > 0) setParqIdx(parqIdx - 1); else window.dispatchEvent(new Event('pulse:prev')) }
                    return (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold">{labels[code] ?? code}</div>
                        <p className="text-sm text-muted-foreground">Mark anything newly observed this month, or confirm if it has been cleared.</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className={`h-10 rounded-md border px-3 text-sm ${isNew ? 'border-[#3FAE52] bg-[#3FAE52] text-white' : ''}`} onClick={toggleNew}>New flag</button>
                          <button type="button" className={`h-10 rounded-md border px-3 text-sm ${isCleared ? 'border-[#3FAE52] bg-[#3FAE52] text-white' : ''}`} onClick={toggleCleared}>Cleared</button>
                        </div>
                        <div className="flex items-center justify-between">
                          <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-50" onClick={goPrev} disabled={parqIdx===0}>Back</button>
                          <div className="flex items-center gap-2">
                            <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white text-sm" onClick={goNext}>Next</button>
                            <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>goNext()}>Skip</button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="5" id="pulse-step-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 6</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">KPI follow-ups</h2>
            <p className="text-sm text-muted-foreground">Check in on each priority KPI one at a time before mapping the next block.</p>
          </div>
          <div className="px-5 py-4">
            {Object.keys(kpiFollowups).length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">No KPI priorities flagged. You can still capture notes in Reflection.</div>
                <div className="flex items-center justify-between">
                  <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>window.dispatchEvent(new Event('pulse:prev'))}>Back</button>
                  <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>window.dispatchEvent(new Event('pulse:next'))}>Continue</button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div className="text-sm font-semibold text-foreground">KPI follow-up</div>
                  <div className="text-xs text-muted-foreground">Step {kpiIdx + 1} of {Object.keys(kpiFollowups).length}</div>
                </div>
                <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((kpiIdx+1)/Object.keys(kpiFollowups).length)*100)}%` }} /></div>
                <div className="space-y-4 px-6 py-5">
                  {(() => {
                    const keys = Object.keys(kpiFollowups)
                    const key = keys[Math.min(Math.max(kpiIdx, 0), keys.length - 1)]
                    const value = kpiFollowups[key]
                    const setAnswer = (v: FollowAnswer) => setKpiFollowups(p => ({ ...p, [key]: { ...p[key], answer: v } }))
                    const setNotes = (txt: string) => setKpiFollowups(p => ({ ...p, [key]: { ...p[key], notes: txt } }))
                    const goNext = () => { if (kpiIdx < keys.length - 1) setKpiIdx(kpiIdx + 1); else window.dispatchEvent(new Event('pulse:next')) }
                    const goPrev = () => { if (kpiIdx > 0) setKpiIdx(kpiIdx - 1); else window.dispatchEvent(new Event('pulse:prev')) }
                    return (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold break-all" title={key}>{key}</div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select className="h-10 flex-1 rounded-md border px-3 text-sm" value={value.answer} onChange={(e)=>setAnswer(e.target.value as FollowAnswer)}>
                            <option value="improved">Improved</option>
                            <option value="same">Same</option>
                            <option value="worse">Worse</option>
                          </select>
                          <input className="h-10 flex-1 rounded-md border px-3 text-sm" placeholder="Notes (optional)" value={value.notes ?? ''} onChange={(e)=>setNotes(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between">
                          <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-50" onClick={goPrev} disabled={kpiIdx===0}>Back</button>
                          <div className="flex items-center gap-2">
                            <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white text-sm" onClick={goNext}>Next</button>
                            <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>goNext()}>Skip</button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="6" id="pulse-step-7">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 7</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Reflection</h2>
            <p className="text-sm text-muted-foreground">Capture the story that will guide next month’s focus.</p>
          </div>
          <div className="px-5 py-4">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="text-sm font-semibold text-foreground">Reflection</div>
                <div className="text-xs text-muted-foreground">Step {reflectionIdx + 1} of {3}</div>
              </div>
              <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((reflectionIdx+1)/3)*100)}%` }} /></div>
              <div className="space-y-4 px-6 py-5">
                {(() => {
                  const items = [
                    { label: 'Win of the month', help: 'Celebrate their biggest win.', get: () => winText, set: (v: string) => setWinText(v) },
                    { label: 'Biggest blocker', help: 'What got in the way?', get: () => blockerText, set: (v: string) => setBlockerText(v) },
                    { label: 'Trainer notes', help: 'Internal only; not shared with client.', get: () => trainerNotes, set: (v: string) => setTrainerNotes(v) },
                  ] as const
                  const total = items.length
                  const i = Math.min(Math.max(reflectionIdx, 0), total-1)
                  const cur = items[i]
                  const goNext = () => { if (i < total - 1) setReflectionIdx(i+1); else window.dispatchEvent(new Event('pulse:next')) }
                  const goPrev = () => { if (i > 0) setReflectionIdx(i-1); else window.dispatchEvent(new Event('pulse:prev')) }
                  const onChange = (e: any) => cur.set(e.target.value)
                  return (
                    <div className="space-y-3">
                      <div className="text-lg font-semibold">{cur.label}</div>
                      <p className="text-sm text-muted-foreground">{cur.help}</p>
                      <textarea className="h-28 w-full rounded-md border px-3 py-2 text-sm" value={cur.get()} onChange={onChange} />
                      <div className="flex items-center justify-between">
                        <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-50" onClick={goPrev} disabled={i===0}>Back</button>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white text-sm" onClick={goNext}>Next</button>
                          <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>goNext()}>Skip</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3" data-pulse-step data-step-index="7" id="pulse-step-8">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Step 8</div>
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Scheduling</h2>
            <p className="text-sm text-muted-foreground">Note any travel, cadence tweaks, or plan adjustments.</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vacationOn} onChange={(e)=>setVacationOn(e.target.checked)} />
                <span>Vacation this block</span>
              </label>
              {vacationOn ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Vacation from
                    <input type="date" className="mt-2 h-10 w-full rounded-md border px-3" value={vacFrom} onChange={(e)=>setVacFrom(e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Vacation to
                    <input type="date" className="mt-2 h-10 w-full rounded-md border px-3" value={vacTo} onChange={(e)=>setVacTo(e.target.value)} />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Expected missed sessions</div>
                  <div className="space-y-2">
                    {missedDates.map((d,idx)=>(
                      <div key={idx} className="flex items-center gap-2">
                        <input type="date" className="h-10 rounded-md border px-3" value={d} onChange={(e)=>setMissedDates(arr => arr.map((x,i)=> i===idx ? e.target.value : x))} />
                        <button type="button" className="px-2 h-10 rounded-md border text-xs" onClick={()=>setMissedDates(arr => arr.filter((_,i)=>i!==idx))}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="px-3 h-10 rounded-md border text-sm" onClick={()=>setMissedDates(arr => [...arr, ''])}>Add date</button>
                  </div>
                </div>
              )}
              <label className="text-xs font-semibold text-muted-foreground uppercase">Schedule notes
                <textarea className="mt-2 w-full rounded-md border px-3 py-2 text-sm" value={scheduleNotes} onChange={(e)=>setScheduleNotes(e.target.value)} />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>window.dispatchEvent(new Event('pulse:prev'))}>Back</button>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] text-white" onClick={()=>window.dispatchEvent(new Event('pulse:submit'))}>Submit Pulse</button>
            </div>
          </div>
        </div>
      </section>

      {success && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-emerald-700">{success}</div>
            <div className="text-xs text-muted-foreground">Recap of key nudges</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {goalsUpdate.filter(g=>g.status==='at_risk').slice(0,1).map((_,i)=>(
              <span key={`goal-${i}`} className="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-700">Focus: Goal at risk</span>
            ))}
            {Object.entries(kpiFollowups).filter(([,v])=>v.answer==='worse').slice(0,1).map(([key])=>(
              <span key={key} className="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-700">KPI: {key}</span>
            ))}
          </div>
          {habitConsistency != null && (
            <div className="text-xs text-muted-foreground">Habit consistency: <span className="font-semibold text-foreground">{habitConsistency}%</span></div>
          )}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 border border-red-300 bg-red-50 rounded p-2">{error}</div>
      )}

      {showSubmitCTA && (
        <div className="sticky bottom-0 left-0 right-0 flex justify-end border-t bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <button type="submit" className="inline-flex h-11 items-center rounded-md bg-[#3FAE52] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#369149] disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : 'Submit Pulse'}
          </button>
        </div>
      )}
    </form>
  )
}
