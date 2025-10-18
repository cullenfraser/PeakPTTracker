import { z } from "zod";

export const MovementResultZ = z.object({
  pattern: z.enum(["squat","hinge","push","pull","lunge","carry","core"]),
  pass_fail: z.enum(["pass","fail"]),
  kpis: z.array(z.object({
    name: z.string(),
    value: z.number(),
    target: z.string(),
    status: z.enum(["ok","warn","fail"])
  })).length(4)
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
      }}
    },
    required: ["pattern","pass_fail","kpis"],
    additionalProperties: false
  }
} as const;
