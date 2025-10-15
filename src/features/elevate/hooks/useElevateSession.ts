import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PillarScores, InBody, Vitals, Grip, FoodEnv } from '../domain/types'
import { scorePillars, healthAge } from '../domain/compute'

export interface ElevateState {
  sessionId: string
  clientId: string
  parq: Partial<{
    chest_pain: boolean; dizziness: boolean; dx_condition: boolean; sob_mild: boolean;
    joint_issue: boolean; balance_neuro: boolean; uncontrolled_bp_dm: string | null;
    recent_surgery: boolean; pregnancy_postpartum: string | null; clearance_level: string | null;
  }>
  inbody: InBody
  vitals: Vitals
  grip: Grip
  food: FoodEnv
  pillarItems: Record<string, number>
  pillars: PillarScores
  goals: Goals
  autosaving: boolean
  updatedAt: number
}

export interface Goals {
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

export function useElevateSession(clientId: string | null) {
  const [state, setState] = useState<ElevateState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  const createOrLoad = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    try {
      // Try to find a recent session created today for this client
      const today = new Date().toISOString().slice(0, 10)
      const { data: existing } = await (supabase as any)
        .from('elevate_session')
        .select('id, client_id, ex, nu, sl, st, peak, health_age, health_age_delta, created_at')
        .eq('client_id', clientId)
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(1)

      let sessionId: string
      if (existing && existing.length > 0) {
        sessionId = existing[0].id
      } else {
        const { data: created, error: createErr } = await (supabase as any)
          .from('elevate_session')
          .insert({ client_id: clientId })
          .select('id')
          .single()
        if (createErr) throw createErr
        sessionId = created.id
      }

      // Load child tables (best-effort; may be empty)
      const [{ data: parq }, { data: food }, { data: _grip }, { data: answers }, { data: goalsRow }] = await Promise.all([
        (supabase as any).from('elevate_parq').select('*').eq('session_id', sessionId).maybeSingle(),
        (supabase as any).from('elevate_food_env').select('*').eq('session_id', sessionId).maybeSingle(),
        (supabase as any).from('elevate_grip').select('*').eq('session_id', sessionId).maybeSingle(),
        (supabase as any).from('elevate_answers').select('pillar, item_code, score_0_4').eq('session_id', sessionId),
        (supabase as any).from('elevate_goals').select('*').eq('session_id', sessionId).maybeSingle(),
      ])

      // Defaults
      const pillarItems: Record<string, number> = {}
      for (const a of answers ?? []) {
        if (a?.item_code) pillarItems[a.item_code] = a.score_0_4 ?? 0
      }
      const fe = (food?.fe_score ?? 0)
      const pillars = scorePillars(pillarItems, fe)

      const ib: InBody = {
        weight: 0, bf: 0, smm: 0, vat: 0, waist: 0, height: 0,
      }
      const v: Vitals = { rhr: 60, chronAge: 40, sex: 'M' }
      const g: Grip = { left: 0, right: 0, sum: 0, rel: 0, score: 0 }
      const f: FoodEnv = { cook0_4: food?.home_cook_0_4 ?? 0, upf0_4: food?.upf_home_0_4 ?? 0, fe: fe }
      const goals: Goals = {
        goal_type: goalsRow?.goal_type ?? null,
        specific: goalsRow?.specific ?? null,
        measurable: goalsRow?.measurable ?? null,
        achievable: goalsRow?.achievable ?? null,
        relevant: goalsRow?.relevant ?? null,
        time_bound: goalsRow?.time_bound ?? null,
        non_negs: Array.isArray(goalsRow?.non_negs) ? goalsRow?.non_negs : [],
        horizon: goalsRow?.horizon ?? null,
        workouts_per_week: goalsRow?.workouts_per_week ?? null,
      }

      setState({
        sessionId,
        clientId,
        parq: parq ?? {},
        inbody: ib,
        vitals: v,
        grip: g,
        food: f,
        pillarItems,
        pillars,
        goals,
        autosaving: false,
        updatedAt: Date.now(),
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to load Elevate session')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void createOrLoad() }, [createOrLoad])

  const scheduleSave = useCallback((fn: () => Promise<void>) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      setState(s => s ? { ...s, autosaving: true } : s)
      try { await fn() } finally { setState(s => s ? { ...s, autosaving: false, updatedAt: Date.now() } : s) }
    }, 500)
  }, [])

  const updateParq = useCallback((patch: ElevateState['parq']) => {
    setState(s => (s ? { ...s, parq: { ...s.parq, ...patch } } : s))
    scheduleSave(async () => {
      if (!state) return
      const payload = { ...state.parq, ...patch }
      await (supabase as any).from('elevate_parq').upsert({ session_id: state.sessionId, ...payload })
    })
  }, [scheduleSave, state])

  const updateGoals = useCallback((patch: Partial<Goals>) => {
    setState(s => {
      if (!s) return s
      const merged: Goals = { ...s.goals, ...patch }
      return { ...s, goals: merged }
    })
    scheduleSave(async () => {
      if (!state) return
      const g = { ...state.goals, ...patch }
      await (supabase as any).from('elevate_goals').upsert({
        session_id: state.sessionId,
        goal_type: g.goal_type,
        specific: g.specific,
        measurable: g.measurable,
        achievable: g.achievable,
        relevant: g.relevant,
        time_bound: g.time_bound,
        non_negs: g.non_negs,
        horizon: g.horizon,
        workouts_per_week: g.workouts_per_week,
      })
    })
  }, [scheduleSave, state])

  const updateFood = useCallback((patch: Partial<FoodEnv>) => {
    setState(s => {
      if (!s) return s
      const food = { ...s.food, ...patch }
      const fe_score = Math.max(0, Math.min(8, (4 - food.upf0_4) + food.cook0_4))
      const pillars = scorePillars(s.pillarItems, fe_score)
      return { ...s, food: { ...food, fe: fe_score }, pillars }
    })
    scheduleSave(async () => {
      if (!state) return
      const food = { ...state.food, ...patch }
      const fe_score = Math.max(0, Math.min(8, (4 - food.upf0_4) + food.cook0_4))
      await (supabase as any).from('elevate_food_env').upsert({ session_id: state.sessionId, home_cook_0_4: food.cook0_4, upf_home_0_4: food.upf0_4, fe_score })
    })
  }, [scheduleSave, state])

  const updateVitalsInBody = useCallback((vPatch: Partial<Vitals>, ibPatch: Partial<InBody>) => {
    setState(s => s ? { ...s, vitals: { ...s.vitals, ...vPatch }, inbody: { ...s.inbody, ...ibPatch } } : s)
    // No immediate DB write for InBody/Vitals until Results step is computed or explicitly saved later.
  }, [])

  const updateGrip = useCallback((patch: Partial<Grip>) => {
    setState(s => {
      if (!s) return s
      const grip = { ...s.grip, ...patch }
      grip.sum = +((grip.left ?? 0) + (grip.right ?? 0)).toFixed(1)
      grip.rel = s.inbody?.weight ? +(grip.sum / s.inbody.weight).toFixed(3) : 0
      return { ...s, grip }
    })
    scheduleSave(async () => {
      if (!state) return
      const g = { ...state.grip, ...patch }
      await (supabase as any).from('elevate_grip').upsert({ session_id: state.sessionId, best_left_kgf: g.left, best_right_kgf: g.right, sum_best_kgf: g.sum, rel_grip: g.rel, grip_z: g.z ?? null, grip_score: g.score ?? 0 })
    })
  }, [scheduleSave, state])

  const updatePillarItems = useCallback((updates: Record<string, number>) => {
    setState(s => {
      if (!s) return s
      const items = { ...s.pillarItems, ...updates }
      const pillars = scorePillars(items, s.food.fe)
      return { ...s, pillarItems: items, pillars }
    })
    scheduleSave(async () => {
      if (!state) return
      const rows = Object.entries(updates).map(([item_code, score]) => ({ session_id: state.sessionId, pillar: item_code.slice(0,2).toUpperCase(), item_code, score_0_4: Math.max(0, Math.min(4, score)) }))
      if (rows.length > 0) await (supabase as any).from('elevate_answers').upsert(rows)
    })
  }, [scheduleSave, state])

  const saveSummary = useCallback(async () => {
    if (!state) return
    const gripZ = state.grip.z ?? 0
    const h = healthAge(state.vitals, state.inbody, state.pillars, gripZ)
    await (supabase as any).from('elevate_session').update({ ex: state.pillars.ex, nu: state.pillars.nu, sl: state.pillars.sl, st: state.pillars.st, peak: state.pillars.peak, health_age: h.age, health_age_delta: h.delta }).eq('id', state.sessionId)
  }, [state])

  const value = useMemo(() => ({ state, loading, error, updateParq, updateFood, updateVitalsInBody, updateGrip, updatePillarItems, updateGoals, saveSummary }), [state, loading, error, updateParq, updateFood, updateVitalsInBody, updateGrip, updatePillarItems, updateGoals, saveSummary])

  return value
}
