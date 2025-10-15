import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  value: Partial<{
    dob: string | null;
    chest_pain: boolean; dizziness: boolean; dx_condition: boolean; sob_mild: boolean;
    joint_issue: boolean; balance_neuro: boolean; uncontrolled_bp_dm: string | null;
    recent_surgery: boolean; pregnancy_postpartum: string | null; clearance_level: string | null;
  }>
  onChange: (patch: Props['value']) => void
  onFinished?: () => void
}

export default function ParqCard({ value, onChange, onFinished }: Props) {
  const [stage, setStage] = useState<'intro'|'form'|'summary'>('intro')
  const steps = useMemo(() => ([
    { key: 'dob', type: 'date', title: 'What is your date of birth?', help: 'We use your birth date to calculate your age for health age, risk scoring, and training prescriptions.' },
    { key: 'chest_pain', type: 'boolean', title: 'Do you ever feel chest discomfort with activity?', help: 'If you’ve felt pressure, tightness, or pain in your chest while moving or exercising, choose Yes.' },
    { key: 'dizziness', type: 'boolean', title: 'Any dizziness or fainting spells?', help: 'Feeling lightheaded or faint can be a sign to check in with a clinician before intense activity.' },
    { key: 'dx_condition', type: 'boolean', title: 'Have you been diagnosed with a condition that needs medical care?', help: 'Examples include heart disease, uncontrolled diabetes, or other conditions needing ongoing care.' },
    { key: 'sob_mild', type: 'boolean', title: 'Shortness of breath with easy or mild activity?', help: 'If walking across a room or climbing a few stairs leaves you unusually winded, choose Yes.' },
    { key: 'joint_issue', type: 'boolean', title: 'Any bone or joint concerns we should know about?', help: 'Knee, hip, shoulder, or back issues that limit movement or cause pain.' },
    { key: 'balance_neuro', type: 'boolean', title: 'Any balance or neurological concerns?', help: 'For example, frequent balance loss, weakness, numbness, or coordination changes.' },
    { key: 'recent_surgery', type: 'boolean', title: 'Recent surgery?', help: 'If you’ve had surgery in the last few months, select Yes.' },
    { key: 'uncontrolled_bp_dm', type: 'text', title: 'Uncontrolled blood pressure or diabetes?', help: 'Optional: add any details you want us to be aware of.' },
    { key: 'pregnancy_postpartum', type: 'text', title: 'Pregnancy or postpartum considerations?', help: 'Optional: add any details (e.g., weeks postpartum).' },
  ] as const), [])

  const [i, setI] = useState(0)
  const s = steps[i]

  const riskKeys = ['chest_pain','dizziness','dx_condition','sob_mild','joint_issue','balance_neuro','recent_surgery'] as const
  const highRisk = riskKeys.some((k) => (value as any)?.[k]) || (value.uncontrolled_bp_dm?.length ?? 0) > 0
  const clearance = highRisk ? 'needs_clearance' : (value.clearance_level ?? 'cleared_all')

  const progressPct = Math.round(((i) / steps.length) * 100)

  const answerBool = (key: string, val: boolean) => {
    onChange({ [key]: val } as any)
    if (i < steps.length - 1) setI(i + 1)
    else setStage('summary')
  }

  const [inputVal, setInputVal] = useState<string>('')
  const commitInput = (key: string) => {
    onChange({ [key]: inputVal || '' } as any)
    if (i < steps.length - 1) setI(i + 1)
    else setStage('summary')
  }

  // Keep local text in sync when changing steps or value
  useEffect(() => {
    if (s.type === 'text' || s.type === 'date') {
      const v = (value as any)?.[s.key]
      setInputVal(typeof v === 'string' ? v : '')
    } else {
      setInputVal('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.key])

  return (
    <div className="border rounded-lg p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="font-semibold">PAR-Q</div>
        <span className={`text-xs px-2 py-1 rounded ${clearance==='needs_clearance'?'bg-amber-500/20 text-amber-600':'bg-emerald-500/20 text-emerald-600'}`}>
          {clearance==='needs_clearance' ? 'Needs clearance' : 'Cleared'}
        </span>
      </div>
      {stage==='form' && (
        <div className="h-1 w-full bg-muted">
          <div className="h-1 bg-[#3FAE52] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="p-6 space-y-4">
        {stage==='intro' && (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Clear the runway for your goal</h3>
            <p className="text-sm text-muted-foreground">These quick safety questions make sure we can push hard, smart, and confidently together. Answer honestly so we can dial in the right starting point.</p>
            <div>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>setStage('form')}>Begin check-in</button>
            </div>
          </div>
        )}
        {stage==='form' && (
        <>
        <AnimatePresence mode="wait">
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="text-xs text-muted-foreground">Step {i+1} of {steps.length}</div>
            <h3 className="text-xl font-semibold leading-tight">{s.title}</h3>
            {s.help && <p className="text-sm text-muted-foreground">{s.help}</p>}

            {s.type === 'boolean' && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button type="button" onClick={()=>answerBool(s.key, true)} className="flex-1 h-12 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white text-base shadow">
                  Yes
                </button>
                <button type="button" onClick={()=>answerBool(s.key, false)} className="flex-1 h-12 rounded-md bg-neutral-200 hover:bg-neutral-300 text-neutral-900 text-base">
                  No
                </button>
              </div>
            )}

            {(s.type === 'text' || s.type === 'date') && (
              <div className="space-y-3">
                <input
                  type={s.type === 'date' ? 'date' : 'text'}
                  className="w-full h-11 px-3 border rounded-md"
                  placeholder={s.type === 'date' ? undefined : 'Add details (optional)'}
                  value={inputVal}
                  onChange={(e)=>setInputVal(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={()=>commitInput(s.key)} className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white">Next</button>
                  <button type="button" onClick={()=>{ setInputVal(''); commitInput(s.key) }} className="px-4 h-10 rounded-md border">None</button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between pt-2">
          <button type="button" disabled={i===0} onClick={()=>setI(Math.max(0, i-1))} className="px-3 py-2 rounded border disabled:opacity-50">Back</button>
          <div className="text-xs text-muted-foreground">Your answers help us tailor a safe, effective plan.</div>
        </div>
        </>
        )}

        {stage==='summary' && (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">PAR-Q summary</h3>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
              <div className="md:col-span-2 flex items-center justify-between rounded border p-2">
                <span className="text-muted-foreground">Date of birth</span>
                <span className="font-medium">{value.dob || '—'}</span>
              </div>
              {['chest_pain','dizziness','dx_condition','sob_mild','joint_issue','balance_neuro','recent_surgery'].map(k => (
                <div key={k} className="flex items-center justify-between rounded border p-2">
                  <span className="text-muted-foreground">{k.replace('_',' ')}</span>
                  <span className="font-medium">{(value as any)?.[k] ? 'Yes' : 'No'}</span>
                </div>
              ))}
              <div className="md:col-span-2 rounded border p-2">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm">Uncontrolled BP/DM: <b>{value.uncontrolled_bp_dm || '—'}</b> • Pregnancy/Postpartum: <b>{value.pregnancy_postpartum || '—'}</b></div>
              </div>
            </div>
            {highRisk && (
              <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">
                Based on responses, consider medical clearance before higher-intensity exercise.
              </div>
            )}
            <div>
              <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={()=>onFinished?.()}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
