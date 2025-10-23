type Kpi = {
  key: string
  name: string
  score_0_3: number
  pass: boolean
  why: string
  frame_refs?: number[]
  cues?: string[]
  regression?: string | null
  progression?: string | null
}

export default function KpiCards({ kpis }: { kpis: Kpi[] }) {
  if (!kpis || kpis.length === 0) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {kpis.map((kpi) => (
        <div key={kpi.key} className="rounded border bg-background p-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between text-sm text-foreground">
            <span className="font-semibold uppercase tracking-wide" title={kpi.name}>{kpi.key.replace(/_/g, ' ')}</span>
            <span>{kpi.score_0_3}/3 • {kpi.pass ? 'Pass' : 'Needs work'}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">What we noticed: {kpi.why}</div>
          {kpi.cues && kpi.cues.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground/90">
              {kpi.cues.slice(0,2).map((cue, idx) => (
                <li key={idx}>{cue}</li>
              ))}
            </ul>
          )}
          {kpi.frame_refs && kpi.frame_refs.length > 0 && (
            <div className="text-[11px] text-muted-foreground" title={`Frames: ${kpi.frame_refs.join(', ')}`}>Frames referenced: {kpi.frame_refs.slice(0,3).join(', ')}{kpi.frame_refs.length>3?'…':''}</div>
          )}
        </div>
      ))}
    </div>
  )
}
