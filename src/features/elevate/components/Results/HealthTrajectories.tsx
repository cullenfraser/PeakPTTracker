import React from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from 'recharts'
import type { Horizon } from '../../domain/types'

type Props = {
  base: any
  projections: { nc: any; wc: any }
  horizon: Horizon
  onHorizonChange: (h: Horizon) => void
}

const HORIZONS: Horizon[] = ['6mo','1y','2y','3y','4y','5y','10y']

export default function HealthTrajectories({ base, projections, horizon, onHorizonChange }: Props) {
  const data = [
    { t: 'Now', no_change: base.vitals.chronAge, with_change: base.vitals.chronAge },
    { t: horizon, no_change: projections.nc.healthAge.age, with_change: projections.wc.healthAge.age },
  ]
  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">Health Trajectories</div>
        <div className="flex items-center gap-1">
          {HORIZONS.map((h) => (
            <button key={h} onClick={()=>onHorizonChange(h)} className={`px-2 py-1 rounded text-xs border ${h===horizon?'bg-[#3FAE52] text-white':'hover:bg-accent'}`}>{h}</button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="no_change" stroke="#ef4444" strokeDasharray="4 4" dot />
            <Line type="monotone" dataKey="with_change" stroke="#22c55e" dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
