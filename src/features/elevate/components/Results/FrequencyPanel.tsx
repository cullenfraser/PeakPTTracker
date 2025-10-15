import React from 'react'

type Props = {
  w: number
  adherence: number
  protein: number
  sleep: number
  onChange: (v: { w: number; adherence: number; protein: number; sleep: number }) => void
}

export default function FrequencyPanel({ w, adherence, protein, sleep, onChange }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="font-medium text-sm">What-If: Workouts per week</div>
      <div className="grid md:grid-cols-2 gap-3 items-center">
        <div>
          <label className="text-sm">Workouts/week: {w}</label>
          <input type="range" min={1} max={7} value={w} onChange={(e)=>onChange({ w: Number(e.target.value)||1, adherence, protein, sleep })} className="w-full" />
        </div>
        <div className="grid grid-cols-3 gap-2 items-center">
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={adherence>=0.8} onChange={(e)=>onChange({ w, adherence: e.target.checked?0.9:0.6, protein, sleep })} /> Adherence</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={protein>=1} onChange={(e)=>onChange({ w, adherence, protein: e.target.checked?1:0.7, sleep })} /> Protein</label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={sleep>=1} onChange={(e)=>onChange({ w, adherence, protein, sleep: e.target.checked?1:0.7 })} /> Sleep</label>
        </div>
      </div>
    </div>
  )
}
