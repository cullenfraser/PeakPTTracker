import React from 'react'
import type { InBody, Vitals } from '../domain/types'
import { computeWHtR } from '../domain/compute'

type Props = {
  vitals: Vitals
  inbody: InBody
  onChange: (vPatch: Partial<Vitals>, ibPatch: Partial<InBody>) => void
}

export default function VitalsInBodyCard({ vitals, inbody, onChange }: Props) {
  const whtR = computeWHtR(inbody.waist, inbody.height)
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">Vitals & InBody</h3>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm">Resting HR</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={vitals.rhr}
            onChange={(e)=>onChange({ rhr: Number(e.target.value)||0 }, {})} />
        </div>
        <div>
          <label className="text-sm">Systolic BP</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={vitals.sbp ?? ''}
            onChange={(e)=>onChange({ sbp: e.target.value===''?undefined:Number(e.target.value) }, {})} />
        </div>
        <div>
          <label className="text-sm">Diastolic BP</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={vitals.dbp ?? ''}
            onChange={(e)=>onChange({ dbp: e.target.value===''?undefined:Number(e.target.value) }, {})} />
        </div>
      </div>
      <div className="grid md:grid-cols-5 gap-3">
        <div>
          <label className="text-sm">Height (cm)</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.height}
            onChange={(e)=>onChange({}, { height: Number(e.target.value)||0 })} />
        </div>
        <div>
          <label className="text-sm">Waist (cm)</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.waist}
            onChange={(e)=>onChange({}, { waist: Number(e.target.value)||0 })} />
        </div>
        <div>
          <label className="text-sm">Weight (kg)</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.weight}
            onChange={(e)=>onChange({}, { weight: Number(e.target.value)||0 })} />
        </div>
        <div>
          <label className="text-sm">Body Fat %</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.bf}
            onChange={(e)=>onChange({}, { bf: Number(e.target.value)||0 })} />
        </div>
        <div>
          <label className="text-sm">SMM (kg)</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.smm}
            onChange={(e)=>onChange({}, { smm: Number(e.target.value)||0 })} />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm">VAT Level</label>
          <input className="w-full h-10 px-3 border rounded-md focus:outline focus:outline-2 focus:outline-[#3FAE52]" type="number" value={inbody.vat}
            onChange={(e)=>onChange({}, { vat: Number(e.target.value)||0 })} />
        </div>
        <div className="flex items-end"><div className="text-sm text-muted-foreground">WHtR: <span className="font-semibold">{whtR}</span></div></div>
      </div>
    </div>
  )
}
