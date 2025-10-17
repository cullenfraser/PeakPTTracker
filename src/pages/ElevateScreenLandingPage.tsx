import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const patterns = [
  { key: 'Squat', title: 'Squat', description: 'Assess depth control, knee tracking, trunk brace, and foot stability.' },
  { key: 'Lunge', title: 'Lunge', description: 'Check knee path, pelvic control, shin angle, and pushback mechanics.' },
  { key: 'Hinge', title: 'Hinge', description: 'Review hip hinge ratio, lumbar neutrality, mid-foot path, and lockout finish.' },
  { key: 'Push', title: 'Push', description: 'Score setup, range, tempo, and symmetry for push patterns.' },
  { key: 'Pull', title: 'Pull', description: 'Evaluate torso stillness, scap timing, elbow path, and grip control.' }
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
        const { data, error } = await supabase.from('clients').select('first_name, last_name').eq('id', clientId).maybeSingle()
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

  const header = useMemo(() => {
    const suffix = clientName ?? (clientId ? `client ${clientId}` : null)
    return suffix ? `Movement Screen for ${suffix}` : 'Movement Screen'
  }, [clientId, clientName])

  return (
    <RequireTrainer>
      <Layout>
        <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Elevate • Movement Screen
            </div>
            <h1 className="text-3xl font-semibold break-words">{header}</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Capture 2–3 quality reps per pattern with live pose guidance. Each screen feeds into the Elevation Map to shape the plan of action.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {patterns.map((pattern) => (
              <div key={pattern.key} className="rounded-lg border bg-card p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{pattern.title}</h2>
                  <p className="text-sm text-muted-foreground">{pattern.description}</p>
                </div>
                <Button
                  onClick={() => navigate(`/elevate/screen/${pattern.key.toLowerCase()}${clientId ? `?clientId=${clientId}` : ''}`)}
                >Start Screen</Button>
              </div>
            ))}
          </div>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
