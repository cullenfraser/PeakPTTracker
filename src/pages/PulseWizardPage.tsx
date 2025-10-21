import { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PulseForm from '@/features/pulse/PulseForm'

const stepLabels = [
  'Set the scene',
  'Readiness snapshot',
  'Goals & habits',
  'Vitals & InBody',
  'PAR-Q changes',
  'KPI follow-ups',
  'Reflection',
  'Scheduling',
] as const

export default function PulseWizardPage() {
  const [params] = useSearchParams()
  const clientId = params.get('clientId')
  const [clientName, setClientName] = useState<string>('Your client')
  const [introDone, setIntroDone] = useState(false)
  const [step, setStep] = useState(0)
  const [timer, setTimer] = useState(0)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Helpers to detect skipped steps (sections can set data-skip="true")
  const getStepEl = (idx: number) => containerRef.current?.querySelector<HTMLElement>(`[data-pulse-step][data-step-index="${idx}"]`)
  const isSkipped = (idx: number) => {
    const el = getStepEl(idx)
    return el?.getAttribute('data-skip') === 'true'
  }
  const computeIndex = (start: number, dir: 1 | -1) => {
    let i = start
    const last = stepLabels.length - 1
    while (i >= 0 && i <= last && isSkipped(i)) {
      i += dir
    }
    if (i < 0) return 0
    if (i > last) return last
    return i
  }

  useEffect(() => {
    const id = window.setInterval(() => setTimer((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!clientId) return
      const { data } = await supabase
        .from('clients')
        .select('first_name,last_name')
        .eq('id', clientId)
        .maybeSingle()
      if (!active) return
      if (data) {
        const nm = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
        setClientName(nm || 'Your client')
      }
    })()
    return () => {
      active = false
    }
  }, [clientId])

  // Control which PulseForm step is visible by toggling display on data-pulse-step sections
  useEffect(() => {
    if (!introDone) return
    const root = containerRef.current
    if (!root) return
    const form = root.querySelector('form[data-pulse-form]') as HTMLFormElement | null
    if (!form) return
    const sections = Array.from(form.querySelectorAll<HTMLElement>('[data-pulse-step]'))
    sections.forEach((el) => {
      const idx = Number(el.getAttribute('data-step-index') || '-1')
      el.style.display = idx === step ? '' : 'none'
    })
    // Scroll to form top on step change for focus
    form.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [introDone, step])

  // If the current step becomes marked as skipped (after async data loads), auto-advance to the next non-skipped step
  useEffect(() => {
    if (!introDone) return
    if (isSkipped(step)) {
      const next = computeIndex(step + 1, +1)
      if (next !== step) setStep(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introDone, step])

  const header = useMemo(() => `Pulse • Monthly Check-in for ${clientName}`, [clientName])

  const handleSubmitPulse = () => {
    const form = containerRef.current?.querySelector('form[data-pulse-form]') as HTMLFormElement | null
    if (form?.requestSubmit) form.requestSubmit()
    else form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  // Listen for form-driven navigation events
  useEffect(() => {
    const onNext = () => setStep((s) => computeIndex(Math.min(stepLabels.length - 1, s + 1), +1))
    const onPrev = () => setStep((s) => computeIndex(Math.max(0, s - 1), -1))
    const onSubmit = () => handleSubmitPulse()
    const onSaving = (e: Event) => {
      try {
        const ce = e as CustomEvent<boolean>
        setSaving(Boolean(ce.detail))
      } catch {}
    }
    window.addEventListener('pulse:next', onNext)
    window.addEventListener('pulse:prev', onPrev)
    window.addEventListener('pulse:submit', onSubmit)
    window.addEventListener('pulse:saving', onSaving as EventListener)
    return () => {
      window.removeEventListener('pulse:next', onNext)
      window.removeEventListener('pulse:prev', onPrev)
      window.removeEventListener('pulse:submit', onSubmit)
      window.removeEventListener('pulse:saving', onSaving as EventListener)
    }
  }, [])

  if (!introDone) {
    return (
      <RequireTrainer>
        <Layout>
          <section className="relative w-full">
            <div className="mx-auto max-w-5xl px-6 py-14 md:py-20">
              <div className="space-y-8 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Peak Fitness • Pulse Check-in
                </div>
                <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                  {`Quick monthly pulse for ${clientName}.`}
                </h1>
                <p className="mx-auto max-w-3xl text-[15px] md:text-lg text-muted-foreground">
                  Pulse is a guided check-in designed to feel like a fast quiz—readiness, adherence, and a few targeted follow-ups. In minutes, you’ll capture what matters and keep momentum visible.
                </p>
                <div className="grid gap-3 text-left md:grid-cols-2">
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Readiness & Attendance</div>
                    <div className="mt-1 text-sm text-muted-foreground">Log energy, soreness, sleep, stress, and adherence to surface coaching nudges.</div>
                  </div>
                  <div className="rounded-lg border bg-card/80 p-4">
                    <div className="text-sm font-semibold">Goals & Focus</div>
                    <div className="mt-1 text-sm text-muted-foreground">Update SMART goals and pillars so the next 4 weeks have one clear focus.</div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="h-12 px-6 rounded-md bg-[#3FAE52] text-white text-base font-semibold disabled:opacity-60"
                    onClick={() => setIntroDone(true)}
                  >Begin</button>
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
        <div ref={containerRef} className="mx-auto w-full max-w-4xl px-6 py-6 pb-28">
          <header className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Elevate • Pulse</div>
            <h1 className="text-2xl md:text-3xl font-bold break-words">{header}</h1>
          </header>

          <section className="mt-6">
            <PulseForm clientId={clientId} showSubmitCTA={false} />
          </section>
        </div>

        {/* Bottom progress/timer bar (consult-style) */}
        <div className="sticky bottom-0 inset-x-0 z-40 border-t bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="hidden text-xs text-muted-foreground md:block">{`Step ${Math.min(step+1, stepLabels.length)} of ${stepLabels.length}`} • {stepLabels[step]}</div>
              <div className="h-1 w-40 overflow-hidden rounded bg-muted">
                <div className="h-1 bg-[#3FAE52]" style={{ width: `${Math.round(((Math.min(step, stepLabels.length-1)+1)/stepLabels.length)*100)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{saving ? 'Saving…' : 'Saved'}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">Time {Math.floor(timer/60)}:{String(timer%60).padStart(2,'0')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-3 py-2 rounded border text-sm" onClick={()=>handleSubmitPulse()}>Save</button>
            </div>
          </div>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
