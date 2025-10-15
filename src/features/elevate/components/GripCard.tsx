import React from 'react'
import type { Grip } from '../domain/types'

type Props = { value: Grip; weight: number; onChange: (patch: Partial<Grip>) => void }

export default function GripCard({ value, weight, onChange }: Props) {
  const sum = +(Number(value.left||0) + Number(value.right||0)).toFixed(1)
  const rel = weight ? +(sum / weight).toFixed(3) : 0
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">Grip Strength</h3>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm">Best Left (kgf)</label>
          <input className="w-full h-10 px-3 border rounded-md" type="number" value={value.left}
            onChange={(e)=>onChange({ left: Number(e.target.value)||0 })} />
        </div>
        <div>
          <label className="text-sm">Best Right (kgf)</label>
          <input className="w-full h-10 px-3 border rounded-md" type="number" value={value.right}
            onChange={(e)=>onChange({ right: Number(e.target.value)||0 })} />
        </div>
        <div className="flex items-end"><div className="text-sm text-muted-foreground">Sum: <span className="font-semibold">{sum}</span> | Rel: <span className="font-semibold">{rel}</span></div></div>
      </div>
    </div>
  )
}
