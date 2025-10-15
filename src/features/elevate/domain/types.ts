export type Horizon = '6mo'|'1y'|'2y'|'3y'|'4y'|'5y'|'10y'
export type Scenario = 'no_change'|'with_change'

export interface PillarScores { ex:number; nu:number; sl:number; st:number; peak:number }
export interface InBody { weight:number; bf:number; smm:number; vat:number; waist:number; height:number }
export interface Vitals { rhr:number; sbp?:number; dbp?:number; sex:'M'|'F'; chronAge:number }
export interface Grip { left:number; right:number; sum:number; rel:number; z?:number; score:number }
export interface FoodEnv { cook0_4:number; upf0_4:number; fe:number }

export interface RiskResult { score:number; band:'Low'|'Mod'|'High'|'Very High'; drivers:string[] }
export type RiskMap = Record<'t2d'|'osa'|'htn'|'nafld'|'sarcopenia'|'lowcrf', RiskResult>

export interface Projection {
  horizon: Horizon
  scenario: Scenario
  inbody: InBody
  pillars: PillarScores
  healthAge: { age:number; delta:number }
  risks: RiskMap
}
