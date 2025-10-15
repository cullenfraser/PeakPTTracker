import { ELEVATE_WEIGHTS } from '../elevate.config'
import type { FoodEnv } from '../domain/types'

type Props = {
  value: Record<string, number>
  onChange: (updates: Record<string, number>) => void
  food: FoodEnv
  onFoodChange: (patch: Partial<FoodEnv>) => void
}

const groups = [
  { key: 'EX', label: 'Exercise', items: ELEVATE_WEIGHTS.pillarItems.EX },
  { key: 'NU', label: 'Nutrition', items: ELEVATE_WEIGHTS.pillarItems.NU },
  { key: 'SL', label: 'Sleep', items: ELEVATE_WEIGHTS.pillarItems.SL },
  { key: 'ST', label: 'Stress', items: ELEVATE_WEIGHTS.pillarItems.ST },
] as const

export default function PillarWizard({ value, onChange, food, onFoodChange }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">4 Pillars</h3>
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.key} className="border rounded-md p-3">
            <div className="font-medium mb-2">{g.label}</div>
            {g.key === 'NU' && (
              <div className="mb-3 rounded border p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Food Environment</div>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700">Score: {food.fe}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs">Home cooking frequency (0–4)</label>
                    <input type="range" min={0} max={4} value={food.cook0_4} onChange={(e)=>onFoodChange({ cook0_4: Number(e.target.value)||0 })} className="w-full" />
                    <div className="text-[11px] text-muted-foreground">{food.cook0_4}</div>
                  </div>
                  <div>
                    <label className="text-xs">Ultra-processed foods at home (0–4)</label>
                    <input type="range" min={0} max={4} value={food.upf0_4} onChange={(e)=>onFoodChange({ upf0_4: Number(e.target.value)||0 })} className="w-full" />
                    <div className="text-[11px] text-muted-foreground">{food.upf0_4}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {g.items.map((code) => (
                <div key={code} className="flex items-center justify-between gap-2">
                  <label className="text-sm">{code}</label>
                  <div className="flex items-center gap-2">
                    {[0,1,2,3,4].map(n => (
                      <label key={n} className="text-xs flex items-center gap-1">
                        <input type="radio" name={code} checked={(value[code] ?? 0) === n} onChange={()=>onChange({ [code]: n })} />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
