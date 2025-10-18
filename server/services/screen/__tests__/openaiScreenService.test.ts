import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../openaiClient', () => {
  return {
    openai: {
      responses: {
        create: vi.fn(async () => ({
          output_text: JSON.stringify({
            pattern: 'squat',
            pass_fail: 'pass',
            kpis: [
              { name: 'depth', value: 95, target: '≥ 90°', status: 'ok' },
              { name: 'knee_tracking', value: 4, target: '≤ 5° valgus', status: 'ok' },
              { name: 'trunk_brace', value: 20, target: '≤ 30°', status: 'ok' },
              { name: 'foot_stability', value: 0.9, target: '≥ 0.8', status: 'ok' },
            ],
          })
        }))
      }
    }
  }
})

import { MovementResultZ } from '../schema'
import { analyzePatternWithFrames } from '../openaiScreenService'

describe('MovementResultZ', () => {
  it('validates a correct result', () => {
    const sample = {
      pattern: 'squat',
      pass_fail: 'pass',
      kpis: [
        { name: 'a', value: 1, target: 't', status: 'ok' },
        { name: 'b', value: 2, target: 't', status: 'warn' },
        { name: 'c', value: 3, target: 't', status: 'fail' },
        { name: 'd', value: 4, target: 't', status: 'ok' },
      ],
    }
    expect(() => MovementResultZ.parse(sample)).not.toThrow()
  })

  it('rejects wrong kpi length', () => {
    const bad = { pattern: 'squat', pass_fail: 'pass', kpis: [] }
    const res = MovementResultZ.safeParse(bad)
    expect(res.success).toBe(false)
  })
})

describe('analyzePatternWithFrames', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
  })

  it('trims frames to default max (24)', async () => {
    const frames = Array.from({ length: 50 }, (_, i) => `data:image/png;base64,frame${i}`)
    const result = await analyzePatternWithFrames('squat', frames)
    expect(result.kpis).toHaveLength(4)
  })

  it('returns parsed and validated result', async () => {
    const frames = Array.from({ length: 12 }, (_, i) => `data:image/png;base64,frame${i}`)
    const result = await analyzePatternWithFrames('squat', frames, { maxFrames: 12 })
    expect(result.pattern).toBe('squat')
    expect(result.pass_fail).toBe('pass')
    expect(result.kpis.length).toBe(4)
  })
})
