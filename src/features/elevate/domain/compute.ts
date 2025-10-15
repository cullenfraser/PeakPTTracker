import { Horizon, Scenario, PillarScores, InBody, Vitals, RiskMap, Projection } from './types'
import { ELEVATE_WEIGHTS } from '../elevate.config'

export const computeWHtR = (waist_cm: number, height_cm: number): number => {
  if (!isFinite(waist_cm) || !isFinite(height_cm) || height_cm <= 0) return 0
  return +(waist_cm / height_cm).toFixed(3)
}

export const scorePillars = (items: Record<string, number>, fe: number): PillarScores => {
  // Aggregate item codes by pillar using weights
  const sumBy = (codes: string[]) => {
    let s = 0
    let w = 0
    for (const code of codes) {
      const v = Math.max(0, Math.min(4, Number(items[code] ?? 0)))
      const wt = ELEVATE_WEIGHTS.pillarItemWeights[code] ?? 1
      s += v * wt
      w += wt
    }
    return w > 0 ? (s / (4 * w)) * 100 : 0
  }

  const ex = sumBy(ELEVATE_WEIGHTS.pillarItems.EX)
  const nu = sumBy(ELEVATE_WEIGHTS.pillarItems.NU)
  const sl = sumBy(ELEVATE_WEIGHTS.pillarItems.SL)
  const st = sumBy(ELEVATE_WEIGHTS.pillarItems.ST)

  // Food environment can influence NU slightly
  const feAdj = Math.max(0, Math.min(1, (4 - fe) / 4)) // better FE lowers UPF, nudges NU up
  const nuAdj = nu * (1 + ELEVATE_WEIGHTS.nuFromFoodEnvK * feAdj)

  const peak = Math.max(0, Math.min(100, ELEVATE_WEIGHTS.peakWeights.ex * ex + ELEVATE_WEIGHTS.peakWeights.nu * nuAdj + ELEVATE_WEIGHTS.peakWeights.sl * sl + ELEVATE_WEIGHTS.peakWeights.st * st))

  return {
    ex: +ex.toFixed(1),
    nu: +nuAdj.toFixed(1),
    sl: +sl.toFixed(1),
    st: +st.toFixed(1),
    peak: +peak.toFixed(1),
  }
}

export const crfProxyZ = (mvpaMin: number, steps: number): number => {
  // Simple proxy Z score from MVPA minutes and daily steps
  const mvpaZ = (mvpaMin - 150) / 75 // 150 min baseline
  const stepsZ = (steps - 8000) / 3000 // 8k baseline
  const z = 0.6 * mvpaZ + 0.4 * stepsZ
  return +z.toFixed(2)
}

export const healthAge = (v: Vitals, ib: InBody, ps: PillarScores, gripZ: number): { delta: number; age: number } => {
  // Build composite risk Z
  const w = ELEVATE_WEIGHTS.healthAge
  const whtR = computeWHtR(ib.waist, ib.height)
  const bfZ = (ib.bf - 22) / 8
  const rhrZ = (v.rhr - 60) / 12
  const sbpZ = v.sbp ? (v.sbp - 120) / 15 : 0
  const grip = isFinite(gripZ) ? gripZ : 0
  const peakZ = (100 - ps.peak) / 25

  const riskZ = w.rhr * rhrZ + w.sbp * sbpZ + w.bf * bfZ + w.whtR * (whtR - 0.5) / 0.05 + w.grip * (-grip) + w.peak * peakZ
  const delta = +(riskZ * 5.5).toFixed(1)
  const age = +(v.chronAge + delta).toFixed(1)
  return { delta, age }
}

const bandFromScore = (score: number): 'Low'|'Mod'|'High'|'Very High' => {
  if (score < 25) return 'Low'
  if (score < 50) return 'Mod'
  if (score < 75) return 'High'
  return 'Very High'
}

export const riskIndices = (features: any): RiskMap => {
  // Very simple linear/logistic blends; deterministic
  const clip01 = (x:number) => Math.max(0, Math.min(1, x))
  const sig = (x:number) => 1/(1+Math.exp(-x))

  const mk = (x:number) => Math.round(clip01(x)*100)

  const t2d = mk(sig((features.bf-25)/6 + (features.waist/heightNorm(features.height))-0.52 + (features.nu<50?0.3:0)))
  const osa = mk(sig((features.whtR-0.5)/0.05 + (features.bf-22)/10))
  const htn = mk(sig((features.sbp-120)/15 + (features.rhr-60)/12))
  const nafld = mk(sig((features.bf-25)/7 + (features.vat-10)/5))
  const sarc = mk(sig((features.smmRel<0.3?0.5:0) + (features.gripZ<-1?0.6:0)))
  const lowcrf = mk(sig((60-features.peak)/15))

  const build = (score:number, drivers:string[]) => ({ score, band: bandFromScore(score), drivers })

  return {
    t2d: build(t2d, ['BF%','Waist:Height','Nutrition score']),
    osa: build(osa, ['Waist:Height','BF%']),
    htn: build(htn, ['SBP','RHR']),
    nafld: build(nafld, ['VAT','BF%']),
    sarcopenia: build(sarc, ['Low SMM','Grip Z']),
    lowcrf: build(lowcrf, ['Peak Score'])
  } as RiskMap
}

const heightNorm = (cm:number) => Math.max(1, cm)

const updateInBodyWithFrequency = (ib: InBody, w:number, months:number): InBody => {
  const k = ELEVATE_WEIGHTS.freqK
  const effect = 1 - Math.exp(-k * w) // diminishing returns
  const bfDelta = -0.6 * effect * months // %-points per month scaled by effect
  const smmDelta = 0.1 * effect * months // kg per month
  const vatDelta = -0.8 * effect * months // arbitrary units
  return {
    ...ib,
    bf: +(ib.bf + bfDelta).toFixed(1),
    smm: +(ib.smm + smmDelta).toFixed(1),
    vat: Math.max(0, Math.round(ib.vat + vatDelta)),
  }
}

export const noChangeProjection = (inputs: { v: Vitals; ib: InBody; ps: PillarScores; gripZ:number }, horizon: Horizon): Projection => {
  const months = horizonToMonths(horizon)
  const ib2 = { ...inputs.ib } // assume stable
  const ps2 = { ...inputs.ps }
  const h = healthAge(inputs.v, ib2, ps2, inputs.gripZ)
  const risks = riskIndices({
    bf: ib2.bf,
    waist: ib2.waist,
    height: ib2.height,
    whtR: computeWHtR(ib2.waist, ib2.height),
    nu: ps2.nu,
    sbp: inputs.v.sbp ?? 120,
    rhr: inputs.v.rhr,
    vat: ib2.vat,
    smmRel: ib2.smm / Math.max(1, ib2.weight),
    gripZ: inputs.gripZ,
    peak: ps2.peak,
  })
  return { horizon, scenario: 'no_change', inbody: ib2, pillars: ps2, healthAge: h, risks }
}

export const projectWithFrequency = (
  inputs: { v: Vitals; ib: InBody; ps: PillarScores; gripZ:number },
  ctx: { workoutsPerWeek:number; adherence:number; proteinSupport:number; sleepSupport:number },
  horizon: Horizon,
): Projection => {
  const months = horizonToMonths(horizon)
  const w = Math.max(1, Math.min(7, ctx.workoutsPerWeek))
  const adj = Math.max(0, Math.min(1, ctx.adherence)) *
              Math.max(0.5, Math.min(1, ctx.proteinSupport)) *
              Math.max(0.5, Math.min(1, ctx.sleepSupport))
  const effW = w * adj
  const ib2 = updateInBodyWithFrequency(inputs.ib, effW, months)

  // Pillars improve as function of effort
  const ex2 = Math.min(100, inputs.ps.ex + 10 * (1 - Math.exp(-0.4 * effW)) * (months/6))
  const nu2 = Math.min(100, inputs.ps.nu + 6 * (1 - Math.exp(-0.3 * effW)) * (months/6))
  const sl2 = Math.min(100, inputs.ps.sl + 4 * (1 - Math.exp(-0.25 * effW)) * (months/6))
  const st2 = Math.min(100, inputs.ps.st + 8 * (1 - Math.exp(-0.35 * effW)) * (months/6))
  const peak2 = Math.max(0, Math.min(100, ELEVATE_WEIGHTS.peakWeights.ex*ex2 + ELEVATE_WEIGHTS.peakWeights.nu*nu2 + ELEVATE_WEIGHTS.peakWeights.sl*sl2 + ELEVATE_WEIGHTS.peakWeights.st*st2))
  const ps2: PillarScores = { ex:+ex2.toFixed(1), nu:+nu2.toFixed(1), sl:+sl2.toFixed(1), st:+st2.toFixed(1), peak:+peak2.toFixed(1) }

  const h = healthAge(inputs.v, ib2, ps2, inputs.gripZ)
  const risks = riskIndices({
    bf: ib2.bf,
    waist: ib2.waist,
    height: ib2.height,
    whtR: computeWHtR(ib2.waist, ib2.height),
    nu: ps2.nu,
    sbp: inputs.v.sbp ?? 120,
    rhr: inputs.v.rhr,
    vat: ib2.vat,
    smmRel: ib2.smm / Math.max(1, ib2.weight),
    gripZ: inputs.gripZ,
    peak: ps2.peak,
  })
  return { horizon, scenario: 'with_change', inbody: ib2, pillars: ps2, healthAge: h, risks }
}

export const horizonToMonths = (h: Horizon): number => {
  switch (h) {
    case '6mo': return 6
    case '1y': return 12
    case '2y': return 24
    case '3y': return 36
    case '4y': return 48
    case '5y': return 60
    case '10y': return 120
  }
}
