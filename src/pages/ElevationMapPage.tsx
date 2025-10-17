import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { useSearchParams } from 'react-router-dom'

interface ElevationTiles {
  safety: { status: string | null; notes: string | null }
  goals: { status: string | null; notes: string | null }
  habits: { consistency_pct: number | null; commentary: string | null }
  grip: { delta_pct: number | null; commentary: string | null }
  body_comp: { delta: number | null; commentary: string | null }
  movement: { quality_score: number | null; priorities: string[]; failing_kpis: { key: string; why: string; cues: string[] }[] }
}

interface ElevationPlan {
  actions: { kpi: string; focus: string; regression: string | null; progression: string | null }[]
  notes: string | null
}

interface ElevationPriorities {
  highlights: string[]
  rationale: { key: string; why: string; cues: string[] }[]
}

interface FuseResponse {
  snapshotId: string
  createdAt: string
  tiles: ElevationTiles
  priorities: ElevationPriorities
  plan: ElevationPlan | null
}

const formatScore = (score: number | null | undefined) => (typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : '—')

const movementPriorityLabel: Record<string, string> = {
  squat_depth_control: 'Depth control',
  squat_knee_tracking: 'Knee tracking',
  squat_trunk_brace: 'Trunk brace',
  squat_foot_stability: 'Foot stability',
  lunge_front_knee_path: 'Front knee path',
  lunge_pelvis_control: 'Pelvis control',
  lunge_depth_symmetry: 'Depth symmetry',
  lunge_push_back_drive: 'Push-back drive',
  hinge_hip_ratio: 'Hip/hinge ratio',
  hinge_spine_neutral: 'Spine neutral',
  hinge_midfoot_pressure: 'Midfoot pressure',
  hinge_lockout_finish: 'Lockout finish',
  push_setup_brace: 'Setup & brace',
  push_range_control: 'Range control',
  push_tempo_bracing: 'Tempo & brace',
  push_symmetry_stability: 'Symmetry & stability',
  pull_torso_brace: 'Torso brace',
  pull_scap_timing: 'Scap timing',
  pull_elbow_path: 'Elbow path',
  pull_grip_control: 'Grip control'
}

const tileClass = 'rounded-lg border bg-card p-4 space-y-3 h-full'

const statusColor = (status: string | null) => {
  switch ((status ?? 'unknown').toLowerCase()) {
    case 'clear':
    case 'stable':
    case 'green':
      return 'text-emerald-600 bg-emerald-50 border border-emerald-200'
    case 'watch':
    case 'amber':
    case 'moderate':
      return 'text-amber-600 bg-amber-50 border border-amber-200'
    case 'red':
    case 'critical':
    case 'high':
      return 'text-red-600 bg-red-50 border border-red-200'
    default:
      return 'text-slate-600 bg-slate-50 border border-slate-200'
  }
}

export default function ElevationMapPage() {
  const [params] = useSearchParams()
  const clientId = params.get('clientId')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<FuseResponse | null>(null)

  useEffect(() => {
    const fuse = async () => {
      if (!clientId) {
        setError('Missing clientId in query string.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/.netlify/functions/elevation-fuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId })
        })
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}))
          throw new Error(errJson.error ?? `Fusion failed (${res.status})`)
        }
        const data = await res.json()
        setSnapshot(data as FuseResponse)
      } catch (err: any) {
        console.error('Elevation map load error', err)
        setError(err?.message ?? 'Unable to load elevation map snapshot.')
      } finally {
        setLoading(false)
      }
    }
    void fuse()
  }, [clientId])

  const tiles = snapshot?.tiles
  const priorities = snapshot?.priorities
  const plan = snapshot?.plan

  const priorityLabels = useMemo(() => {
    if (!priorities) return []
    return priorities.highlights.map((key) => movementPriorityLabel[key] ?? key)
  }, [priorities])

  return (
    <RequireTrainer>
      <Layout>
        <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
          <header className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Elevation Map
            </div>
            <h1 className="text-3xl font-semibold">{clientId ? `Elevation Map for client ${clientId}` : 'Elevation Map'}</h1>
            <p className="text-sm text-muted-foreground max-w-3xl mx-auto">
              Fused summary of the most recent Consult and Movement Screen. Use this to guide the next block, set priorities, and export reports.
            </p>
          </header>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && (
            <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">Loading latest snapshot…</div>
          )}

          {snapshot && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  Latest snapshot <span className="font-medium text-foreground">{new Date(snapshot.createdAt).toLocaleString()}</span>
                </div>
                <button type="button" className="px-4 h-10 rounded-md border text-sm hover:bg-muted" onClick={()=>window.print()}>Print / export</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className={tileClass}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Safety</div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor(tiles?.safety?.status ?? null)}`}>
                      {tiles?.safety?.status ?? 'Unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tiles?.safety?.notes ?? 'No safety notes logged.'}</p>
                </div>

                <div className={tileClass}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Goals</div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor(tiles?.goals?.status ?? null)}`}>
                      {tiles?.goals?.status ?? 'Unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tiles?.goals?.notes ?? 'No goal updates logged.'}</p>
                </div>

                <div className={tileClass}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Habit Consistency</div>
                    <span className="text-lg font-semibold text-foreground">{formatScore(tiles?.habits?.consistency_pct)}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tiles?.habits?.commentary ?? 'No habit notes logged.'}</p>
                </div>

                <div className={tileClass}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Grip Δ%</div>
                    <span className="text-lg font-semibold text-foreground">{formatScore(tiles?.grip?.delta_pct)}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tiles?.grip?.commentary ?? 'No grip strength notes logged.'}</p>
                </div>

                <div className={tileClass}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Body Comp Δ</div>
                    <span className="text-lg font-semibold text-foreground">{formatScore(tiles?.body_comp?.delta)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tiles?.body_comp?.commentary ?? 'No body composition notes logged.'}</p>
                </div>

                <div className={`${tileClass} lg:col-span-1 md:col-span-2`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Movement Quality</div>
                    <span className="text-lg font-semibold text-foreground">{formatScore(tiles?.movement?.quality_score)} / 3</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Top priorities</div>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {priorityLabels.length === 0 && <li>No priorities yet.</li>}
                      {priorityLabels.map((label) => (
                        <li key={label} className="flex items-center justify-between gap-2">
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                    {tiles?.movement?.failing_kpis?.length ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">Watch items</div>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {tiles.movement.failing_kpis?.map((kpi) => (
                            <li key={kpi.key} className="rounded border bg-background px-3 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{movementPriorityLabel[kpi.key] ?? kpi.key}</div>
                              <div>{kpi.why}</div>
                              {kpi.cues.length > 0 && (
                                <ul className="mt-2 list-disc pl-4 space-y-1 text-xs text-muted-foreground/80">
                                  {kpi.cues.map((cue, idx) => (
                                    <li key={idx}>{cue}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">All KPIs currently passing.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Priority board</div>
                  {priorities?.rationale.length ? (
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      {priorities.rationale.map((item) => (
                        <li key={item.key} className="rounded border bg-background p-3 space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{movementPriorityLabel[item.key] ?? item.key}</div>
                          <div>{item.why}</div>
                          {item.cues.length > 0 && (
                            <ul className="list-disc pl-4 text-xs space-y-1 text-muted-foreground/80">
                              {item.cues.map((cue, idx) => (
                                <li key={idx}>{cue}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No priorities surfaced yet.</p>
                  )}
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plan of action</div>
                  {plan ? (
                    <div className="space-y-3">
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {plan.actions.map((action) => (
                          <li key={action.kpi} className="rounded border bg-background p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{movementPriorityLabel[action.kpi] ?? action.kpi}</div>
                            <div>{action.focus}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground/80">
                              {action.regression && <span className="rounded bg-amber-200/70 px-2 py-0.5">Regression: {action.regression}</span>}
                              {action.progression && <span className="rounded bg-emerald-200/70 px-2 py-0.5">Progression: {action.progression}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="rounded border bg-background p-3 text-sm text-muted-foreground">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Notes</div>
                        <div>{plan.notes ?? 'No additional notes.'}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Save & apply a screen to populate plan actions.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && !snapshot && !error && (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No fusion snapshot available yet. Run a Consult or Movement Screen to populate this map.
            </div>
          )}
        </div>
      </Layout>
    </RequireTrainer>
  )
}
