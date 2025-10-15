import React from 'react'
import type { FoodEnv } from '../domain/types'

type Props = { value: FoodEnv; onChange: (patch: Partial<FoodEnv>) => void }

export default function FoodEnvCard({ value, onChange }: Props) {
  const fe = Math.max(0, Math.min(8, (4 - (value.upf0_4||0)) + (value.cook0_4||0)))
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Food Environment</h3>
        <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-700">Score: {fe}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm">Home cooking frequency (0–4)</label>
          <input type="range" min={0} max={4} value={value.cook0_4} onChange={(e)=>onChange({ cook0_4: Number(e.target.value)||0 })} className="w-full" />
          <div className="text-xs text-muted-foreground">{value.cook0_4}</div>
        </div>
        <div>
          <label className="text-sm">Ultra-processed foods at home (0–4)</label>
          <input type="range" min={0} max={4} value={value.upf0_4} onChange={(e)=>onChange({ upf0_4: Number(e.target.value)||0 })} className="w-full" />
          <div className="text-xs text-muted-foreground">{value.upf0_4}</div>
        </div>
      </div>
    </div>
  )
}
