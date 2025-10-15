import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { InBody, Vitals } from '../../domain/types'
import { Activity, Ruler, Scale } from 'lucide-react'
import { computeWHtR } from '../../domain/compute'

 type Props = {
  vitals: Vitals
  inbody: InBody
  onChange: (vPatch: Partial<Vitals>, ibPatch: Partial<InBody>) => void
  onFinished?: () => void
}

export default function VitalsStepper({ vitals, inbody, onChange, onFinished }: Props) {
  const [stage, setStage] = useState<'intro'|'form'|'summary'>('intro')
  const steps = useMemo(() => ([
    { key: 'rhr', type: 'vital' as const, title: 'Resting heart rate (bpm)', help: 'Measure after sitting quietly for a few minutes.' },
    { key: 'sbp', type: 'vital' as const, title: 'Systolic blood pressure (mmHg)', help: 'Top number (optional if unknown).' },
    { key: 'dbp', type: 'vital' as const, title: 'Diastolic blood pressure (mmHg)', help: 'Bottom number (optional if unknown).' },
    { key: 'height', type: 'inbody' as const, title: 'Height (cm)', help: 'Use stadiometer or recent measurement.' },
    { key: 'waist', type: 'inbody' as const, title: 'Waist (cm)', help: 'Around the navel, relaxed.' },
    { key: 'weight', type: 'inbody' as const, title: 'Weight (kg)', help: 'From scale.' },
    { key: 'bf', type: 'inbody' as const, title: 'Body fat %', help: 'From InBody or other device.' },
    { key: 'smm', type: 'inbody' as const, title: 'Skeletal Muscle Mass (kg)', help: 'From InBody.' },
    { key: 'vat', type: 'inbody' as const, title: 'Visceral Fat Level', help: 'From InBody (optional).' },
  ]), [])

  const [i, setI] = useState(0)
  const s = steps[i]
  const progressPct = Math.round(i / steps.length * 100)

  const [val, setVal] = useState<string>('')

  const syncVal = () => {
    let num = val.trim() === '' ? '' : Number(val)
    if (Number.isNaN(num)) num = ''
    if (s.type === 'vital') {
      if (s.key === 'rhr') onChange({ rhr: (num as number) || 0 }, {})
      if (s.key === 'sbp') onChange({ sbp: (val.trim()===''? undefined : (num as number)) }, {})
      if (s.key === 'dbp') onChange({ dbp: (val.trim()===''? undefined : (num as number)) }, {})
    } else {
      onChange({}, { [s.key]: (num as number) || 0 } as any)
    }
  }

  const advance = () => {
    syncVal()
    if (i < steps.length - 1) setI(i+1)
    else setStage('summary')
    setVal('')
  }

  const currentValue = (): string => {
    if (s.type === 'vital') {
      const v = (vitals as any)[s.key]
      return v === undefined || v === null ? '' : String(v)
    }
    const v = (inbody as any)[s.key]
    return v === undefined || v === null ? '' : String(v)
  }

  // initialize input when step changes
  const init = currentValue()
  if (val === '' && init !== '') {
    setTimeout(()=>setVal(init),0)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="font-semibold">Vitals & InBody</div>
        {stage==='form' && <div className="text-xs text-muted-foreground">Step {i+1} of {steps.length}</div>}
      </div>
      {stage==='form' && (
        <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${progressPct}%` }} /></div>
      )}
      <div className="p-6">
        {stage==='intro' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Lock in the data that accelerates change</h3>
            <p className="text-sm text-muted-foreground">These snapshots tell us exactly how your body is responding. The clearer the data, the more precise—and motivating—your plan becomes.</p>
            <p className="text-sm text-muted-foreground">We’ll capture each number one at a time. You focus on showing up; Elevate will translate it into progress you can feel and measure.</p>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3 flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-600"/> Heart & BP</div>
              <div className="rounded border p-3 flex items-center gap-2"><Ruler className="h-4 w-4 text-emerald-600"/> Waist & Height</div>
              <div className="rounded border p-3 flex items-center gap-2"><Scale className="h-4 w-4 text-emerald-600"/> Weight & Body Comp</div>
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
            <div className="space-y-3">
              <input className="w-full h-11 px-3 border rounded-md" type="number" value={val} onChange={(e)=>setVal(e.target.value)} />
              <div className="flex items-center gap-2">
                <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={advance}>Next</button>
                <button type="button" className="px-4 h-10 rounded-md border" onClick={()=>{ setVal(''); advance() }}>Skip</button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center justify-between mt-4">
          <button type="button" disabled={i===0} className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setI(Math.max(0,i-1))}>Back</button>
          <div className="text-xs text-muted-foreground">Objective data makes your plan precise.</div>
        </div>
        </>
        )}
        {stage==='summary' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Vitals recap</h3>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="font-medium mb-1">Heart & BP</div>
                <div>RHR: <b>{vitals.rhr}</b> • BP: <b>{vitals.sbp ?? '—'}/{vitals.dbp ?? '—'}</b></div>
              </div>
              <div className="rounded border p-3">
                <div className="font-medium mb-1">Measurements</div>
                <div>Height: <b>{inbody.height}</b>cm • Waist: <b>{inbody.waist}</b>cm • WHtR: <b>{computeWHtR(inbody.waist, inbody.height)}</b></div>
              </div>
              <div className="rounded border p-3">
                <div className="font-medium mb-1">Body Comp</div>
                <div>Weight: <b>{inbody.weight}</b>kg • BF%: <b>{inbody.bf}</b> • SMM: <b>{inbody.smm}</b> • VAT: <b>{inbody.vat}</b></div>
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
