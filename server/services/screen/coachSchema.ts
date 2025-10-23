import { z } from 'zod'

export const KpiItemZ = z.object({
  key: z.string(),
  name: z.string(),
  score_0_3: z.number().int().min(0).max(3),
  pass: z.boolean(),
  why: z.string().default(''),
  frame_refs: z.array(z.number().int()).optional().default([]),
  cues: z.array(z.string()).default([]),
  regression: z.string().nullable().optional(),
  progression: z.string().nullable().optional(),
})

export const LoadReadinessZ = z.object({
  level: z.enum(['ready_to_load', 'load_with_oversight', 'build_foundation']),
  label: z.string(),
  summary: z.string(),
  callout: z.string().default(''),
})

export const BriefingZ = z.object({
  load_readiness: LoadReadinessZ,
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).max(3).default([]),
  consequences_positive: z.string().default(''),
  consequences_negative: z.string().default(''),
  action_plan: z.object({
    focus_this_week: z.string(),
    drills: z.array(z.string()),
    loading_guidance: z.string().optional().default('')
  })
})

export const SubjectZ = z.object({
  selection_method: z.string(),
  confidence_0_1: z.number().min(0).max(1),
  notes: z.string().optional().default('')
})

export const MovementKPIsZ = z.object({
  pattern: z.string(),
  detected_variation: z.string(),
  detected_variation_original: z.string().optional(),
  coach_variation_override: z.string().optional(),
  subject: SubjectZ,
  camera_limits: z.array(z.string()).optional().default([]),
  overall_score_0_3: z.number().int().min(0).max(3),
  overall_pass: z.boolean(),
  load_readiness: LoadReadinessZ,
  global_notes: z.string().optional().default(''),
  kpis: z.array(KpiItemZ).length(4),
  priority_order: z.array(z.string()).default([]),
  briefing: BriefingZ,
  reps: z.array(z.object({
    rep_index: z.number().int().min(1),
    status: z.enum(['ok', 'warn', 'fail']),
    key_findings: z.string(),
    focus_next_rep: z.string().optional().default('')
  })).min(1).max(10).optional(),
}).strict()

export type MovementKPIs = z.infer<typeof MovementKPIsZ>
