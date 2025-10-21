import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const patterns = [
  {
    key: 'Squat',
    title: 'Squat Screen',
    description: 'Capture 45 seconds from a side or 45° angle to see depth, tempo, and trunk control in motion.'
  },
  {
    key: 'Lunge',
    title: 'Lunge Screen',
    description: 'Front or 45° view highlights pelvic control, shin path, and pushback mechanics for every stride.'
  },
  {
    key: 'Hinge',
    title: 'Hinge Screen',
    description: 'Review hip hinge ratio, lumbar neutrality, and lockout finish with cues surfaced automatically.'
  },
  {
    key: 'Push',
    title: 'Push Screen',
    description: 'Score setup, range, tempo, and symmetry for push patterns to dial in strength progressions.'
  },
  {
    key: 'Pull',
    title: 'Pull Screen',
    description: 'Evaluate torso stillness, scap timing, elbow path, and grip control for confident rows.'
  }
] as const

export default function ElevateScreenLandingPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const clientId = params.get('clientId')
  const [clientName, setClientName] = useState<string | null>(null)

  useEffect(() => {
    const fetchClient = async () => {
      if (!clientId) {
        setClientName(null)
        return
      }
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('first_name, last_name, email, phone')
          .eq('id', clientId)
          .maybeSingle()
        if (error) {
          console.error('[ElevateScreenLandingPage] failed to load client', error)
          setClientName(null)
          return
        }
        if (!data) {
          setClientName(null)
          return
        }
        const name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
        setClientName(name || null)
      } catch (err) {
        console.error('[ElevateScreenLandingPage] client lookup error', err)
        setClientName(null)
      }
    }
    void fetchClient()
  }, [clientId])

  return (
    <RequireTrainer>
      <Layout>
        <div className="mx-auto max-w-6xl px-6 py-12 space-y-12">
          <section className="space-y-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Peak Fitness • Elevate Movement Screen
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight break-words">
              {`Let’s capture the story inside ${clientName ?? 'your client'}’s movement.`}
            </h1>
            <p className="mx-auto max-w-3xl text-[15px] md:text-lg text-muted-foreground">
              A clean 45-second capture unlocks coach-ready insights on depth, tempo, and control. We guide camera setup, record with confidence, and surface the cues you’ll use to progress every session.
            </p>
            <div className="grid gap-3 text-left md:grid-cols-2">
              <div className="rounded-lg border bg-card/80 p-4">
                <div className="text-sm font-semibold">Camera Setup & Framing</div>
                <div className="mt-1 text-sm text-muted-foreground">Portrait-first guidance keeps the full athlete in view so Pose AI can read every joint.</div>
              </div>
              <div className="rounded-lg border bg-card/80 p-4">
                <div className="text-sm font-semibold">Guided 45-Second Capture</div>
                <div className="mt-1 text-sm text-muted-foreground">Countdown, haptics, and a timer ring keep pace while you coach positioning in real time.</div>
              </div>
              <div className="rounded-lg border bg-card/80 p-4">
                <div className="text-sm font-semibold">AI Rep Analysis</div>
                <div className="mt-1 text-sm text-muted-foreground">Automatic scoring for depth, tempo, valgus, and stability translates reps into actionable feedback.</div>
              </div>
              <div className="rounded-lg border bg-card/80 p-4">
                <div className="text-sm font-semibold">Coach-Ready Hand-off</div>
                <div className="mt-1 text-sm text-muted-foreground">Save screens, sync the Elevation Map, and hand off next-step cues with confidence.</div>
              </div>
            </div>
          </section>

          <section id="movement-screen-patterns" className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold">Choose the pattern you’re screening</h2>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Pick the movement in front of you. We’ll walk the capture, analyze reps, and push the results straight into Elevate.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {patterns.map((pattern) => (
                <div key={pattern.key} className="rounded-lg border bg-card p-5 space-y-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">{pattern.key}</div>
                    <h3 className="text-lg font-semibold">{pattern.title}</h3>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate(`/elevate/screen/${pattern.key.toLowerCase()}${clientId ? `?clientId=${clientId}` : ''}`)}
                  >Start Screen</Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
