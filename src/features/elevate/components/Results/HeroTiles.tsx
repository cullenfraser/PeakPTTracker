import React from 'react'

type Props = { peak: number; chronAge: number; healthAge: number; delta: number }

export default function HeroTiles({ peak, chronAge, healthAge, delta }: Props) {
  const tiles = [
    { label: 'Peak Score', value: `${Math.round(peak)}` },
    { label: 'Chronological Age', value: `${chronAge.toFixed(0)}y` },
    { label: 'Health Age', value: `${healthAge.toFixed(1)}y (${delta>0?'+':''}${delta.toFixed(1)})` },
  ]
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {tiles.map(t => (
        <div key={t.label} className="rounded-lg border p-4 bg-card">
          <div className="text-xs text-muted-foreground">{t.label}</div>
          <div className="text-2xl font-semibold mt-1">{t.value}</div>
        </div>
      ))}
    </div>
  )
}
