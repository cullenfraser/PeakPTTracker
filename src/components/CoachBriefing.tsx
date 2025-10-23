import type { LoadReadiness } from './VariationBadge'

type Briefing = {
  load_readiness?: LoadReadiness
  strengths: string[]
  improvements: string[]
  consequences_positive: string
  consequences_negative: string
  action_plan: {
    focus_this_week: string
    drills: string[]
    loading_guidance?: string
  }
}

export default function CoachBriefing({ briefing }: { briefing: Briefing }) {
  if (!briefing) return null
  return (
    <div className="space-y-4 text-xs">
      {briefing.load_readiness && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Load readiness</div>
          <div className="text-sm font-semibold text-foreground">{briefing.load_readiness.label}</div>
          <div className="text-muted-foreground whitespace-pre-line">{briefing.load_readiness.summary}</div>
          {briefing.load_readiness.callout ? (
            <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-muted-foreground">
              {briefing.load_readiness.callout}
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-foreground">Strengths</div>
          {briefing.strengths?.length ? (
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              {briefing.strengths.map((s, i) => (<li key={i}>{s}</li>))}
            </ul>
          ) : (
            <div className="text-muted-foreground">—</div>
          )}
        </div>
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-foreground">Improvements</div>
          {briefing.improvements?.length ? (
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              {briefing.improvements.slice(0,3).map((s, i) => (<li key={i}>{s}</li>))}
            </ul>
          ) : (
            <div className="text-muted-foreground">—</div>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <div className="font-semibold text-foreground">Consequences (positive)</div>
          <div className="text-muted-foreground">{briefing.consequences_positive || '—'}</div>
        </div>
        <div>
          <div className="font-semibold text-foreground">Consequences (negative)</div>
          <div className="text-muted-foreground">{briefing.consequences_negative || '—'}</div>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <div className="font-semibold text-foreground">Action plan</div>
        <div className="text-muted-foreground">Focus: {briefing.action_plan?.focus_this_week || '—'}</div>
        {briefing.action_plan?.drills?.length ? (
          <div className="text-muted-foreground">Drills: {briefing.action_plan.drills.join(', ')}</div>
        ) : null}
        {briefing.action_plan?.loading_guidance ? (
          <div className="text-muted-foreground">Loading: {briefing.action_plan.loading_guidance}</div>
        ) : null}
      </div>
    </div>
  )
}
