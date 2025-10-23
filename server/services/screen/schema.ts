import { z } from "zod";

const RepInsightZ = z.object({
  rep_index: z.number().int().min(1),
  status: z.enum(["ok","warn","fail"]),
  key_findings: z.string().min(1),
  focus_next_rep: z.string().optional().default("")
});

export const MovementResultZ = z.object({
  pattern: z.enum(["squat","hinge","push","pull","lunge","carry","core"]),
  pass_fail: z.enum(["pass","fail"]),
  detected_variation: z.string().optional(),
  kpis: z.array(z.object({
    name: z.string(),
    value: z.number(),
    target: z.string(),
    status: z.enum(["ok","warn","fail"])
  })).length(4),
  reps: z.array(RepInsightZ).min(1).max(10).optional()
});

export type MovementResult = z.infer<typeof MovementResultZ>;

export const movementJsonSchema = {
  name: "movement_kpis",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", enum: ["squat","hinge","push","pull","lunge","carry","core"] },
      pass_fail: { type: "string", enum: ["pass","fail"] },
      kpis: { type: "array", minItems: 4, maxItems: 4, items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "number" },
          target: { type: "string" },
          status: { type: "string", enum: ["ok","warn","fail"] }
        },
        required: ["name","value","target","status"],
        additionalProperties: false
      }},
      reps: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            rep_index: { type: "integer", minimum: 1 },
            status: { type: "string", enum: ["ok","warn","fail"] },
            key_findings: { type: "string" },
            focus_next_rep: { type: "string" }
          },
          required: ["rep_index","status","key_findings"],
          additionalProperties: false
        }
      }
    },
    required: ["pattern","pass_fail","kpis"],
    additionalProperties: false
  }
} as const;
