import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ELEVATE_WEIGHTS } from '../../elevate.config'
import type { FoodEnv } from '../../domain/types'
import { Dumbbell, Utensils, Moon, Smile } from 'lucide-react'

 type PillarItemMap = Record<string, { title: string; help?: string; baseline: string; topline: string }>

const LABELS: PillarItemMap = {
  ex_mvpa: {
    title: 'Most days, do you get 20–30 min of moderate activity?',
    help: 'Rate consistency from 0 (rarely) to 4 (consistently).',
    baseline: '0 = Mostly sedentary weeks',
    topline: '4 = Moving most days without fail',
  },
  ex_steps: {
    title: 'How close are you to 8–10k steps per day?',
    help: '0 = far from it, 4 = consistently near target.',
    baseline: '0 = Under 5k steps on most days',
    topline: '4 = 5+ days hitting 10k steps',
  },
  ex_strength_days: {
    title: 'Do you strength train each week?',
    help: '0 = almost never, 4 = 2–3+ days weekly.',
    baseline: '0 = Strength training is rare',
    topline: '4 = Lifting 2–3+ sessions weekly',
  },

  nu_protein: {
    title: 'Do you include protein in most meals?',
    help: '0 = rarely, 4 = consistently.',
    baseline: '0 = Protein missing from most meals',
    topline: '4 = Protein at virtually every meal',
  },
  nu_upf: {
    title: 'How often do you choose minimally processed foods?',
    help: '0 = very often UPF, 4 = rarely UPF.',
    baseline: '0 = Ultra-processed foods dominate',
    topline: '4 = Mostly whole, minimally processed',
  },
  nu_vegfruit: {
    title: 'How often do veggies or fruit show up daily?',
    help: 'Think total servings across the day.',
    baseline: '0 = Fruits/veggies a few times a week',
    topline: '4 = Produce in nearly every meal',
  },
  nu_water: {
    title: 'Hydration habits',
    help: 'How steady is your water intake?',
    baseline: '0 = Less than 4 glasses most days',
    topline: '4 = 2+ liters or 8 glasses daily',
  },

  sl_duration: {
    title: 'Sleep duration',
    help: 'Hours you actually sleep most nights.',
    baseline: '0 = Under 6 hours most nights',
    topline: '4 = 7–8+ solid hours nightly',
  },
  sl_quality: {
    title: 'Sleep quality',
    help: 'How recovered do you feel when you wake?',
    baseline: '0 = Tossing, waking unrefreshed',
    topline: '4 = Wake up recharged and clear',
  },

  st_stress_load: {
    title: 'Stress load',
    help: 'How heavy does stress feel day to day?',
    baseline: '0 = Stress feels constant and draining',
    topline: '4 = Stress rarely feels overwhelming',
  },
  st_coping: {
    title: 'Stress coping tools',
    help: 'How consistent are your go-to resets?',
    baseline: '0 = No reliable ways to reset',
    topline: '4 = Strong routines that calm you fast',
  },
}

type Props = {
  value: Record<string, number>
  food: FoodEnv
  onItem: (updates: Record<string, number>) => void
  onFoodChange: (patch: Partial<FoodEnv>) => void
  onFinished?: () => void
}

export default function PillarsStepper({ value, food, onItem, onFoodChange, onFinished }: Props) {
  const steps = useMemo(() => {
    const groups = [
      ...ELEVATE_WEIGHTS.pillarItems.EX,
      'fe_cook',
      'fe_upf',
      ...ELEVATE_WEIGHTS.pillarItems.NU,
      ...ELEVATE_WEIGHTS.pillarItems.SL,
      ...ELEVATE_WEIGHTS.pillarItems.ST,
    ] as string[]
    return groups
  }, [])

  const [stage, setStage] = useState<'intro'|'form'|'summary'>('intro')
  const [i, setI] = useState(0)
  const key = steps[i]
  const progressPct = Math.round((i / steps.length) * 100)

  const advance = () => {
    if (i < steps.length - 1) setI(i + 1)
    else setStage('summary')
  }

  const isFood = key === 'fe_cook' || key === 'fe_upf'
  const meta = LABELS[key as keyof typeof LABELS]
  const foodRefs = key === 'fe_cook'
    ? ['0 = Rarely cooking at home','1 = Once a week','2 = A couple meals/week','3 = Most dinners at home','4 = Home-cooked meals most days']
    : ['0 = Pantry packed with UPF','1 = UPF most snacks','2 = Mixed pantry choices','3 = Mostly whole-food staples','4 = Ultra-processed foods are rare']

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="font-semibold">4 Pillars</div>
        {stage==='form' && <div className="text-xs text-muted-foreground">Step {i + 1} of {steps.length}</div>}
      </div>
      {stage==='form' && (
        <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${progressPct}%` }} /></div>
      )}
      <div className="p-6">
        {stage==='intro' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Score the habits that fuel your Peak</h3>
            <p className="text-sm text-muted-foreground">These quick ratings show us where you’re already strong and where we can unlock the next level. Be real—this fuels a plan that adapts to your everyday life.</p>
            <p className="text-sm text-muted-foreground">Think of each pillar as a lever. The clearer the snapshot, the faster we can dial in results you’ll feel in energy, confidence, and performance.</p>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded border p-3 flex items-center gap-2"><Dumbbell className="h-4 w-4 text-[#3FAE52]"/> Exercise</div>
              <div className="rounded border p-3 flex items-center gap-2"><Utensils className="h-4 w-4 text-[#3FAE52]"/> Nutrition</div>
              <div className="rounded border p-3 flex items-center gap-2"><Moon className="h-4 w-4 text-[#3FAE52]"/> Sleep</div>
              <div className="rounded border p-3 flex items-center gap-2"><Smile className="h-4 w-4 text-[#3FAE52]"/> Stress</div>
            </div>
            <div>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>setStage('form')}>Start</button>
            </div>
          </div>
        )}
        {stage==='form' && (
        <>
        <AnimatePresence mode="wait">
          <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-4">
            {isFood ? (
              <>
                <h3 className="text-xl font-semibold leading-tight">{key === 'fe_cook' ? 'How often do you cook at home?' : 'Ultra‑processed foods at home'}</h3>
                <p className="text-sm text-muted-foreground">Tap the number that best describes your kitchen environment today.</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {[0,1,2,3,4].map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`h-11 px-3 rounded-md border ${((key==='fe_cook'?food.cook0_4:food.upf0_4) === n)?'bg-[#3FAE52] border-[#3FAE52] text-white':'hover:bg-accent'}`}
                        onClick={()=>{
                          if (key==='fe_cook') onFoodChange({ cook0_4: n })
                          else onFoodChange({ upf0_4: n })
                          advance()
                        }}
                      >{n}</button>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>{foodRefs[0]}</span>
                    <span>{foodRefs[4]}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[10px] text-muted-foreground">
                    {foodRefs.map((ref, idx)=>(<div key={ref} className={`p-2 rounded border ${((key==='fe_cook'?food.cook0_4:food.upf0_4) === idx)?'border-[#3FAE52] bg-[#3FAE52]/10':'border-dashed'}`}>{ref}</div>))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold leading-tight">{meta?.title ?? key}</h3>
                {meta?.help && <p className="text-sm text-muted-foreground">{meta.help}</p>}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {[0,1,2,3,4].map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`h-11 px-3 rounded-md border ${((value[key] ?? 0) === n)?'bg-[#3FAE52] border-[#3FAE52] text-white':'hover:bg-accent'}`}
                        onClick={()=>{ onItem({ [key]: n }); advance() }}
                      >{n}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[10px] text-muted-foreground">
                    {['0','1','2','3','4'].map((label, idx)=> (
                      <div key={label} className={`p-2 rounded border ${((value[key] ?? 0) === idx)?'border-[#3FAE52] bg-[#3FAE52]/10':'border-dashed'}`}>
                        <div className="font-medium text-xs mb-1">{idx}</div>
                        <div>{
                          idx === 0 ? (meta?.baseline ?? 'Finding footing') :
                          idx === 4 ? (meta?.topline ?? 'Locked in weekly') :
                          idx === 1 ? 'Momentum starting' :
                          idx === 2 ? 'On the upswing' :
                          'Almost automatic'
                        }</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center justify-between mt-4">
          <button type="button" disabled={i===0} className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setI(Math.max(0,i-1))}>Back</button>
          <div className="text-xs text-muted-foreground">Small daily behaviors drive big change.</div>
        </div>
        </>
        )}
        {stage==='summary' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Great work—quick recap</h3>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border p-3 bg-card/60">
                <div className="font-medium mb-2">Food environment snapshot</div>
                <div className="flex flex-col gap-1">
                  <span>Cooking at home: <b>{food.cook0_4}/4</b></span>
                  <span>Ultra-processed foods: <b>{food.upf0_4}/4</b></span>
                </div>
              </div>
              <div className="rounded border p-3 bg-card/60">
                <div className="font-medium mb-2">Pillar momentum</div>
                <div className="grid grid-cols-2 gap-2">
                  {steps.filter(k=>!k.startsWith('fe_')).map(k=> {
                    const friendly = LABELS[k as keyof typeof LABELS]?.title ?? k
                    return (
                      <div key={k} className="rounded-md border p-2 flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{friendly}</span>
                        <span className="font-medium text-sm">{value[k] ?? 0}/4</span>
                      </div>
                    )
                  })}
                </div>
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
