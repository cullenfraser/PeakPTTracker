import React from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import type { PillarScores } from '../../domain/types'

export default function PillarRadar({ scores }: { scores: PillarScores }) {
  const data = [
    { subject: 'EX', A: scores.ex },
    { subject: 'NU', A: scores.nu },
    { subject: 'SL', A: scores.sl },
    { subject: 'ST', A: scores.st },
  ]
  return (
    <div className="border rounded-lg p-3">
      <div className="font-medium text-sm mb-2">Pillar Scores</div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            <Radar name="Score" dataKey="A" stroke="#3FAE52" fill="#3FAE52" fillOpacity={0.6} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
