import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import ParqCard from '@/features/elevate/components/ParqCard'
import { useElevateSession } from '@/features/elevate/hooks/useElevateSession'
import SmartGoalsStepper from '@/features/elevate/components/steppers/SmartGoalsStepper'
import PillarsStepper from '@/features/elevate/components/steppers/PillarsStepper'
import VitalsStepper from '@/features/elevate/components/steppers/VitalsStepper'
import GripStepper from '@/features/elevate/components/steppers/GripStepper'
import FrequencyPanel from '@/features/elevate/components/Results/FrequencyPanel'
import HeroTiles from '@/features/elevate/components/Results/HeroTiles'
import PillarRadar from '@/features/elevate/components/Results/PillarRadar'
import HealthTrajectories from '@/features/elevate/components/Results/HealthTrajectories'
import ReferralBanner from '@/features/elevate/components/Results/ReferralBanner'
import ExportButtons from '@/features/elevate/components/Results/ExportButtons'
import { noChangeProjection, projectWithFrequency } from '@/features/elevate/domain/compute'
import type { Horizon } from '@/features/elevate/domain/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const steps = ['PAR-Q','SMART Goals','Pillars','Vitals/InBody','Grip','Results'] as const

export default function ElevateWizardPage() {
  const { clientId } = useParams()
  const [searchParams] = useSearchParams()
  const modeParam = searchParams.get('mode')
  const sessionMode = modeParam === 'fresh' || modeParam === 'resume' ? modeParam : 'resume'
  const { state, loading, error, updateParq, updateVitalsInBody, updateGrip, updateFood, updatePillarItems, updateGoals, saveSummary } = useElevateSession(clientId ?? null, sessionMode)
  const [step, setStep] = useState(0)
  const [timer, setTimer] = useState(0)
  const [horizon, setHorizon] = useState<Horizon>('6mo')
  const [w, setW] = useState(3)
  const [adherence, setAdherence] = useState(0.8)
  const [protein, setProtein] = useState(1)
  const [sleep, setSleep] = useState(1)
  const [introDone, setIntroDone] = useState(false)
  const [clientInfo, setClientInfo] = useState<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const { user } = useAuth()
  const [trainerInfo, setTrainerInfo] = useState<{ email: string | null; phone: string | null }>({ email: null, phone: null })

  useEffect(() => {
    const id = window.setInterval(() => setTimer((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    setIntroDone(false)
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let active = true
    setClientLoading(true)
    setClientError(null)
    ;(async () => {
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('first_name, last_name, email, phone')
        .eq('id', clientId)
        .maybeSingle()
      if (!active) return
      if (fetchError) {
        setClientError(fetchError.message)
      }
      setClientInfo(data ?? null)
      setClientLoading(false)
    })()
    return () => {
      active = false
    }
  }, [clientId])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const defaultEmail = user?.email ?? null
        let email = defaultEmail
        let phone: string | null = null
        if (user?.id) {
          const { data } = await (supabase as any)
            .from('trainers')
            .select('email, phone')
            .eq('user_id', user.id)
            .maybeSingle()
          email = (data?.email ?? email) || email
          phone = data?.phone ?? null
        }
        if (!active) return
        setTrainerInfo({ email: email ?? null, phone })
      } catch {
        if (!active) return
        setTrainerInfo({ email: user?.email ?? null, phone: null })
      }
    })()
    return () => { active = false }
  }, [user?.id, user?.email])

  const projections = useMemo(() => {
    if (!state) return null
    const base = { v: state.vitals, ib: state.inbody, ps: state.pillars, gripZ: state.grip.z ?? 0 }
    const nc = noChangeProjection(base, horizon)
    const wc = projectWithFrequency(base, { workoutsPerWeek: w, adherence, proteinSupport: protein, sleepSupport: sleep }, horizon)
    return { nc, wc }
  }, [state, horizon, w, adherence, protein, sleep])

  const autosaveBadge = state?.autosaving ? 'Saving…' : 'Saved'

  const showReferral = useMemo(() => {
    const v = state?.parq
    if (!v) return false
    const flags = ['chest_pain','dizziness','dx_condition','sob_mild','joint_issue','balance_neuro','recent_surgery'] as const
    return flags.some((k) => (v as any)[k]) || Boolean(v.uncontrolled_bp_dm)
  }, [state?.parq])

  const clientName = useMemo(() => {
    if (!clientInfo) return 'Your client'
    const first = clientInfo.first_name?.trim() ?? ''
    const last = clientInfo.last_name?.trim() ?? ''
    const name = `${first} ${last}`.trim()
    return name || 'Your client'
  }, [clientInfo])

  const trainerEmail = trainerInfo.email ?? ''
  const trainerPhone = trainerInfo.phone ?? ''

  if (!introDone) {
    return (
      <RequireTrainer>
        <Layout>
          <section className="relative w-full">
            <div className="mx-auto max-w-5xl px-6 py-14 md:py-20">
              <div className="space-y-8 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Peak Fitness • Elevate Consult
                </div>
                <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                  {`Let's unlock what's possible for ${clientName}.`}
                </h1>
                <p className="mx-auto max-w-3xl text-[15px] md:text-lg text-muted-foreground">
                  Elevate is our guided consult that turns honest inputs into a clear, coachable plan—built for real life. Whether you’re new and unsure where to start, coming back after a break, or already training and chasing the next level, we’ll map the safest path forward and the fastest wins you can feel each week.
                </p>
                {clientError && (
                  <div className="mx-auto max-w-3xl rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {clientError}
                  </div>
                )}
                <div className="grid gap-3 text-left md:grid-cols-2">
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Activity Readiness & Smart Goals</div>
                    <div className="mt-1 text-sm text-muted-foreground">Confirm readiness, surface any red flags, and set SMART goals that actually fit your life.</div>
                  </div>
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Lifestyle Pillars</div>
                    <div className="mt-1 text-sm text-muted-foreground">Score the daily habits that drive results—movement, nutrition, sleep, and stress—so momentum has a map.</div>
                  </div>
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Vitals & InBody</div>
                    <div className="mt-1 text-sm text-muted-foreground">Track the biometrics that matter (BP, body comp, waist:height) to anchor progress in real data.</div>
                  </div>
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Strength Snapshot</div>
                    <div className="mt-1 text-sm text-muted-foreground">Quick grip test to index strength and longevity—your baseline for stronger tomorrows.</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {clientInfo?.email && <div>Client Email: {clientInfo.email}</div>}
                  {clientInfo?.phone && <div>Client Phone: {clientInfo.phone}</div>}
                </div>
                <div className="text-xs text-muted-foreground">Questions? Contact {trainerEmail || 'your trainer'} {trainerPhone ? `• ${trainerPhone}` : ''}</div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="h-12 px-6 rounded-md bg-[#3FAE52] text-white text-base font-semibold disabled:opacity-60"
                    onClick={() => setIntroDone(true)}
                    disabled={clientLoading}
                  >Begin</button>
                  {sessionMode === 'resume' && (
                    <button
                      type="button"
                      className="h-12 px-6 rounded-md border text-base font-semibold hover:bg-accent"
                      onClick={() => setIntroDone(true)}
                      disabled={clientLoading}
                    >Resume Session</button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </Layout>
      </RequireTrainer>
    )
  }

  return (
    <RequireTrainer>
      <Layout>
        <div className="mx-auto w-full max-w-4xl px-6 py-6 pb-28">
          <section className="space-y-6">
            {loading && <div className="py-12 text-center text-muted-foreground">Loading…</div>}
            {error && <div className="py-3 text-red-600 border border-red-300 bg-red-50 rounded">{error}</div>}
            {!loading && state && (
              <>
                {step===0 && (
                  <ParqCard value={state.parq} onChange={updateParq} onFinished={()=>setStep(1)} />
                )}
                {step===1 && (
                  <SmartGoalsStepper value={state.goals} onChange={updateGoals} onFinished={()=>setStep(2)} />
                )}
                {step===2 && (
                  <PillarsStepper value={state.pillarItems} onItem={updatePillarItems} food={state.food} onFoodChange={updateFood} onFinished={()=>setStep(3)} />
                )}
                {step===3 && (
                  <VitalsStepper vitals={state.vitals} inbody={state.inbody} onChange={updateVitalsInBody} onFinished={()=>setStep(4)} />
                )}
                {step===4 && (
                  <GripStepper value={state.grip} weight={state.inbody.weight} onChange={updateGrip} onFinished={()=>setStep(5)} />
                )}
                {step===5 && projections && (
                  <div className="space-y-4">
                    {showReferral && <ReferralBanner />}
                    <HeroTiles peak={state.pillars.peak} chronAge={state.vitals.chronAge} healthAge={projections.wc.healthAge.age} delta={projections.wc.healthAge.delta} />
                    <div className="grid md:grid-cols-2 gap-4">
                      <PillarRadar scores={state.pillars} />
                      <HealthTrajectories base={state} projections={projections} horizon={horizon} onHorizonChange={setHorizon} />
                    </div>
                    <FrequencyPanel
                      w={w}
                      adherence={adherence}
                      protein={protein}
                      sleep={sleep}
                      onChange={(vals: { w: number; adherence: number; protein: number; sleep: number }) => {
                        setW(vals.w)
                        setAdherence(vals.adherence)
                        setProtein(vals.protein)
                        setSleep(vals.sleep)
                      }}
                    />
                    <ExportButtons />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
        {/* Bottom subtle progress bar */}
        <div className="sticky bottom-0 inset-x-0 z-40 border-t bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="hidden text-xs text-muted-foreground md:block">{`Step ${Math.min(step+1, steps.length)} of ${steps.length}`} • {steps[Math.min(step, steps.length-1)]}</div>
              <div className="h-1 w-40 overflow-hidden rounded bg-muted">
                <div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((Math.min(step, steps.length-1)+1)/steps.length)*100)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{autosaveBadge}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">Time {Math.floor(timer/60)}:{String(timer%60).padStart(2,'0')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={()=>void saveSummary()}>Save</button>
            </div>
          </div>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
