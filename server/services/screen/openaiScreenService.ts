import pRetry from "p-retry";
import { openai } from "./openaiClient";
import { MovementResultZ, MovementResult } from "./schema";

const SYS = `You are a professional movement analyst for a fitness facility.
Analyze sequences of still frames (chronological). Focus on the athlete, ignore background/other people.
Return ONLY valid JSON that matches the provided schema. No extra commentary.
Respond with a single JSON object and nothing else.`;

export async function analyzePatternWithFrames(
  pattern: MovementResult["pattern"],
  frames: string[],
  opts: { maxFrames?: number; timeoutMs?: number; retries?: number } = {}
): Promise<MovementResult> {
  const maxFrames = Math.min(Math.max(opts.maxFrames ?? 12, 8), 24);
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 12000, 5000), 30000);
  const retries = Math.min(Math.max(opts.retries ?? 0, 0), 2);

  const imgs = frames.slice(0, maxFrames).map((u) => ({
    type: "image_url" as const,
    image_url: { url: u, detail: "low" as const },
  }));

  const normalizeStatus = (s: any): "ok" | "warn" | "fail" => {
    const v = String(s || "").toLowerCase();
    if (v === "ok" || v === "pass") return "ok";
    if (v === "warn") return "warn";
    return "fail";
  };

  const coerceMovementResult = (raw: any, fallbackPattern: MovementResult["pattern"]): MovementResult => {
    const supported = ["squat","hinge","push","pull","lunge","carry","core"];
    const patt = String(raw?.pattern ?? fallbackPattern ?? "squat").toLowerCase();
    const pattFinal = (supported.includes(patt) ? patt : "squat") as MovementResult["pattern"];
    const kpisIn: any[] = Array.isArray(raw?.kpis) ? raw.kpis : [];
    const kpis = kpisIn.slice(0, 4).map((k) => {
      const name = String(k?.name ?? "");
      let value: any = (k?.value ?? k?.numeric_value);
      if (typeof value === "string") {
        const n = parseFloat(value);
        value = Number.isFinite(n) ? n : 0;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) value = 0;
      const target = String(k?.target ?? "");
      const status = normalizeStatus(k?.status);
      return { name, value, target, status };
    });
    let reps: MovementResult["reps"] = undefined;
    if (Array.isArray(raw?.reps)) {
      const rawReps = raw.reps as any[]
      const repItems = rawReps
        .slice(0, 10)
        .map((rep: any, idx: number) => {
          const repIndexRaw = Number(rep?.rep_index ?? rep?.rep ?? idx + 1);
          const rep_index = Number.isFinite(repIndexRaw) && repIndexRaw >= 1 ? Math.trunc(repIndexRaw) : idx + 1;
          const status = normalizeStatus(rep?.status);
          const key_findings = String(rep?.key_findings ?? rep?.summary ?? "").trim();
          const focus_next_rep = String(rep?.focus_next_rep ?? rep?.focus ?? "").trim();
          if (!key_findings) return null;
          return { rep_index, status, key_findings, focus_next_rep };
        })
        .filter(Boolean) as MovementResult["reps"];
      if (repItems && repItems.length > 0) {
        reps = repItems.map((rep) => ({
          ...rep,
          focus_next_rep: rep.focus_next_rep || "",
        }));
      }
    }
    const passFailRaw = String(raw?.pass_fail ?? "");
    const pass_fail: "pass" | "fail" = passFailRaw === "pass" || passFailRaw === "fail"
      ? passFailRaw
      : (kpis.some((k) => k.status === "fail") ? "fail" : "pass");
    return { pattern: pattFinal, pass_fail, kpis, ...(reps ? { reps } : {}) };
  };

  const run = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content: [
              { type: "text", text:
                `Pattern: ${pattern}.
                 Output 4 KPIs that best indicate technique quality for this pattern.
                 Also summarize each rep (up to 10) in an array "reps" with objects { rep_index, status, key_findings, focus_next_rep }.
                 Definitions:\n- pass_fail: "pass" when joint positions/angles and control meet safe norms across most frames; "fail" if consistent red flags.\n- kpis: name, numeric value (estimate), human-readable target (e.g., "Knee valgus ≤ 5°"), status ok/warn/fail.\n- reps: status ok/warn/fail per rep, key_findings summarizing what stood out, focus_next_rep suggesting what to adjust next rep (may be empty).
                 Consider temporal consistency across frames (not single-frame anomalies).`
              },
              ...imgs,
            ] as any,
          },
        ],
        stream: false,
      });

      const message = (res as any).choices?.[0]?.message;
      let text: string | null = null;
      if (typeof message?.content === "string") {
        text = message.content;
      } else if (Array.isArray(message?.content)) {
        const parts = message.content
          .filter((p: any) => p && typeof p.text === "string")
          .map((p: any) => p.text);
        if (parts.length) text = parts.join("\n");
      }
      if (!text) {
        console.error("[openaiScreenService] empty content", res);
        throw new Error("Model returned empty content");
      }
      console.info("[openaiScreenService] raw response", text);
      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch (e: any) {
        throw new Error("Model returned non-JSON content");
      }
      const coerced = coerceMovementResult(raw, pattern);
      const parsed = MovementResultZ.safeParse(coerced);
      if (!parsed.success) {
        throw new Error("Invalid JSON from model: " + parsed.error.message);
      }
      return parsed.data;
    } finally {
      clearTimeout(t);
    }
  };

  return pRetry(run, {
    retries,
    minTimeout: 800,
    factor: 1.5,
  });
}
