import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { supabase } from '@/lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

interface SimpleClient { id: string; first_name: string; last_name: string; email: string | null; phone: string | null }

export default function ElevateLandingPage() {
  const [clients, setClients] = useState<SimpleClient[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [lead, setLead] = useState({ first: '', last: '', email: '', phone: '' })
  const [leadSaving, setLeadSaving] = useState(false)
  const [leadError, setLeadError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email, phone')
        .order('first_name')
        .limit(200)
      setClients(data ?? [])
      setLoading(false)
    }
    void run()
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return clients
    return clients.filter(c =>
      (c.first_name + ' ' + c.last_name).toLowerCase().includes(term)
      || (c.email ?? '').toLowerCase().includes(term)
      || (c.phone ?? '').toLowerCase().includes(term)
    )
  }, [clients, q])

  return (
    <RequireTrainer>
      <Layout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Elevate</h1>
            <p className="text-sm text-muted-foreground">Start a new in-person consult session.</p>
          </div>

          <div className="border rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Start new lead</h2>
              {leadSaving && <span className="text-xs text-muted-foreground">Creating…</span>}
            </div>
            {leadError && <div className="text-sm text-red-600 border border-red-300 bg-red-50 rounded p-2">{leadError}</div>}
            <div className="grid md:grid-cols-2 gap-3">
              <input className="h-10 px-3 border rounded" placeholder="First name" value={lead.first} onChange={(e)=>setLead(l=>({ ...l, first: e.target.value }))} />
              <input className="h-10 px-3 border rounded" placeholder="Last name" value={lead.last} onChange={(e)=>setLead(l=>({ ...l, last: e.target.value }))} />
              <input className="h-10 px-3 border rounded" placeholder="Email (optional)" value={lead.email} onChange={(e)=>setLead(l=>({ ...l, email: e.target.value }))} />
              <input className="h-10 px-3 border rounded" placeholder="Phone (optional)" value={lead.phone} onChange={(e)=>setLead(l=>({ ...l, phone: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded bg-[#3FAE52] text-white disabled:opacity-50"
                disabled={leadSaving}
                onClick={async ()=>{
                  setLeadError(null)
                  const first = lead.first.trim()
                  const last = lead.last.trim()
                  const email = lead.email.trim() || null
                  const phone = lead.phone.trim() || null
                  if (!first || !last) {
                    setLeadError('First and last name are required')
                    return
                  }
                  setLeadSaving(true)
                  try {
                    const { data, error } = await (supabase as any)
                      .from('clients')
                      .insert({ first_name: first, last_name: last, email, phone })
                      .select('id')
                      .single()
                    if (error) {
                      // If email unique constraint exists and this triggers, try to lookup existing by email
                      if (email) {
                        const { data: existing } = await (supabase as any)
                          .from('clients')
                          .select('id')
                          .eq('email', email)
                          .maybeSingle()
                        if (existing?.id) {
                          navigate(`/elevate/${existing.id}/new`)
                          return
                        }
                      }
                      throw error
                    }
                    if (data?.id) {
                      navigate(`/elevate/${data.id}/new`)
                      return
                    }
                    setLeadError('Failed to create lead')
                  } catch (e: any) {
                    setLeadError(e?.message || 'Failed to create lead')
                  } finally {
                    setLeadSaving(false)
                  }
                }}
              >Start with new lead</button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              className="w-full md:w-96 h-10 px-3 border rounded-md bg-background"
              placeholder="Search clients by name, email, or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Loading clients…</div>
          ) : (
            <div className="border rounded-md divide-y">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No clients found.</div>
              ) : (
                filtered.map((c) => (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-3 hover:bg-accent/40">
                    <div>
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-muted-foreground">{c.email ?? '—'} {c.phone ? `• ${c.phone}` : ''}</div>
                    </div>
                    <Link to={`/elevate/${c.id}/new`} className="px-3 py-2 rounded-md bg-[#3FAE52] text-white text-sm">Start session</Link>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Layout>
    </RequireTrainer>
  )
}
