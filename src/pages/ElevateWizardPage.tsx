import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

const steps = ['PAR-Q','SMART Goals','Pillars','Vitals/InBody','Grip','Results'] as const

export default function ElevateWizardPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { state, loading, error, updateParq, updateVitalsInBody, updateGrip, updateFood, updatePillarItems, updateGoals, saveSummary } = useElevateSession(clientId ?? null)
  const [step, setStep] = useState(0)
  const [timer, setTimer] = useState(0)
  const [horizon, setHorizon] = useState<Horizon>('6mo')
  const [w, setW] = useState(3)
  const [adherence, setAdherence] = useState(0.8)
  const [protein, setProtein] = useState(1)
  const [sleep, setSleep] = useState(1)

  useEffect(() => {
    const id = window.setInterval(() => setTimer((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

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

  return (
    <RequireTrainer>
      <Layout>
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          <aside className="md:sticky md:top-[80px] self-start border rounded-lg p-3 h-fit">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Progress</div>
              <div className="text-xs text-muted-foreground">{autosaveBadge}</div>
            </div>
            <ol className="space-y-1 text-sm">
              {steps.map((label, i) => (
                <li key={label}>
                  <button type="button" onClick={() => setStep(i)} className={`w-full text-left px-2 py-1 rounded ${i===step?'bg-[#3FAE52] text-white':'hover:bg-accent'}`}>
                    <span className="mr-2">{i < step ? '✓' : i === step ? '•' : '○'}</span>{label}
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-3 text-xs text-muted-foreground">Time: {Math.floor(timer/60)}:{String(timer%60).padStart(2,'0')}</div>
          </aside>

          <section className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <button type="button" disabled={step===0} className="px-3 py-2 rounded border" onClick={()=>setStep((s)=>Math.max(0,s-1))}>Back</button>
                  <div className="flex items-center gap-2">
                    <button type="button" className="px-3 py-2 rounded border" onClick={()=>void saveSummary()}>Save</button>
                    {step<steps.length-1 ? (
                      <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white" onClick={()=>setStep((s)=>Math.min(steps.length-1,s+1))}>Next</button>
                    ) : (
                      <button type="button" className="px-3 py-2 rounded bg-[#3FAE52] text-white" onClick={()=>navigate(`/elevate/${state.sessionId}`)}>Finish</button>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
