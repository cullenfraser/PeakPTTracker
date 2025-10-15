import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lightbulb, Target, CheckCircle2 } from 'lucide-react'

export type Goals = {
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

type Props = {
  value: Goals
  onChange: (patch: Partial<Goals>) => void
  onFinished?: () => void
}

export default function SmartGoalsStepper({ value, onChange, onFinished }: Props) {
  const [stage, setStage] = useState<'intro'|'form'|'summary'>('intro')
  const steps = useMemo(() => ([
    { key: 'specific', type: 'text' as const, title: 'Name the Goal', help: 'Say it in plain language. One sentence is perfect.' },
    { key: 'measurable', type: 'text' as const, title: 'How will we measure progress?', help: 'Pick a number, distance, time, or simple habit count.' },
    { key: 'achievable', type: 'text' as const, title: 'Make it realistic', help: 'What fits your life right now? Keep it doable.' },
    { key: 'relevant', type: 'text' as const, title: 'Why this matters', help: 'Connect it to your life: family, confidence, energy, health.' },
    { key: 'time_bound', type: 'text' as const, title: 'By when?', help: 'Give the goal a clear date or timeframe.' },
    { key: 'horizon', type: 'horizon' as const, title: 'Time horizon', help: 'Choose the timeframe we’ll use to plan.' },
    { key: 'workouts_per_week', type: 'workouts' as const, title: 'Workouts per week', help: 'Choose a weekly rhythm that’s sustainable.' },
    { key: 'nonneg_0', type: 'nonneg' as const, title: 'Non‑Negotiable #1', help: 'One simple action you’ll do consistently.' },
    { key: 'nonneg_1', type: 'nonneg' as const, title: 'Non‑Negotiable #2', help: 'Keep stacking small wins.' },
    { key: 'nonneg_2', type: 'nonneg' as const, title: 'Non‑Negotiable #3', help: 'Make it easy to do, every day.' },
    { key: 'nonneg_3', type: 'nonneg' as const, title: 'Non‑Negotiable #4', help: 'Consistency beats intensity.' },
  ]), [])

  const [i, setI] = useState(0)
  const s = steps[i]
  const progressPct = Math.round((i/steps.length)*100)

  const [textVal, setTextVal] = useState('')

  useEffect(() => {
    if (s.type === 'text') {
      const v = (value as any)[s.key]
      setTextVal(typeof v === 'string' ? v : '')
    } else {
      setTextVal('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key])

  const advance = () => {
    if (i < steps.length - 1) setI(i+1)
    else onFinished?.()
  }

  const applyAndNext = (patch: Partial<Goals>) => {
    onChange(patch)
    advance()
  }

  const examplesFor = (key: string): string[] => {
    switch (key) {
      case 'specific':
        return ['Lose 10 lbs','Run a 5K','Lower body fat to 22%','Do 2 chin‑ups','Finish a sprint triathlon','Feel confident in my wedding outfit','Add 10 lbs to my squat PR','Sleep through the night without tossing','Regain pre-baby energy','Complete a Tough Mudder']
      case 'measurable':
        return ['2 lbs/month','5K under 30 min','Waist −5 cm','Body fat % monthly','Track workouts in Trainerize','Log meals 5 days/week','3 strength sessions recorded','Hit 7 hours of sleep/night','Increase SMM by 2 kg','Drop resting HR by 5 bpm']
      case 'achievable':
        return ['3 workouts/week','Walk 20 min daily','+20g protein at lunch','Stretch 5 min nightly','Meal prep twice weekly','Add veggies at dinner','Swap soda for sparkling water','Two recovery sessions/week','Bedtime routine by 10pm','Plan workouts on Sundays']
      case 'relevant':
        return ['More energy for family','Feel confident at the beach','Lower health risk','Perform better at work','Keep up with the kids','Rock my next race','Show up strong for my team','Boost immunity and resilience','Age powerfully','Feel proud every morning']
      case 'time_bound':
        return ['By June 1','In 12 weeks','By my birthday','Before summer','90 days from today','End of this quarter','Before our anniversary trip','By Labor Day','New Year milestone','Before my next doctor visit']
      default:
        return []
    }
  }

  const preview = () => {
    const parts: string[] = []
    if (value.specific) parts.push(`Goal: ${value.specific}.`)
    if (value.measurable) parts.push(`Measured by: ${value.measurable}.`)
    if (value.achievable) parts.push(`Achievable because: ${value.achievable}.`)
    if (value.relevant) parts.push(`Relevant because: ${value.relevant}.`)
    if (value.time_bound) parts.push(`Timeline: ${value.time_bound}.`)
    if (value.horizon) parts.push(`Horizon: ${value.horizon}.`)
    if (value.workouts_per_week) parts.push(`Weekly workouts: ${value.workouts_per_week}.`)
    return parts.join(' ')
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="font-semibold">SMART Goals</div>
        {stage==='form' && <div className="text-xs text-muted-foreground">Step {i+1} of {steps.length}</div>}
      </div>
      {stage==='form' && (
        <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${progressPct}%` }} /></div>
      )}
      <div className="p-6">
        {stage==='intro' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Set a goal you can celebrate</h3>
            <p className="text-sm text-muted-foreground">This is where we lock in the win you’re chasing. We’ll shape it so it feels inspiring, specific, and aligned with the life you want.</p>
            <p className="text-sm text-muted-foreground">Dream big and stay real—we’ll translate your words into a SMART plan with clear milestones and quick momentum.</p>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600"/> Specific & Measurable</div>
              <div className="rounded border p-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-emerald-600"/> Achievable & Relevant</div>
              <div className="rounded border p-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600"/> Time‑bound & Actionable</div>
            </div>
            <div>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>setStage('form')}>Start</button>
            </div>
          </div>
        )}
        {stage==='form' && (
        <>
        <AnimatePresence mode="wait">
          <motion.div key={s.key} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}} className="space-y-4">
            <h3 className="text-xl font-semibold leading-tight">{s.title}</h3>
            {s.help && <p className="text-sm text-muted-foreground">{s.help}</p>}

            {s.type === 'text' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded p-3">
                  <Lightbulb className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="font-medium">Tip</div>
                    <div className="text-muted-foreground">Use simple wording. The trainer will help tighten it up.</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {examplesFor(s.key).map((ex)=> (
                    <button key={ex} type="button" className="px-3 h-8 rounded border text-xs hover:bg-accent" onClick={()=>setTextVal(ex)}>{ex}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  <input className="w-full h-11 px-3 border rounded-md" placeholder="Type your answer" value={textVal} onChange={(e)=>setTextVal(e.target.value)} />
                  <div className="flex items-center gap-2">
                    <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>applyAndNext({ [s.key]: textVal } as any)}>Next</button>
                    <button type="button" className="px-4 h-10 rounded-md border" onClick={()=>applyAndNext({ [s.key]: '' } as any)}>Skip</button>
                  </div>
                </div>
              </div>
            )}

            {s.type === 'horizon' && (
              <div className="flex gap-3">
                <button type="button" className={`flex-1 h-11 rounded-md ${value.horizon==='6mo'?'bg-[#3FAE52] text-white':'bg-neutral-200'}`} onClick={()=>onChange({ horizon: '6mo' })}>6 months</button>
                <button type="button" className={`flex-1 h-11 rounded-md ${value.horizon==='12mo'?'bg-[#3FAE52] text-white':'bg-neutral-200'}`} onClick={()=>onChange({ horizon: '12mo' })}>12 months</button>
                <button type="button" className="px-4 h-11 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={advance}>Next</button>
              </div>
            )}

            {s.type === 'workouts' && (
              <div className="space-y-3">
                <div className="text-sm">Workouts/week: <b>{value.workouts_per_week ?? 3}</b></div>
                <input type="range" min={1} max={7} value={value.workouts_per_week ?? 3} onChange={(e)=>onChange({ workouts_per_week: Number(e.target.value)||1 })} className="w-full" />
                <div>
                  <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={advance}>Next</button>
                </div>
              </div>
            )}

            {s.type === 'nonneg' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded p-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="font-medium">Keep it tiny</div>
                    <div className="text-muted-foreground">Non‑negotiables should be easy, fast, and repeatable.</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['10‑min walk after lunch','Protein at breakfast','Lights out by 10:30pm','2L water daily','5‑min breathwork','Prep lunches on Sunday','Stretch before bed','No phone at meals','Track hydration in app','Plan workouts each Sunday'].map(ex => (
                    <button key={ex} type="button" className="px-3 h-8 rounded border text-xs hover:bg-accent" onClick={()=>{
                      const idx = Number(s.key.split('_')[1])
                      const arr = [...(value.non_negs||[])]
                      arr[idx] = ex
                      onChange({ non_negs: arr })
                    }}>{ex}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  <input className="w-full h-11 px-3 border rounded-md" placeholder="e.g., 10‑min walk after lunch" value={value.non_negs?.[Number(s.key.split('_')[1])] ?? ''} onChange={(e)=>{
                    const idx = Number(s.key.split('_')[1])
                    const arr = [...(value.non_negs||[])]
                    arr[idx] = e.target.value
                    onChange({ non_negs: arr })
                  }} />
                  <div>
                    <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={advance}>Next</button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center justify-between mt-4">
          <button type="button" disabled={i===0} className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setI(Math.max(0,i-1))}>Back</button>
          <div className="text-xs text-muted-foreground">Clear, doable goals drive action.</div>
        </div>
        <div className="mt-4 rounded-md border p-3 bg-card/50">
          <div className="flex items-center gap-2 text-sm font-medium mb-1"><Target className="h-4 w-4 text-emerald-600" /> Goal preview</div>
          <div className="text-sm text-muted-foreground">{preview() || 'Your SMART goal will build here as you answer.'}</div>
        </div>
        </>
        )}
        {stage==='summary' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">SMART goal recap</h3>
            <div className="rounded border p-3 text-sm">
              <div className="font-medium mb-1">Goal</div>
              <div className="text-muted-foreground">{preview() || '—'}</div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="font-medium mb-1">Time horizon</div>
                <div>{value.horizon || '—'}</div>
              </div>
              <div className="rounded border p-3">
                <div className="font-medium mb-1">Workouts per week</div>
                <div>{value.workouts_per_week ?? '—'}</div>
              </div>
              <div className="md:col-span-2 rounded border p-3">
                <div className="font-medium mb-1">Non‑negotiables</div>
                <ul className="list-disc pl-5 space-y-1">
                  {(value.non_negs || []).filter(Boolean).length ? (value.non_negs || []).filter(Boolean).map((n,i)=>(<li key={i}>{n}</li>)) : <li className="text-muted-foreground">None added</li>}
                </ul>
              </div>
            </div>
            <div>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>onFinished?.()}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
