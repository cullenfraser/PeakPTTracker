import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Grip } from '../../domain/types'

type Props = {
  value: Grip
  weight: number
  onChange: (patch: Partial<Grip>) => void
  onFinished?: () => void
}

export default function GripStepper({ value, weight, onChange, onFinished }: Props) {
  const steps = useMemo(() => ([
    { key: 'left', title: 'Grip strength – Left hand (kgf)', help: 'Use the best of 3 attempts.' },
    { key: 'right', title: 'Grip strength – Right hand (kgf)', help: 'Use the best of 3 attempts.' },
  ] as const), [])

  const [stage, setStage] = useState<'intro'|'form'|'summary'>('intro')
  const [i, setI] = useState(0)
  const s = steps[i]
  const progressPct = Math.round(i/steps.length*100)
  const [val, setVal] = useState<string>('')

  const commit = () => {
    const num = Number(val)
    const safe = Number.isFinite(num) ? +num.toFixed(1) : 0
    onChange({ [s.key]: safe } as any)
    if (i < steps.length - 1) {
      setI(i+1)
      setVal('')
    } else {
      setStage('summary')
    }
  }

  // initialize current value
  const current = (value as any)[s.key]
  if (val === '' && typeof current === 'number' && current > 0) {
    setTimeout(()=>setVal(String(current)),0)
  }

  const rel = (() => {
    const sum = (value.left ?? 0) + (value.right ?? 0)
    return weight ? +(sum / weight).toFixed(3) : 0
  })()

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="font-semibold">Grip Strength</div>
        {stage==='form' && <div className="text-xs text-muted-foreground">Step {i+1} of {steps.length}</div>}
      </div>
      {stage==='form' && (
        <div className="h-1 bg-muted"><div className="h-1 bg-[#3FAE52]" style={{ width: `${progressPct}%` }} /></div>
      )}
      <div className="p-6">
        {stage==='intro' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Show us your strength baseline</h3>
            <p className="text-sm text-muted-foreground">Two quick squeezes tell us a ton about total-body strength, resilience, and longevity. Give us your best attempts—we’ll celebrate the improvement each time you return.</p>
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
            <p className="text-sm text-muted-foreground">{s.help}</p>
            <div className="space-y-3">
              <input className="w-full h-11 px-3 border rounded-md" type="number" value={val} onChange={(e)=>setVal(e.target.value)} />
              <div className="flex items-center gap-2">
                <button type="button" className="px-4 h-10 rounded-md bg-[#3FAE52] hover:bg-[#339449] text-white" onClick={commit}>Next</button>
                <button type="button" className="px-4 h-10 rounded-md border" onClick={()=>{ setVal(''); commit() }}>Skip</button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Relative grip (auto): <b>{rel}</b></div>
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center justify-between mt-4">
          <button type="button" disabled={i===0} className="px-3 py-2 rounded border disabled:opacity-50" onClick={()=>setI(Math.max(0,i-1))}>Back</button>
          <div className="text-xs text-muted-foreground">Grip reflects total-body strength capacity.</div>
        </div>
        </>
        )}
        {stage==='summary' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Grip recap</h3>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3"><div className="text-muted-foreground text-xs mb-1">Left</div><div className="font-medium">{value.left ?? 0} kgf</div></div>
              <div className="rounded border p-3"><div className="text-muted-foreground text-xs mb-1">Right</div><div className="font-medium">{value.right ?? 0} kgf</div></div>
              <div className="rounded border p-3"><div className="text-muted-foreground text-xs mb-1">Relative</div><div className="font-medium">{rel}</div></div>
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
