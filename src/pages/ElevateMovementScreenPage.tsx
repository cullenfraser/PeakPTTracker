import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { supabase } from '@/lib/supabase'
import VariationBadge, { type LoadReadiness } from '@/components/VariationBadge'
import KpiCards from '@/components/KpiCards'
import CoachBriefing from '../components/CoachBriefing'
import { buildCues, buildWhyFromScore, statusFromScore, buildPositive } from '@/lib/kpiText'

const patternCopy: Record<string, { title: string; blurb: string }> = {
  squat: {
    title: 'Squat Screen',
    blurb: 'Capture 2–3 reps to evaluate depth control, knee tracking, trunk brace, and foot stability. Use a side or 45° view for best results.'
  },
  lunge: {
    title: 'Lunge Screen',
    blurb: 'Assess forward lunge mechanics—knee path, pelvic control, depth, and pushback mechanics. Capture front or 45° view.'
  },
  hinge: {
    title: 'Hinge Screen',
    blurb: 'Review hip hinge ratio, lumbar neutrality, mid-foot path, and lockout finish. Side view works best for moveNet measurements.'
  },
  push: {
    title: 'Push Pattern Screen',
    blurb: 'Score setup, range of motion, tempo, and symmetry for push-ups (men) or dumbbell bench (women).'
  },
  pull: {
    title: 'Pull Pattern Screen',
    blurb: 'Evaluate seated underhand row—torso stillness, scap timing, elbow path, and grip control. Front view preferred.'
  }
};

const VARIATION_OPTIONS: Record<string, string[]> = {
  squat: [
    'Bodyweight Squat',
    'Goblet Squat',
    'Front Squat',
    'Back Squat (High Bar)',
    'Back Squat (Low Bar)',
    'Safety Bar Squat (SSB)',
    'Overhead Squat',
  ],
}

const MOCK_REP_SCRIPTS: Array<{ label: string; reps: Omit<RepMetrics, 'rep'>[] }> = [
  {
    label: 'Clean high-bar set',
    reps: Array.from({ length: 4 }).map(() => ({
      tempo_ecc_s: 1.6,
      tempo_con_s: 1.2,
      rom_ok: true,
      depth_deg: 94,
      knee_valgus_deg: 5,
      trunk_flex_deg: 28,
      hip_flex_deg: 105,
      knee_flex_deg: 98,
      hinge_ratio: 1.05,
      lumbar_var_deg: 3,
      torso_line_r2: 0.97,
      scap_set_flag: true,
      torso_sway_deg: 4,
      scap_timing_ok: true,
      elbow_path_deg: 36,
      wrist_dev_deg: 5,
      heels_down: true,
    })),
  },
  {
    label: 'Depth/valgus issues',
    reps: [
      {
        tempo_ecc_s: 1.7,
        tempo_con_s: 1.4,
        rom_ok: false,
        depth_deg: 82,
        knee_valgus_deg: 9,
        trunk_flex_deg: 33,
        hip_flex_deg: 95,
        knee_flex_deg: 88,
        hinge_ratio: 1.12,
        lumbar_var_deg: 5,
        torso_line_r2: 0.91,
        scap_set_flag: true,
        torso_sway_deg: 6,
        scap_timing_ok: true,
        elbow_path_deg: 40,
        wrist_dev_deg: 8,
        heels_down: false,
      },
      {
        tempo_ecc_s: 1.8,
        tempo_con_s: 1.5,
        rom_ok: false,
        depth_deg: 78,
        knee_valgus_deg: 11,
        trunk_flex_deg: 36,
        hip_flex_deg: 92,
        knee_flex_deg: 86,
        hinge_ratio: 1.15,
        lumbar_var_deg: 6,
        torso_line_r2: 0.9,
        scap_set_flag: false,
        torso_sway_deg: 7,
        scap_timing_ok: true,
        elbow_path_deg: 42,
        wrist_dev_deg: 9,
        heels_down: false,
      },
      {
        tempo_ecc_s: 1.7,
        tempo_con_s: 1.3,
        rom_ok: true,
        depth_deg: 88,
        knee_valgus_deg: 7,
        trunk_flex_deg: 31,
        hip_flex_deg: 100,
        knee_flex_deg: 92,
        hinge_ratio: 1.1,
        lumbar_var_deg: 4,
        torso_line_r2: 0.92,
        scap_set_flag: true,
        torso_sway_deg: 5,
        scap_timing_ok: true,
        elbow_path_deg: 39,
        wrist_dev_deg: 7,
        heels_down: true,
      },
      {
        tempo_ecc_s: 1.9,
        tempo_con_s: 1.6,
        rom_ok: false,
        depth_deg: 80,
        knee_valgus_deg: 10,
        trunk_flex_deg: 35,
        hip_flex_deg: 94,
        knee_flex_deg: 87,
        hinge_ratio: 1.13,
        lumbar_var_deg: 7,
        torso_line_r2: 0.89,
        scap_set_flag: false,
        torso_sway_deg: 8,
        scap_timing_ok: false,
        elbow_path_deg: 44,
        wrist_dev_deg: 10,
        heels_down: false,
      },
    ],
  },
  {
    label: 'Tempo and trunk variance',
    reps: [
      {
        tempo_ecc_s: 1.3,
        tempo_con_s: 1.0,
        rom_ok: true,
        depth_deg: 96,
        knee_valgus_deg: 6,
        trunk_flex_deg: 32,
        hip_flex_deg: 108,
        knee_flex_deg: 101,
        hinge_ratio: 1.03,
        lumbar_var_deg: 4,
        torso_line_r2: 0.95,
        scap_set_flag: true,
        torso_sway_deg: 4,
        scap_timing_ok: true,
        elbow_path_deg: 37,
        wrist_dev_deg: 6,
        heels_down: true,
      },
      {
        tempo_ecc_s: 2.4,
        tempo_con_s: 1.9,
        rom_ok: false,
        depth_deg: 86,
        knee_valgus_deg: 8,
        trunk_flex_deg: 38,
        hip_flex_deg: 96,
        knee_flex_deg: 90,
        hinge_ratio: 1.18,
        lumbar_var_deg: 6,
        torso_line_r2: 0.88,
        scap_set_flag: false,
        torso_sway_deg: 9,
        scap_timing_ok: false,
        elbow_path_deg: 43,
        wrist_dev_deg: 11,
        heels_down: false,
      },
      {
        tempo_ecc_s: 1.5,
        tempo_con_s: 1.1,
        rom_ok: true,
        depth_deg: 92,
        knee_valgus_deg: 6,
        trunk_flex_deg: 30,
        hip_flex_deg: 103,
        knee_flex_deg: 96,
        hinge_ratio: 1.08,
        lumbar_var_deg: 5,
        torso_line_r2: 0.9,
        scap_set_flag: true,
        torso_sway_deg: 6,
        scap_timing_ok: true,
        elbow_path_deg: 41,
        wrist_dev_deg: 8,
        heels_down: true,
      },
      {
        tempo_ecc_s: 1.2,
        tempo_con_s: 1.0,
        rom_ok: true,
        depth_deg: 98,
        knee_valgus_deg: 4,
        trunk_flex_deg: 27,
        hip_flex_deg: 110,
        knee_flex_deg: 102,
        hinge_ratio: 1.02,
        lumbar_var_deg: 3,
        torso_line_r2: 0.96,
        scap_set_flag: true,
        torso_sway_deg: 4,
        scap_timing_ok: true,
        elbow_path_deg: 35,
        wrist_dev_deg: 5,
        heels_down: true,
      },
    ],
  },
]

const CAPTURE_GUIDES: Record<string, {
  recommend: 'front' | 'front45' | 'side'
  angles: { value: 'front' | 'front45' | 'side'; label: string; benefit: string }[]
  steps: string[]
}> = {
  squat: {
    recommend: 'side',
    angles: [
      { value: 'side', label: 'Side (recommended)', benefit: 'Best for depth, torso angle, hip/knee sequencing.' },
      { value: 'front45', label: 'Front 45°', benefit: 'Good for knee tracking/valgus and overall control.' },
      { value: 'front', label: 'Front', benefit: 'Quick check for symmetry and foot pressure.' }
    ],
    steps: [
      'Place camera at chest height, landscape orientation.',
      'Center full body with feet visible at all times.',
      'Capture 6–10 continuous reps at natural tempo.',
      'Avoid occlusion: no spotters crossing; good lighting.'
    ]
  },
  hinge: {
    recommend: 'side',
    angles: [
      { value: 'side', label: 'Side (recommended)', benefit: 'Best for hip hinge pattern, bar/implement path, lumbar neutrality.' },
      { value: 'front45', label: 'Front 45°', benefit: 'Views lat set, shoulder position and knee travel.' },
      { value: 'front', label: 'Front', benefit: 'Checks stance width and symmetry.' }
    ],
    steps: [
      'Camera at hip-to-chest height, landscape.',
      'Frame head-to-toe with implement fully visible.',
      'Record 6–10 reps without pausing or walking away.',
      'Ensure neutral background and steady lighting.'
    ]
  },
  lunge: {
    recommend: 'front',
    angles: [
      { value: 'front', label: 'Front (recommended)', benefit: 'Best for knee-over-toe tracking and frontal plane control.' },
      { value: 'side', label: 'Side', benefit: 'Good for depth, shin angle and step length.' },
      { value: 'front45', label: 'Front 45°', benefit: 'Balanced view across tracking and depth.' }
    ],
    steps: [
      'Camera at knee-to-hip height, landscape.',
      'Keep lead and trail foot fully in frame throughout.',
      'Record 6–10 reps per side without assistance crossing the view.',
      'Use consistent lighting; avoid mirrors reflecting glare.'
    ]
  },
  push: {
    recommend: 'side',
    angles: [
      { value: 'side', label: 'Side (recommended)', benefit: 'Best for trunk line, ROM, and elbow angle consistency.' },
      { value: 'front45', label: 'Front 45°', benefit: 'Good for scap rhythm and elbow flare.' },
      { value: 'front', label: 'Front', benefit: 'Quick check on symmetry and grip spacing.' }
    ],
    steps: [
      'Camera at chest height, landscape.',
      'Frame torso and arms fully through end ranges.',
      'Capture 6–10 reps at steady tempo; no pauses between.',
      'Stable lighting; avoid harsh backlight and occlusions.'
    ]
  },
  pull: {
    recommend: 'front45',
    angles: [
      { value: 'front45', label: 'Front 45° (recommended)', benefit: 'Best for elbow path, scapular rhythm and finish position.' },
      { value: 'side', label: 'Side', benefit: 'Shows trunk control and range of motion end points.' },
      { value: 'front', label: 'Front', benefit: 'Checks symmetry and wrist position.' }
    ],
    steps: [
      'Camera at chest height, landscape.',
      'Include torso, arms, and handle throughout the set.',
      'Record 6–10 smooth reps; avoid jerking or bouncing.',
      'Ensure no people cross between camera and athlete.'
    ]
  },
}

type Pattern = 'Squat' | 'Lunge' | 'Hinge' | 'Push' | 'Pull'

interface RepMetrics {
  rep: number
  tempo_ecc_s?: number
  tempo_con_s?: number
  rom_ok?: boolean
  depth_deg?: number
  knee_valgus_deg?: number
  trunk_flex_deg?: number
  pelvis_shift_cm?: number
  lr_depth_diff_deg?: number
  heels_down?: boolean
  hip_flex_deg?: number
  knee_flex_deg?: number
  hinge_ratio?: number
  lumbar_var_deg?: number
  implement_dist_cm?: number
  elbow_min_deg?: number
  torso_line_r2?: number
  scap_set_flag?: boolean
  torso_sway_deg?: number
  scap_timing_ok?: boolean
  elbow_path_deg?: number
  wrist_dev_deg?: number
}

interface FeaturePayload {
  pattern: Pattern
  clientId: string
  fps: number
  camera_view: 'front' | 'front45' | 'side'
  reps: RepMetrics[]
  aggregates: Record<string, number | boolean>
  flags: Record<string, boolean>
  thumbnails?: string[]
}

type RepStatus = 'ok' | 'warn' | 'fail'

interface RepInsight {
  rep_index: number
  status: RepStatus
  key_findings: string
  focus_next_rep?: string
}

interface RepSummarySegment {
  segment: 'early' | 'middle' | 'late'
  dominant_status: RepStatus
  summary: string
}

interface RepSummary {
  overall: string
  segments: RepSummarySegment[]
}

const REP_STATUS_PRIORITY: Record<RepStatus, number> = { ok: 2, warn: 1, fail: 0 }
const REP_STATUS_LABELS: Record<RepStatus, string> = {
  ok: 'On target',
  warn: 'Needs attention',
  fail: 'Flagged',
}
const REP_STATUS_BADGE: Record<RepStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  fail: 'bg-rose-100 text-rose-700',
}

type RawRep = { rep_index?: number; rep?: number; status?: string; key_findings?: string; focus_next_rep?: string }

const mapRawRepsToInsights = (reps: RawRep[] | undefined): RepInsight[] | undefined => {
  if (!reps || reps.length === 0) return undefined
  const results = reps.reduce<RepInsight[]>((acc, rep, idx) => {
    const repIndexRaw = typeof rep.rep_index === 'number' && Number.isFinite(rep.rep_index)
      ? rep.rep_index
      : typeof rep.rep === 'number' && Number.isFinite(rep.rep)
        ? rep.rep
        : undefined
    const rep_index = repIndexRaw && repIndexRaw >= 1 ? Math.trunc(repIndexRaw) : idx + 1
    const rawStatus = typeof rep.status === 'string' ? rep.status.toLowerCase() : 'ok'
    const status: RepStatus = rawStatus === 'fail' || rawStatus === 'warn' ? (rawStatus as RepStatus) : 'ok'
    const key_findings = (rep.key_findings ?? '').trim()
    if (!key_findings) return acc
    const focus_next_rep = (rep.focus_next_rep ?? '').trim()
    acc.push({
      rep_index,
      status,
      key_findings,
      focus_next_rep: focus_next_rep || undefined,
    })
    return acc
  }, [])
  return results.length > 0 ? results : undefined
}

const summarizeRepInsights = (insights?: RepInsight[]): RepSummary | undefined => {
  if (!insights || insights.length === 0) return undefined
  const segmentSize = Math.max(1, Math.floor(insights.length / 3))
  const segmentKeys: Array<'early' | 'middle' | 'late'> = ['early', 'middle', 'late']
  const segments: RepSummarySegment[] = segmentKeys.map((segment, idx) => {
    const start = idx * segmentSize
    const end = idx === 2 ? insights.length : Math.min(insights.length, start + segmentSize)
    const slice = start < insights.length ? insights.slice(start, Math.max(start + 1, end)) : []
    if (slice.length === 0) {
      return { segment, dominant_status: 'ok', summary: 'No reps captured in this portion of the set.' }
    }
    const counts: Record<RepStatus, number> = { ok: 0, warn: 0, fail: 0 }
    slice.forEach((rep) => { counts[rep.status] += 1 })
    const dominant = (Object.keys(counts) as RepStatus[])
      .sort((a, b) => counts[b] - counts[a] || REP_STATUS_PRIORITY[b] - REP_STATUS_PRIORITY[a])[0]
    const summaryText = slice
      .map((rep) => `Rep ${rep.rep_index}: ${rep.key_findings}`)
      .join(' | ')
    return {
      segment,
      dominant_status: dominant,
      summary: summaryText || 'No notable findings recorded.',
    }
  })

  const overall = segments
    .map((seg) => `${seg.segment.toUpperCase()}: ${REP_STATUS_LABELS[seg.dominant_status]}`)
    .join(' • ')

  return { overall, segments }
}

interface KpiResult {
  key: string
  pass: boolean
  score_0_3: 0 | 1 | 2 | 3
  why: string
  cues: string[]
  regression?: string
  progression?: string
  confidence: number
  pass_original?: boolean
  pass_override?: boolean | null
  overrideActive?: boolean
}

interface MovementAnalysisResponse {
  pattern: Pattern
  kpis: KpiResult[]
  overall_score_0_3: 0 | 1 | 2 | 3
  priority_order: string[]
  global_notes?: string
  detected_variation?: string
  detected_variation_original?: string
  coach_variation_override?: string
  load_readiness: LoadReadiness
  rep_insights?: RepInsight[]
  rep_summary?: RepSummary
  briefing?: CoachBriefingData
}

interface CoachAnalysisKpi {
  key: string
  name: string
  score_0_3: 0|1|2|3
  pass: boolean
  why: string
  frame_refs?: number[]
  cues?: string[]
  regression?: string | null
  progression?: string | null
}

interface CoachBriefingData {
  load_readiness?: LoadReadiness
  strengths: string[]
  improvements: string[]
  consequences_positive: string
  consequences_negative: string
  action_plan: { focus_this_week: string; drills: string[]; loading_guidance?: string }
}

interface CoachAnalysis {
  pattern: string
  detected_variation: string
  detected_variation_original?: string
  coach_variation_override?: string
  subject: { selection_method: string; confidence_0_1: number; notes?: string }
  camera_limits?: string[]
  overall_score_0_3: 0|1|2|3
  overall_pass: boolean
  load_readiness: LoadReadiness
  global_notes?: string
  kpis: CoachAnalysisKpi[]
  priority_order: string[]
  briefing: CoachBriefingData
  reps?: RawRep[]
}

export default function ElevateMovementScreenPage() {
  const navigate = useNavigate()
  const params = useParams()
  const [search] = useSearchParams()
  const clientId = search.get('clientId')
  const patternKey = params.pattern ?? 'squat'
  const pattern = patternCopy[patternKey] ?? patternCopy.squat
  const variationOptions = useMemo(() => VARIATION_OPTIONS[patternKey] ?? [], [patternKey])
  const [isRecording, setIsRecording] = useState(false)
  const [capturedReps, setCapturedReps] = useState<RepMetrics[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isRequestingCamera, setIsRequestingCamera] = useState(false)
  const [payload, setPayload] = useState<FeaturePayload | null>(null)
  const [analysisResponse, setAnalysisResponse] = useState<MovementAnalysisResponse | null>(null)
  const [coachAnalysis, setCoachAnalysis] = useState<CoachAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [kpiOverrides, setKpiOverrides] = useState<Record<string, boolean>>({})
  const [kpiOriginals, setKpiOriginals] = useState<Record<string, boolean>>({})
  const [kpiOverrideActive, setKpiOverrideActive] = useState<Record<string, boolean>>({})
  const [repInsights, setRepInsights] = useState<RepInsight[] | undefined>(undefined)
  const [repSummary, setRepSummary] = useState<RepSummary | undefined>(undefined)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false)
  const [cameraView, setCameraView] = useState<'front'|'front45'|'side'>('front')
  const [showCaptureGuide, setShowCaptureGuide] = useState(false)
  const [guideAngle, setGuideAngle] = useState<'front'|'front45'|'side'>('front')
  const [variationOverride, setVariationOverride] = useState<string>('')
  const [overrideActive, setOverrideActive] = useState<boolean>(false)
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<BlobPart[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)
  const recordStopTimeoutRef = useRef<number | null>(null)
  const recordIntervalRef = useRef<number | null>(null)
  const [recordMs, setRecordMs] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const detectorRef = useRef<PoseDetector | null>(null)
  const rafRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameBufferRef = useRef<string[]>([])
  const countdownTimeoutRef = useRef<number | null>(null)
  const captureMetricsRef = useRef<{
    startTs: number
    frameCount: number
    depth: number[]
    kneeValgus: number[]
    trunk: number[]
    hipFlex: number[]
    kneeFlex: number[]
    sway: number[]
    heelFrames: number
    heelContact: number
  }>({
    startTs: 0,
    frameCount: 0,
    depth: [],
    kneeValgus: [],
    trunk: [],
    hipFlex: [],
    kneeFlex: [],
    sway: [],
    heelFrames: 0,
    heelContact: 0
  })
  const [poseLoading, setPoseLoading] = useState(false)
  const [poseError, setPoseError] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)

  useEffect(() => {
    if (showCaptureGuide) {
      const g = CAPTURE_GUIDES[patternKey]
      setGuideAngle(g?.recommend ?? 'front')
    }
  }, [showCaptureGuide, patternKey])

  const header = useMemo(() => {
    const base = pattern.title
    const suffix = clientName ?? (clientId ? `Client ${clientId}` : null)
    return suffix ? `${base} • ${suffix}` : base
  }, [pattern.title, clientName, clientId])

  const variationCard = useMemo(() => {
    if (coachAnalysis) {
      const finalVariation = coachAnalysis.coach_variation_override ?? coachAnalysis.detected_variation
      return {
        variation: finalVariation,
        variationOriginal: coachAnalysis.detected_variation_original ?? coachAnalysis.detected_variation,
        coachOverride: coachAnalysis.coach_variation_override ?? undefined,
        confidence: coachAnalysis.subject?.confidence_0_1,
        cameraLimits: coachAnalysis.camera_limits,
        overallPass: coachAnalysis.overall_pass,
        readiness: coachAnalysis.load_readiness,
      }
    }
    if (analysisResponse) {
      const passCount = analysisResponse.kpis.filter((kpi) => !!kpi.pass).length
      const overallPass = passCount >= 3
      const finalVariation = analysisResponse.coach_variation_override ?? analysisResponse.detected_variation ?? pattern.title
      return {
        variation: finalVariation,
        variationOriginal: analysisResponse.detected_variation_original ?? analysisResponse.detected_variation ?? pattern.title,
        coachOverride: analysisResponse.coach_variation_override ?? undefined,
        confidence: undefined,
        cameraLimits: undefined,
        overallPass,
        readiness: analysisResponse.load_readiness,
      }
    }
    return null
  }, [coachAnalysis, analysisResponse, pattern.title])

  useEffect(() => {
    const latest = coachAnalysis
      ? (coachAnalysis.coach_variation_override ?? coachAnalysis.detected_variation)
      : analysisResponse
        ? (analysisResponse.coach_variation_override ?? analysisResponse.detected_variation)
        : ''
    if (latest) {
      if (latest !== variationOverride) {
        setVariationOverride(latest)
      }
    } else if (variationOverride !== '') {
      setVariationOverride('')
    }
  }, [coachAnalysis, analysisResponse, variationOverride])

  useEffect(() => {
    if (!clientId) {
      setClientName(null)
      return
    }
    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('first_name, last_name')
          .eq('id', clientId)
          .maybeSingle()
        if (!active) return
        if (error) {
          console.error('Failed to load client', error)
          setClientName(null)
        } else {
          const name = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()
          setClientName(name || null)
        }
      } catch (err: any) {
        if (!active) return
        console.error('Client lookup error', err)
        setClientName(null)
      }
    })()
    return () => {
      active = false
    }
  }, [clientId])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (countdownTimeoutRef.current) {
        window.clearTimeout(countdownTimeoutRef.current)
        countdownTimeoutRef.current = null
      }
    }
  }, [])

  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (typeof window !== 'undefined' && window.navigator?.vibrate) {
      window.navigator.vibrate(pattern)
    }
  }, [])

  const ensureCamera = async () => {
    if (streamRef.current || isRequestingCamera) return
    setIsRequestingCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: 1280,
          height: 720
        }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      if (overlayVideoRef.current) {
        overlayVideoRef.current.srcObject = stream
        await overlayVideoRef.current.play().catch(() => undefined)
      }
    } catch (err: any) {
      console.error('Failed to access camera', err)
    } finally {
      setIsRequestingCamera(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) return
    setPoseLoading(true)
    setPoseError(null)
    try {
      const poseDetection = await import('@tensorflow-models/pose-detection')
      const tf = await import('@tensorflow/tfjs-core')
      await import('@tensorflow/tfjs-backend-webgl')
      if (tf.getBackend() !== 'webgl') {
        await tf.setBackend('webgl')
      }
      await tf.ready()
      detectorRef.current = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true
      })
    } catch (error: any) {
      console.error('Failed to load pose detector', error)
      setPoseError(error?.message ?? 'Unable to load pose detection model.')
    } finally {
      setPoseLoading(false)
    }
  }, [])

  const point = (pose: Pose | undefined, name: string) => pose?.keypoints?.find((kp) => kp.name === name)

  const angleDeg = (
    a?: { x: number; y: number; score?: number },
    b?: { x: number; y: number; score?: number },
    c?: { x: number; y: number; score?: number }
  ) => {
    if (!a || !b || !c) return null
    if ((a.score ?? 0) < 0.3 || (b.score ?? 0) < 0.3 || (c.score ?? 0) < 0.3) return null
    const abx = a.x - b.x
    const aby = a.y - b.y
    const cbx = c.x - b.x
    const cby = c.y - b.y
    const dot = abx * cbx + aby * cby
    const mag = Math.sqrt(abx * abx + aby * aby) * Math.sqrt(cbx * cbx + cby * cby)
    if (!mag) return null
    const ratio = Math.max(-1, Math.min(1, dot / mag))
    return (Math.acos(ratio) * 180) / Math.PI
  }

  const average = (values: number[]) => {
    if (!values.length) return 0
    return values.reduce((acc, val) => acc + val, 0) / values.length
  }

  const std = (values: number[]) => {
    if (values.length < 2) return 0
    const mean = average(values)
    const variance = values.reduce((acc, val) => acc + (val - mean) * (val - mean), 0) / values.length
    return Math.sqrt(variance)
  }

  const computeFeaturePayload = useCallback((reps: RepMetrics[]): FeaturePayload | null => {
    const payloadClientId = clientId ?? 'mock-client'
    const avgDepth = average(reps.map((rep) => rep.depth_deg ?? 0))
    const avgKneeValgus = average(reps.map((rep) => rep.knee_valgus_deg ?? 0))
    return {
      pattern: (patternKey.toUpperCase().charAt(0) + patternKey.slice(1)) as Pattern,
      clientId: payloadClientId,
      fps: 30,
      camera_view: 'front',
      reps,
      aggregates: {
        reps_recorded: reps.length,
        avg_depth_deg: avgDepth,
        avg_knee_valgus_deg: avgKneeValgus,
        avg_trunk_flex_deg: average(reps.map((rep) => rep.trunk_flex_deg ?? 0)),
        avg_tempo_s: average(reps.map((rep) => ((rep.tempo_ecc_s ?? 0) + (rep.tempo_con_s ?? 0)))),
        heel_contact_ratio: average(reps.map((rep) => (rep.heels_down ? 1 : 0)))
      },
      flags: {
        sample: false,
        needs_more_reps: reps.length < 2
      }
    }
  }, [clientId, patternKey])

  const buildMockPayload = useCallback((): FeaturePayload | null => {
    const reps = capturedReps.length
      ? capturedReps
      : (() => {
          const script = MOCK_REP_SCRIPTS[Math.floor(Math.random() * MOCK_REP_SCRIPTS.length)] ?? MOCK_REP_SCRIPTS[0]
          return script.reps.map((rep, idx) => ({ ...rep, rep: idx + 1 }))
        })()
    const assembled = computeFeaturePayload(reps)
    if (!assembled) return null
    const runKey = `run_${Math.floor(Math.random() * 1_000_000_000)}`
    return {
      ...assembled,
      flags: {
        ...assembled.flags,
        sample: true,
        [runKey]: true,
      }
    }
  }, [capturedReps, clientId, computeFeaturePayload])

  const addMockRep = useCallback(() => {
    setCapturedReps((prev) => {
      if (prev.length >= 10) return prev
      const last = prev[prev.length - 1] ?? {
        rep: 0,
        tempo_ecc_s: 1.6,
        tempo_con_s: 1.3,
        rom_ok: true,
        depth_deg: 92,
        knee_valgus_deg: 6,
        trunk_flex_deg: 28,
        hip_flex_deg: 102,
        knee_flex_deg: 95,
        hinge_ratio: 1.07,
        lumbar_var_deg: 3,
        torso_line_r2: 0.96,
        scap_set_flag: true,
        torso_sway_deg: 4,
        scap_timing_ok: true,
        elbow_path_deg: 38,
        wrist_dev_deg: 6,
        heels_down: true,
      }
      const jitter = (n: number, amt: number) => Math.round((n + (Math.random() * 2 - 1) * amt) * 10) / 10
      const next = {
        ...last,
        rep: (last.rep ?? prev.length) + 1,
        tempo_ecc_s: jitter(last.tempo_ecc_s ?? 1.6, 0.2),
        tempo_con_s: jitter(last.tempo_con_s ?? 1.3, 0.2),
        depth_deg: jitter(last.depth_deg ?? 92, 4),
        knee_valgus_deg: jitter(last.knee_valgus_deg ?? 6, 2),
        trunk_flex_deg: jitter(last.trunk_flex_deg ?? 28, 3),
        hip_flex_deg: jitter(last.hip_flex_deg ?? 102, 4),
        knee_flex_deg: jitter(last.knee_flex_deg ?? 95, 4),
        hinge_ratio: jitter(last.hinge_ratio ?? 1.07, 0.05),
        lumbar_var_deg: jitter(last.lumbar_var_deg ?? 3, 1),
        torso_line_r2: Math.max(0.9, Math.min(0.99, (last.torso_line_r2 ?? 0.96) + (Math.random() * 0.02 - 0.01))),
        scap_set_flag: true,
        torso_sway_deg: jitter(last.torso_sway_deg ?? 4, 1.5),
        scap_timing_ok: true,
        elbow_path_deg: jitter(last.elbow_path_deg ?? 38, 3),
        wrist_dev_deg: jitter(last.wrist_dev_deg ?? 6, 2),
        heels_down: true,
      }
      return [...prev, next]
    })
  }, [])

  const handleRetake = useCallback(() => {
    try {
      if (videoRef.current) {
        try { (videoRef.current as any).srcObject = null } catch {}
        try { videoRef.current.pause() } catch {}
        try { (videoRef.current as HTMLVideoElement).removeAttribute('src') } catch {}
      }
      if (recordedUrl) {
        try { URL.revokeObjectURL(recordedUrl) } catch {}
      }
      setRecordedUrl(null)
      setCameraOverlayOpen(false)
      stopCamera()
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {}
    setCapturedReps([])
    setPayload(null)
    setAnalysisResponse(null)
    setCoachAnalysis(null)
    setRepInsights(undefined)
    setRepSummary(undefined)
    setKpiOverrides({})
    setKpiOriginals({})
    setKpiOverrideActive({})
    setVariationOverride('')
    setOverrideActive(false)
    setUploadMeta(null)
    setAnalysisError(null)
    setSaveError(null)
    setSaveSuccess(null)
  }, [recordedUrl])

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    let canvas = canvasRef.current
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvasRef.current = canvas
    }
    const w = video.videoWidth || 640
    const h = video.videoHeight || 360
    if (!w || !h) return
    const targetW = 640
    const ratio = w ? targetW / w : 1
    const targetH = Math.max(1, Math.round(h * ratio))
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, targetW, targetH)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
    if (!dataUrl) return
    frameBufferRef.current.push(dataUrl)
    if (frameBufferRef.current.length > 20) {
      frameBufferRef.current.splice(0, frameBufferRef.current.length - 20)
    }
  }, [])

  const processPose = useCallback((pose: Pose | undefined) => {
    if (!pose) return
    const leftHip = point(pose, 'left_hip')
    const leftKnee = point(pose, 'left_knee')
    const leftAnkle = point(pose, 'left_ankle')
    const rightHip = point(pose, 'right_hip')
    const rightKnee = point(pose, 'right_knee')
    const rightAnkle = point(pose, 'right_ankle')
    const leftShoulder = point(pose, 'left_shoulder')
    const rightShoulder = point(pose, 'right_shoulder')
    const kneeAngleLeft = angleDeg(leftHip, leftKnee, leftAnkle)
    const kneeAngleRight = angleDeg(rightHip, rightKnee, rightAnkle)
    const hipAngleLeft = angleDeg(leftShoulder, leftHip, leftKnee)
    const hipAngleRight = angleDeg(rightShoulder, rightHip, rightKnee)
    const trunkAngleLeft = leftHip && leftShoulder ? Math.abs(Math.atan2(leftShoulder.x - leftHip.x, leftShoulder.y - leftHip.y) * (180 / Math.PI)) : null
    const trunkAngleRight = rightHip && rightShoulder ? Math.abs(Math.atan2(rightShoulder.x - rightHip.x, rightShoulder.y - rightHip.y) * (180 / Math.PI)) : null
    const kneeValgus = leftKnee && rightKnee && leftAnkle && rightAnkle ? Math.abs((leftKnee.x - rightKnee.x) - (leftAnkle.x - rightAnkle.x)) : null
    if (kneeAngleLeft) captureMetricsRef.current.depth.push(180 - kneeAngleLeft)
    if (kneeAngleRight) captureMetricsRef.current.depth.push(180 - kneeAngleRight)
    if (kneeValgus !== null) captureMetricsRef.current.kneeValgus.push(Math.abs(kneeValgus))
    if (trunkAngleLeft !== null) captureMetricsRef.current.trunk.push(trunkAngleLeft)
    if (trunkAngleRight !== null) captureMetricsRef.current.trunk.push(trunkAngleRight)
    if (hipAngleLeft) captureMetricsRef.current.hipFlex.push(180 - hipAngleLeft)
    if (hipAngleRight) captureMetricsRef.current.hipFlex.push(180 - hipAngleRight)
    if (kneeAngleLeft) captureMetricsRef.current.kneeFlex.push(180 - kneeAngleLeft)
    if (kneeAngleRight) captureMetricsRef.current.kneeFlex.push(180 - kneeAngleRight)
    captureMetricsRef.current.heelFrames += 1
    if (leftAnkle && rightAnkle && leftHip && rightHip) {
      const heelAvg = (leftAnkle.y + rightAnkle.y) / 2
      const hipAvg = (leftHip.y + rightHip.y) / 2
      if (heelAvg < hipAvg + 50) captureMetricsRef.current.heelContact += 1
    }
    if (leftShoulder && rightShoulder) {
      captureMetricsRef.current.sway.push(Math.abs(leftShoulder.x - rightShoulder.x))
    }
  }, [])

  const captureLoop = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current) return
    try {
      const poses = await detectorRef.current.estimatePoses(videoRef.current, { flipHorizontal: true })
      processPose(poses[0])
      captureMetricsRef.current.frameCount += 1
      // Approximate ~4 fps sampling assuming ~30 fps input → capture every ~8 frames
      if (captureMetricsRef.current.frameCount % 8 === 0) {
        captureCurrentFrame()
      }
    } catch (error) {
      console.error('Pose estimation error', error)
    }
    rafRef.current = requestAnimationFrame(captureLoop)
  }, [processPose, captureCurrentFrame])

  const sampleFramesFromVideo = useCallback(async (url: string, maxFrames: number = 20) => {
    try {
      const vid = document.createElement('video')
      vid.src = url
      vid.muted = true
      ;(vid as any).playsInline = true
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => resolve()
        const onError = () => reject(new Error('Failed to load video for frame sampling'))
        vid.addEventListener('loadedmetadata', onLoaded, { once: true })
        vid.addEventListener('error', onError, { once: true })
      })
      const duration = Math.max(vid.duration || 0, 0)
      const effective = Math.min(duration || 0, 30)
      const count = Math.max(8, Math.min(maxFrames, Math.max(1, Math.round(effective * 4))))
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const times: number[] = []
      for (let i = 1; i <= count; i++) {
        times.push((i * (effective || duration || 0)) / (count + 1))
      }
      frameBufferRef.current = []
      for (const t of times) {
        await new Promise<void>((resolve) => {
          const onSeeked = () => resolve()
          vid.addEventListener('seeked', onSeeked, { once: true })
          try { vid.currentTime = t } catch { resolve() }
        })
        const w = vid.videoWidth || 640
        const h = vid.videoHeight || 360
        if (!w || !h) continue
        const targetW = 640
        const ratio = w ? targetW / w : 1
        const targetH = Math.max(1, Math.round(h * ratio))
        canvas.width = targetW
        canvas.height = targetH
        ctx.drawImage(vid, 0, 0, targetW, targetH)
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
          if (dataUrl) frameBufferRef.current.push(dataUrl)
        } catch {}
      }
    } catch (e) {
      console.warn('Frame sampling failed', e)
      frameBufferRef.current = []
    }
  }, [])

  const handleNativeFileSelected = useCallback(async (e: any) => {
    try {
      const file: File | undefined = e?.target?.files?.[0]
      if (!file) return
      // Create local URL and attach to inline video for auto-replay
      const url = URL.createObjectURL(file)
      setRecordedUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
      if (videoRef.current) {
        try { (videoRef.current as any).srcObject = null } catch {}
        videoRef.current.src = url
        try { videoRef.current.currentTime = 0 } catch {}
        await new Promise<void>((resolve) => {
          const onLoaded = () => resolve()
          videoRef.current?.addEventListener('loadedmetadata', onLoaded, { once: true })
        })
        videoRef.current.loop = false
        videoRef.current.controls = true
        await videoRef.current.play().catch(() => undefined)
      }
      // Populate frames for analysis
      await sampleFramesFromVideo(url, 12)
      // Close any overlay camera if open
      setCameraOverlayOpen(false)
      stopCamera()
      // Reset file input value so user can retake
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Native capture selection failed', err)
    }
  }, [sampleFramesFromVideo, stopCamera])

  const beginRecording = useCallback(async () => {
    await loadDetector()
    if (!detectorRef.current) return
    frameBufferRef.current = []
    captureMetricsRef.current = {
      startTs: performance.now(),
      frameCount: 0,
      depth: [],
      kneeValgus: [],
      trunk: [],
      hipFlex: [],
      kneeFlex: [],
      sway: [],
      heelFrames: 0,
      heelContact: 0
    }
    setCapturedReps([])
    setPayload(null)
    setPoseError(null)
    setIsRecording(true)
    triggerHaptic([40, 60, 40])
    rafRef.current = requestAnimationFrame(captureLoop)
    // Start MediaRecorder for preview playback
    const stream = streamRef.current
    if (stream) {
      recordChunksRef.current = []
      const mime = (typeof (window as any).MediaRecorder !== 'undefined' && typeof MediaRecorder !== 'undefined')
        ? (MediaRecorder as any).isTypeSupported?.('video/mp4;codecs=h264') ? 'video/mp4;codecs=h264'
          : (MediaRecorder as any).isTypeSupported?.('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : undefined
        : undefined
      try {
        mediaRecorderRef.current = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      } catch {
        mediaRecorderRef.current = new MediaRecorder(stream)
      }
      const mr = mediaRecorderRef.current
      if (mr) {
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data)
        }
        mr.onstop = () => {
          const type = (mr.mimeType || mime || 'video/webm').includes('mp4') ? 'video/mp4' : 'video/webm'
          const blob = new Blob(recordChunksRef.current, { type })
          recordedBlobRef.current = blob
          const url = URL.createObjectURL(blob)
          setRecordedUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
        }
        mr.start()
        setRecordMs(0)
        if (recordIntervalRef.current) { window.clearInterval(recordIntervalRef.current); recordIntervalRef.current = null }
        recordIntervalRef.current = window.setInterval(() => {
          setRecordMs((ms) => {
            const next = ms + 100
            return next
          })
        }, 100)
        if (recordStopTimeoutRef.current) { window.clearTimeout(recordStopTimeoutRef.current); recordStopTimeoutRef.current = null }
        recordStopTimeoutRef.current = window.setTimeout(() => {
          // Auto-stop at 30s
          stopOverlayRecording()
        }, 30000)
      }
    }
  }, [captureLoop, loadDetector, triggerHaptic])

  const handleRecord = useCallback(async () => {
    if (isRecording || countdown !== null) return
    await ensureCamera()
    setCapturedReps([])
    setPayload(null)
    setAnalysisResponse(null)
    setAnalysisError(null)
    triggerHaptic(40)
    setCountdown(3)
  }, [analysisError, analysisResponse, countdown, ensureCamera, isRecording, triggerHaptic])

  const finalizeCapture = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const metrics = captureMetricsRef.current
    if (!metrics.frameCount) {
      setIsRecording(false)
      return
    }
    const durationMs = performance.now() - metrics.startTs
    const avgDepth = average(metrics.depth)
    const avgKneeValgus = average(metrics.kneeValgus)
    const avgTrunk = average(metrics.trunk)
    const avgHip = average(metrics.hipFlex)
    const avgKnee = average(metrics.kneeFlex)
    const rep: RepMetrics = {
      rep: 1,
      tempo_ecc_s: durationMs / 2000,
      tempo_con_s: durationMs / 2000,
      rom_ok: avgDepth > 80,
      depth_deg: avgDepth,
      knee_valgus_deg: avgKneeValgus,
      trunk_flex_deg: avgTrunk,
      hip_flex_deg: avgHip,
      knee_flex_deg: avgKnee,
      hinge_ratio: avgKnee ? avgHip / avgKnee : undefined,
      lumbar_var_deg: std(metrics.trunk),
      torso_line_r2: 0.95,
      scap_set_flag: true,
      torso_sway_deg: std(metrics.sway) * 50,
      scap_timing_ok: true,
      elbow_path_deg: undefined,
      wrist_dev_deg: undefined,
      heels_down: metrics.heelFrames ? metrics.heelContact / metrics.heelFrames > 0.7 : true
    }
    const reps = [rep]
    setCapturedReps(reps)
    const assembled = computeFeaturePayload(reps)
    setPayload(assembled)
    setIsRecording(false)
    triggerHaptic([60, 40])
  }, [average, computeFeaturePayload, std])

  const stopOverlayRecording = useCallback(() => {
    if (recordIntervalRef.current) { window.clearInterval(recordIntervalRef.current); recordIntervalRef.current = null }
    if (recordStopTimeoutRef.current) { window.clearTimeout(recordStopTimeoutRef.current); recordStopTimeoutRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    finalizeCapture()
  }, [finalizeCapture])

  const [uploadMeta, setUploadMeta] = useState<{ storageKey: string; clip_duration_s_est?: number } | null>(null)

  const runAnalysis = useCallback(async (opts?: { override?: string | null; reuseUpload?: boolean }) => {
    setAnalysisError(null)
    if (analysisResponse) {
      setAnalysisResponse(null)
    }
    setSaveSuccess(null)
    setKpiOverrides({})
    setKpiOriginals({})
    setKpiOverrideActive({})
    setRepInsights(undefined)
    setRepSummary(undefined)
    if (!opts?.reuseUpload) {
      setUploadMeta(null)
    }
    const built = buildMockPayload()
    if (!built) {
      setAnalysisError('Capture at least one rep and ensure clientId is present before analyzing.')
      return
    }
    setPayload(built)
    setAnalysisLoading(true)
    try {
      const frames = frameBufferRef.current.slice()
      if (recordedBlobRef.current && clientId) {
        const fd = new FormData()
        const fileName = (recordedBlobRef.current.type.includes('mp4') ? 'screen.mp4' : 'screen.webm')
        fd.append('video', recordedBlobRef.current, fileName)
        fd.append('clientId', clientId)
        fd.append('pattern', (patternKey[0]?.toUpperCase() ?? 'S') + patternKey.slice(1))
        fd.append('camera_view', cameraView)
        if (opts?.override) {
          fd.append('override_variation', opts.override)
        }
        const up = await fetch('/.netlify/functions/screen-analyze', { method: 'POST', body: fd })
        if (!up.ok) {
          const errJson = await up.json().catch(() => ({}))
          throw new Error(errJson?.error ?? `Screen analyze failed (${up.status})`)
        }
        const uploaded = await up.json()
        if (uploaded?.analysis?.kpis?.length === 4) {
          const ca = uploaded.analysis as CoachAnalysis
          setCoachAnalysis(ca)
          setUploadMeta({ storageKey: uploaded.storage_path, clip_duration_s_est: uploaded.clip_duration_s_est })
          const mapped: MovementAnalysisResponse = {
            pattern: (ca.pattern as any) as Pattern,
            overall_score_0_3: ca.overall_score_0_3,
            priority_order: ca.priority_order || [],
            global_notes: ca.global_notes,
            detected_variation: ca.detected_variation,
            detected_variation_original: ca.detected_variation_original,
            coach_variation_override: ca.coach_variation_override,
            load_readiness: ca.load_readiness,
            kpis: ca.kpis.map((k) => ({
              key: k.key,
              pass: k.pass,
              pass_original: k.pass,
              pass_override: null,
              score_0_3: k.score_0_3 as 0|1|2|3,
              why: k.why,
              cues: k.cues || [],
              regression: k.regression || undefined,
              progression: k.progression || undefined,
              confidence: 0.6,
            })) as any,
            briefing: {
              load_readiness: ca.load_readiness,
              strengths: ca.briefing?.strengths ?? [],
              improvements: ca.briefing?.improvements ?? [],
              consequences_positive: ca.briefing?.consequences_positive ?? '',
              consequences_negative: ca.briefing?.consequences_negative ?? '',
              action_plan: ca.briefing?.action_plan ?? { focus_this_week: '', drills: [] },
            },
            rep_insights: undefined,
            rep_summary: undefined,
          }
          const insights = mapRawRepsToInsights(ca.reps as any)
          if (insights) {
            mapped.rep_insights = insights
            const summary = summarizeRepInsights(insights)
            if (summary) mapped.rep_summary = summary
          }
          setAnalysisResponse(mapped)
          const originals = Object.fromEntries(mapped.kpis.map((kpi: KpiResult) => [kpi.key, !!kpi.pass]))
          setKpiOriginals(originals)
          setKpiOverrides(originals)
          setKpiOverrideActive({})
          setRepInsights(insights)
          setRepSummary(mapped.rep_summary ?? summarizeRepInsights(insights))
          return
        }
      }
      // Fallback: direct analyze from frames or feature payload
      const requestBody = frames.length >= 8 ? { pattern: patternKey, frames } : built
      if (opts?.override) {
        ;(requestBody as any).overrideVariation = opts.override
      }
      const resp = await fetch('/.netlify/functions/movement-analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        const msg = errJson?.error ? `${errJson.error}${errJson.detail ? `: ${errJson.detail}` : ''}` : `Analysis request failed (${resp.status})`
        setAnalysisError(msg)
        return
      }
      const data = await resp.json()
      if (data && Array.isArray(data.kpis) && data.kpis.length === 4) {
        const analysis = data as MovementAnalysisResponse
        setAnalysisResponse(analysis)
        const originals = Object.fromEntries(analysis.kpis.map((kpi) => [kpi.key, !!kpi.pass]))
        setKpiOriginals(originals)
        setKpiOverrides(originals)
        const insights = analysis.rep_insights ?? mapRawRepsToInsights((analysis as any).reps)
        setRepInsights(insights)
        setRepSummary(analysis.rep_summary ?? summarizeRepInsights(insights))
        return
      }
      setAnalysisError('Analysis response missing KPI data. See console for payload.')
      console.info('Analysis response:', data)
    } catch (error: any) {
      console.error('Movement analysis error', error)
      setAnalysisError(error?.message ?? 'Failed to analyze movement')
    } finally {
      setAnalysisLoading(false)
    }
  }, [buildMockPayload, payload, patternKey, clientId])

  const saveScreen = useCallback(async (applyToPlan: boolean) => {
    setSaveError(null)
    setSaveSuccess(null)
    if (!clientId) {
      setSaveError('Missing clientId in query string.')
      return
    }
    if (!payload || !analysisResponse) {
      setSaveError('Run analysis before saving.')
      return
    }
    setSaveLoading(true)
    try {
      const mergedAnalysis: MovementAnalysisResponse = {
        ...analysisResponse,
        kpis: analysisResponse.kpis.map((kpi: KpiResult) => ({
          ...kpi,
          pass_original: kpi.pass_original ?? kpi.pass,
          pass_override: (kpiOverrides[kpi.key] ?? kpi.pass) === (kpiOriginals[kpi.key] ?? kpi.pass) ? null : (kpiOverrides[kpi.key] ?? kpi.pass),
          pass: kpiOverrides[kpi.key] ?? kpi.pass
        })),
      }

      const res = await fetch('/.netlify/functions/movement-screen-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          pattern: payload.pattern,
          featurePayload: payload,
          analysis: mergedAnalysis,
          coachAnalysis,
          cameraView,
          storageKey: uploadMeta?.storageKey ?? null,
          clipDuration: uploadMeta?.clip_duration_s_est ?? null
        })
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error ?? `Save failed (${res.status})`)
      }
      const { screenId } = await res.json()
      setSaveSuccess('Movement screen saved.')

      const fuseRes = await fetch('/.netlify/functions/elevation-fuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, screenId, applyToPlan })
      })
      if (!fuseRes.ok) {
        const errJson = await fuseRes.json().catch(() => ({}))
        console.warn('Elevation fuse failed', errJson)
        setSaveError(errJson.error ?? 'Saved, but Elevation Map refresh failed. Try again later.')
      } else {
        setSaveSuccess('Saved and synced to Elevation Map.')
        navigate(`/elevate/screen${clientId ? `?clientId=${clientId}` : ''}`)
      }
    } catch (error: any) {
      console.error('Save screen error', error)
      setSaveError(error?.message ?? 'Unable to save screen')
    } finally {
      setSaveLoading(false)
    }
  }, [analysisResponse, clientId, kpiOriginals, kpiOverrides, payload])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      triggerHaptic([120])
      void beginRecording()
      return
    }
    countdownTimeoutRef.current = window.setTimeout(() => {
      setCountdown((prev) => (prev && prev > 0 ? prev - 1 : prev))
      triggerHaptic(30)
    }, 1000)
    return () => {
      if (countdownTimeoutRef.current) {
        window.clearTimeout(countdownTimeoutRef.current)
        countdownTimeoutRef.current = null
      }
    }
  }, [beginRecording, countdown, triggerHaptic])

  return (
    <RequireTrainer>
      <Layout>
        {/* Full-screen camera overlay */}
        {cameraOverlayOpen && (
          <div className="fixed inset-0 z-50 bg-black">
            <video ref={overlayVideoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
            {/* Guidance */}
            {!isRecording && countdown === null && !recordedUrl && (
              <div className="absolute inset-x-0 text-center text-white text-sm opacity-90 top-[calc(var(--safe-top)+1.5rem)]">
                Position the full body in frame. Tap Record when ready.
              </div>
            )}
            {/* Countdown */}
            {countdown !== null && !isRecording && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-6xl font-bold">
                {countdown}
              </div>
            )}
            {/* Bottom controls */}
            <div className="absolute inset-x-0 flex flex-col items-center gap-4 px-6 bottom-[calc(var(--safe-bottom)+1.5rem)]">
              {isRecording ? (
                <button type="button" onClick={stopOverlayRecording} className="relative h-20 w-20 rounded-full bg-transparent">
                  {(() => {
                    const progress = Math.min(recordMs / 30000, 1)
                    const deg = Math.round(progress * 360)
                    return (
                      <div
                        className="absolute inset-0 rounded-full p-1"
                        style={{
                          background: `conic-gradient(#ef4444 ${deg}deg, rgba(255,255,255,0.2) 0deg)`,
                        }}
                      >
                        <div className="h-full w-full rounded-full bg-black flex items-center justify-center">
                          <div className="h-12 w-12 rounded-full bg-red-500" />
                        </div>
                      </div>
                    )
                  })()}
                </button>
              ) : (recordedUrl || payload) ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded-md bg-[#3FAE52] text-white px-5 py-2 text-sm font-semibold"
                    onClick={async () => {
                      setCameraOverlayOpen(false)
                      stopCamera()
                      if (videoRef.current && recordedUrl) {
                        try { (videoRef.current as any).srcObject = null } catch {}
                        videoRef.current.src = recordedUrl
                        try { videoRef.current.currentTime = 0 } catch {}
                        await new Promise<void>((resolve) => {
                          const onLoaded = () => resolve()
                          videoRef.current?.addEventListener('loadedmetadata', onLoaded, { once: true })
                        })
                        videoRef.current.loop = false
                        videoRef.current.controls = true
                        await videoRef.current.play().catch(() => undefined)
                      }
                    }}
                  >Use screen</button>
                  <button
                    type="button"
                    className="rounded-md border bg-white/90 backdrop-blur px-5 py-2 text-sm font-semibold"
                    onClick={() => { void runAnalysis() }}
                  >Analyze now</button>
                  <button
                    type="button"
                    className="rounded-md border bg-white/90 backdrop-blur px-5 py-2 text-sm font-semibold"
                    onClick={async () => {
                      if (videoRef.current) {
                        videoRef.current.pause()
                        try { videoRef.current.currentTime = 0 } catch {}
                      }
                      if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null) }
                      setCapturedReps([])
                      setPayload(null)
                      setAnalysisResponse(null)
                      setAnalysisError(null)
                      await ensureCamera()
                    }}
                  >Retake</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-full bg-[#3FAE52] text-white h-20 w-20 text-sm font-semibold flex items-center justify-center"
                  onClick={handleRecord}
                >Record</button>
              )}
            </div>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
          <div className="space-y-4">
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={()=>navigate(`/elevate/screen${clientId ? `?clientId=${clientId}` : ''}`)}>
              ← Back to patterns
            </button>
            <header className="space-y-3 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Elevate • Movement Screen
              </div>
              <h1 className="text-3xl font-semibold">{header}</h1>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">{pattern.blurb}</p>
            </header>

            <div className="space-y-6">
              <div className="space-y-4">
                {recordedUrl && (
                  <div className="relative aspect-[9/16] sm:aspect-video overflow-hidden rounded-lg border bg-black max-h-[80dvh] sm:max-h-none">
                    <video ref={videoRef} className="h-full w-full object-cover" playsInline muted controls={!!recordedUrl} />
                  </div>
                )}

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold">Recording controls</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                      {/* Camera view selection moved into pre-capture guide */}
                      {/* Hidden native camera input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleNativeFileSelected}
                      />
                      <button
                        type="button"
                        className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium bg-[#3FAE52] text-white disabled:opacity-50"
                        disabled={isRequestingCamera || poseLoading}
                        onClick={() => { setShowCaptureGuide(true) }}
                      >Start capture</button>
                      {/* Keep demo/testing buttons */}
                      <button
                        type="button"
                        className="w-full sm:w-auto px-3 py-2 rounded-md border text-sm disabled:opacity-50"
                        onClick={() => { addMockRep() }}
                        disabled={capturedReps.length >= 10 || analysisLoading}
                      >Add mock rep</button>
                      <button
                        type="button"
                        className="w-full sm:w-auto px-3 py-2 rounded-md border text-sm"
                        onClick={() => void runAnalysis()}
                        disabled={analysisLoading}
                      >{analysisLoading ? 'Analyzing…' : 'Analyze set'}</button>
                      <button
                        type="button"
                        className="w-full sm:w-auto px-3 py-2 rounded-md border text-sm"
                        onClick={handleRetake}
                        disabled={analysisLoading}
                      >Retake</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Reps queued</span>
                    <span>{capturedReps.length} / 10</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {poseLoading
                      ? 'Loading pose detection model…'
                      : poseError
                        ? poseError
                        : cameraOverlayOpen
                          ? 'Full-screen camera active. Use the on-screen controls.'
                          : 'Build a mock set (Add mock rep up to 10) and click Analyze set for a full randomized analysis, or Start capture to record/upload a clip. Use Retake to reset everything and try again.'}
                  </div>
                </div>

                {/* Feature payload preview removed for end users */}
              </div>

              <div className="space-y-4">
                {variationCard && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="text-sm font-semibold">Detected variation</div>
                    <VariationBadge
                      variation={variationCard.variation}
                      variationOriginal={variationCard.variationOriginal}
                      coachOverride={variationCard.coachOverride}
                      loadReadiness={variationCard.readiness}
                      confidence={variationCard.confidence}
                      cameraLimits={variationCard.cameraLimits}
                      overallPass={variationCard.overallPass}
                      overrideToggle={{
                        active: overrideActive,
                        onToggle: () => setOverrideActive((v) => !v),
                        disabled: analysisLoading || (!analysisResponse && !coachAnalysis),
                      }}
                    />
                    {overrideActive && variationOptions.length > 0 && (
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide">
                          <span className="font-semibold text-foreground">Coach override</span>
                          <select
                            className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            value={variationOverride}
                            onChange={(e) => setVariationOverride(e.target.value)}
                            disabled={analysisLoading || (!analysisResponse && !coachAnalysis)}
                          >
                            <option value="">Use detected variation</option>
                            {variationOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </label>
                        {(() => {
                          const currentFinal = variationCard.variation
                          const hasCurrentOverride = !!(coachAnalysis?.coach_variation_override || analysisResponse?.coach_variation_override)
                          const selected = variationOverride
                          const changed = (selected === '' && hasCurrentOverride) || (selected !== '' && selected.trim() !== currentFinal)
                          return (
                            <div className="flex flex-wrap gap-2">
                              {changed && (
                                <button
                                  type="button"
                                  className="rounded-md border px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
                                  onClick={() => void runAnalysis({ override: variationOverride || null, reuseUpload: true })}
                                  disabled={analysisLoading || (!analysisResponse && !coachAnalysis)}
                                >
                                  {analysisLoading ? 'Re-analyzing…' : 'Apply override'}
                                </button>
                              )}
                              {hasCurrentOverride && (
                                <button
                                  type="button"
                                  className="rounded-md border px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
                                  onClick={() => { setVariationOverride(''); void runAnalysis({ override: null, reuseUpload: true }) }}
                                  disabled={analysisLoading || (!analysisResponse && !coachAnalysis)}
                                >
                                  Clear override
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}
                {(analysisResponse?.briefing || coachAnalysis?.briefing) && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="text-sm font-semibold">Coach briefing</div>
                    <CoachBriefing briefing={(analysisResponse?.briefing ?? coachAnalysis?.briefing)!} />
                  </div>
                )}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold">KPI results</div>
                  {analysisError && <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">{analysisError}</div>}
                  {!analysisResponse && !analysisError && (
                    <p className="text-xs text-muted-foreground">
                      After the analyzer returns ``MovementAnalysisResponse``, render four cards with pass/fail status, scores, cues, regression/progression, and confidence meters.
                    </p>
                  )}
                  {analysisResponse && (
                    <div className="space-y-2">
                      <div className="rounded border bg-background p-3 text-xs text-muted-foreground">
                        Overall score: <span className="font-semibold text-foreground">{analysisResponse.overall_score_0_3} / 3</span>
                        {analysisResponse.global_notes && <div className="mt-1 text-muted-foreground">{analysisResponse.global_notes}</div>}
                      </div>
                      {analysisResponse.kpis.map((kpi) => {
                        const originalPass = kpiOriginals[kpi.key] ?? kpi.pass
                        const overrideValue = kpiOverrides[kpi.key]
                        const finalPass = overrideValue ?? originalPass
                        const overrideApplied = finalPass !== originalPass
                        const status = statusFromScore(kpi.score_0_3)
                        const cuesToShow = buildCues(kpi.key, status)
                        const positive = (status === 'ok' && kpi.why && kpi.why.trim().length > 0)
                          ? kpi.why
                          : buildPositive(kpi.key, status)
                        const noticedRaw = (kpi.why && kpi.why.trim().length > 0) ? kpi.why : buildWhyFromScore(kpi.key, kpi.score_0_3)
                        const noticed = status === 'ok' ? 'No concerns noted in this set.' : noticedRaw
                        return (
                          <div key={kpi.key} className="rounded border bg-background p-3 space-y-2 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between text-sm text-foreground">
                            <span className="font-semibold uppercase tracking-wide">{kpi.key.replace(/_/g, ' ')}</span>
                            <span>{kpi.score_0_3}/3 • {finalPass ? 'Pass' : 'Needs work'}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">What was good: {positive}</div>
                          <div className="text-[11px] text-muted-foreground">What we noticed: {noticed}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1 font-semibold transition ${
                                finalPass
                                  ? 'border-transparent bg-emerald-500 text-white'
                                  : 'hover:bg-muted'
                              } ${kpiOverrideActive[kpi.key] ? '' : 'pointer-events-none opacity-60'}`}
                              onClick={() => kpiOverrideActive[kpi.key] && setKpiOverrides((prev) => ({ ...prev, [kpi.key]: true }))}
                            >Pass</button>
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1 font-semibold transition ${
                                finalPass
                                  ? 'hover:bg-muted'
                                  : 'border-transparent bg-amber-500 text-white'
                              } ${kpiOverrideActive[kpi.key] ? '' : 'pointer-events-none opacity-60'}`}
                              onClick={() => kpiOverrideActive[kpi.key] && setKpiOverrides((prev) => ({ ...prev, [kpi.key]: false }))}
                            >Needs work</button>
                            {overrideApplied && (
                              <span className="rounded bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Coach override</span>
                            )}
                            <button
                              type="button"
                              className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                                kpiOverrideActive[kpi.key]
                                  ? 'border-transparent bg-indigo-600 text-white'
                                  : 'border-muted bg-background text-muted-foreground hover:bg-muted/70'
                              }`}
                              onClick={() => setKpiOverrideActive((prev) => ({ ...prev, [kpi.key]: !prev[kpi.key] }))}
                              disabled={analysisLoading}
                            >
                              <span>Coach override</span>
                              <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${kpiOverrideActive[kpi.key] ? 'bg-white/80' : 'bg-muted-foreground/30'}`}>
                                <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-indigo-600 transition-transform ${kpiOverrideActive[kpi.key] ? 'translate-x-3' : 'translate-x-0'}`} />
                              </span>
                            </button>
                          </div>
                          {/* Standardized notice is already shown above */}
                          {cuesToShow.length > 0 && (
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground/90">
                              {cuesToShow.map((cue, idx) => (
                                <li key={idx}>{cue}</li>
                              ))}
                            </ul>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-muted-foreground/80">
                            {kpi.regression && <span className="rounded bg-amber-200/60 px-2 py-0.5">Regression: {kpi.regression}</span>}
                            {kpi.progression && <span className="rounded bg-emerald-200/60 px-2 py-0.5">Progression: {kpi.progression}</span>}
                            <span className="rounded bg-muted px-2 py-0.5">Confidence {(kpi.confidence * 100).toFixed(0)}%</span>
                          </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {analysisLoading && <div className="text-xs text-muted-foreground">Analyzing movement…</div>}
                </div>

                {(repSummary || repInsights) && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="text-sm font-semibold">Rep-by-rep insights</div>
                    {repSummary && (
                      <div className="rounded border bg-background p-3 text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">Set view</div>
                        <div>{repSummary.overall}</div>
                      </div>
                    )}
                    {repSummary?.segments && repSummary.segments.length > 0 && (
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        {repSummary.segments.map((seg) => (
                          <div key={seg.segment} className="rounded border bg-background p-3 space-y-1">
                            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
                              <span className="font-semibold text-foreground">{seg.segment}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REP_STATUS_BADGE[seg.dominant_status]}`}>
                                {REP_STATUS_LABELS[seg.dominant_status]}
                              </span>
                            </div>
                            <div className="text-muted-foreground whitespace-pre-line">{seg.summary}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {repInsights && (
                      <div className="space-y-2 text-xs text-muted-foreground">
                        {repInsights.map((rep) => (
                          <div key={rep.rep_index} className="rounded border bg-background p-3 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">Rep {rep.rep_index}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REP_STATUS_BADGE[rep.status]}`}>
                                {REP_STATUS_LABELS[rep.status]}
                              </span>
                            </div>
                            <div>{rep.key_findings}</div>
                            {rep.focus_next_rep && (
                              <div className="text-muted-foreground/80">Next rep focus: {rep.focus_next_rep}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {coachAnalysis && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="text-sm font-semibold">KPI overview</div>
                    <KpiCards kpis={coachAnalysis.kpis} />
                    <CoachBriefing briefing={coachAnalysis.briefing} />
                  </div>
                )}

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold">Next actions</div>
                  <p className="text-xs text-muted-foreground">Save and apply this screen to the client’s Elevation Map. You can retake from the controls above to capture a new set.</p>
                  {saveError && <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">{saveError}</div>}
                  {saveSuccess && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700">{saveSuccess}</div>}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <button
                      type="button"
                      className="h-10 rounded-md bg-[#3FAE52] text-white text-sm font-semibold disabled:opacity-60 w-full sm:w-auto"
                      disabled={saveLoading || !analysisResponse}
                      onClick={() => void saveScreen(true)}
                    >{saveLoading ? 'Syncing…' : 'Save & apply to plan'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {showCaptureGuide && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-xl">
              <div className="p-4 border-b">
                <div className="text-sm font-semibold">Setup capture</div>
                <div className="text-xs text-muted-foreground">Follow these steps for the most accurate analysis.</div>
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold">Recommended angle</div>
                  <div className="space-y-2">
                    {(CAPTURE_GUIDES[patternKey]?.angles ?? []).map((opt: { value: 'front'|'front45'|'side'; label: string; benefit: string }) => (
                      <label key={opt.value} className="flex items-start gap-2 text-xs">
                        <input
                          type="radio"
                          className="mt-0.5"
                          name="angle"
                          value={opt.value}
                          checked={guideAngle === opt.value}
                          onChange={() => setGuideAngle(opt.value)}
                        />
                        <span>
                          <span className="font-semibold">{opt.label}</span>
                          <span className="block text-muted-foreground">{opt.benefit}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold">Steps</div>
                  <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
                    {(CAPTURE_GUIDES[patternKey]?.steps ?? []).map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm"
                  onClick={() => setShowCaptureGuide(false)}
                >Cancel</button>
                <button
                  type="button"
                  className="rounded-md bg-[#3FAE52] text-white px-4 py-2 text-sm font-semibold"
                  onClick={async () => {
                    setCameraView(guideAngle)
                    setShowCaptureGuide(false)
                    setRecordedUrl(null)
                    setCapturedReps([])
                    setPayload(null)
                    setAnalysisResponse(null)
                    setAnalysisError(null)
                    if (fileInputRef.current) {
                      fileInputRef.current.click()
                    } else {
                      setCameraOverlayOpen(true)
                      await ensureCamera()
                    }
                  }}
                >Start</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </RequireTrainer>
  )
}
