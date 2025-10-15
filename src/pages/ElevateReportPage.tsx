import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import HeroTiles from '@/features/elevate/components/Results/HeroTiles'

export default function ElevateReportPage() {
  const { sessionId } = useParams()
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<any | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!sessionId) return
      setLoading(true)
      const { data } = await (supabase as any)
        .from('elevate_session')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()
      setRow(data ?? null)
      setLoading(false)
    }
    void run()
  }, [sessionId])

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Elevate Report</h1>
          <p className="text-sm text-muted-foreground">Read-only summary</p>
        </div>
        {loading && <div className="py-12 text-center text-muted-foreground">Loading…</div>}
        {!loading && row && (
          <>
            <HeroTiles peak={row.peak ?? 0} chronAge={0} healthAge={row.health_age ?? 0} delta={row.health_age_delta ?? 0} />
          </>
        )}
      </div>
    </Layout>
  )
}
