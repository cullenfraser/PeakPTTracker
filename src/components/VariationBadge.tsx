export type LoadReadiness = {
  level: 'ready_to_load' | 'load_with_oversight' | 'build_foundation'
  label: string
  summary: string
  callout?: string
}

type Props = {
  variation: string
  variationOriginal?: string
  coachOverride?: string
  loadReadiness?: LoadReadiness
  confidence?: number
  cameraLimits?: string[]
  overallPass?: boolean
  overrideToggle?: {
    active: boolean
    onToggle: () => void
    disabled?: boolean
  }
}

const readinessChipStyles: Record<LoadReadiness['level'], string> = {
  ready_to_load: 'bg-emerald-600 text-white',
  load_with_oversight: 'bg-amber-600 text-white',
  build_foundation: 'bg-rose-600 text-white',
}

export default function VariationBadge({ variation, variationOriginal, coachOverride, loadReadiness, confidence, cameraLimits, overallPass, overrideToggle }: Props) {
  const conf = typeof confidence === 'number' ? Math.round(confidence * 100) : null
  const readinessLevel = loadReadiness?.level ?? 'load_with_oversight'
  const readinessClass = readinessChipStyles[readinessLevel]
  const showOriginal = !!variationOriginal && variationOriginal !== variation
  const showOverride = !!coachOverride && coachOverride !== variation
  const toggleActive = !!overrideToggle?.active

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          <span>Variation</span>
          <span className="rounded bg-white/80 px-2 py-0.5 text-foreground">{variation || 'Unknown'}</span>
        </span>
        {loadReadiness && (
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${readinessClass}`}>
            {loadReadiness.label}
          </span>
        )}
        {typeof overallPass === 'boolean' && (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              overallPass ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}
          >
            {overallPass ? 'Screen pass' : 'Screen flagged'}
          </span>
        )}
        {overrideToggle && (
          <button
            type="button"
            onClick={overrideToggle.onToggle}
            disabled={overrideToggle.disabled}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              toggleActive ? 'border-transparent bg-indigo-600 text-white' : 'border-muted bg-background text-muted-foreground hover:bg-muted/70'
            } ${overrideToggle.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-pressed={toggleActive}
          >
            <span>Coach override</span>
            <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${toggleActive ? 'bg-white/80' : 'bg-muted-foreground/30'}`}>
              <span
                className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-indigo-600 transition-transform ${toggleActive ? 'translate-x-3' : 'translate-x-0'}`}
              />
            </span>
          </button>
        )}
        {conf !== null && (
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
            Confidence {conf}%
          </span>
        )}
        {cameraLimits && cameraLimits.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
            Camera limits
          </span>
        )}
      </div>
      {loadReadiness?.summary && (
        <div className="text-xs text-muted-foreground whitespace-pre-line">{loadReadiness.summary}</div>
      )}
      {loadReadiness?.callout && (
        <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {loadReadiness.callout}
        </div>
      )}
      {(showOriginal || showOverride) && (
        <div className="text-[11px] text-muted-foreground space-y-1">
          {showOriginal && (
            <div>AI detected: <span className="font-medium text-foreground">{variationOriginal}</span></div>
          )}
          {showOverride && (
            <div>Coach override: <span className="font-medium text-foreground">{coachOverride}</span></div>
          )}
        </div>
      )}
    </div>
  )
}
