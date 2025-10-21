import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { supabase } from '@/lib/supabase'
import PulseForm from '@/features/pulse/PulseForm'

export default function PulsePage() {
  const [params] = useSearchParams()
  const clientId = params.get('clientId')
  const [clientName, setClientName] = useState<string>('Your client')
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null)

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
      const { data: check }: any = await supabase
        .from('checkins' as any)
        .select('date')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(1)
      if (!active) return
      if (check && check.length > 0) setLastSubmitted(new Date(check[0].date).toLocaleDateString())
    })()
    return () => { active = false }
  }, [clientId])

  const header = useMemo(() => `Pulse • Monthly Check-in for ${clientName}`, [clientName])

  return (
    <RequireTrainer>
      <Layout>
        <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Elevate • Pulse</div>
            <h1 className="text-2xl md:text-3xl font-bold break-words">{header}</h1>
            {lastSubmitted && (
              <div className="text-xs text-muted-foreground">Last submission: {lastSubmitted}</div>
            )}
          </div>

          <PulseForm clientId={clientId} />
        </div>
      </Layout>
    </RequireTrainer>
  )
}
