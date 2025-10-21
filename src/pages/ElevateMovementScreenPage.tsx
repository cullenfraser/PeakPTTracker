import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireTrainer from '@/components/RequireTrainer'
import { supabase } from '@/lib/supabase'

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
}

interface MovementAnalysisResponse {
  pattern: Pattern
  kpis: KpiResult[]
  overall_score_0_3: 0 | 1 | 2 | 3
  priority_order: string[]
  global_notes?: string
}

export default function ElevateMovementScreenPage() {
  const navigate = useNavigate()
  const params = useParams()
  const [search] = useSearchParams()
  const clientId = search.get('clientId')
  const patternKey = params.pattern ?? 'squat'
  const pattern = patternCopy[patternKey] ?? patternCopy.squat
  const [isRecording, setIsRecording] = useState(false)
  const [capturedReps, setCapturedReps] = useState<RepMetrics[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isRequestingCamera, setIsRequestingCamera] = useState(false)
  const [payload, setPayload] = useState<FeaturePayload | null>(null)
  const [analysisResponse, setAnalysisResponse] = useState<MovementAnalysisResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [kpiOverrides, setKpiOverrides] = useState<Record<string, boolean>>({})
  const [kpiOriginals, setKpiOriginals] = useState<Record<string, boolean>>({})
  const [countdown, setCountdown] = useState<number | null>(null)
  const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false)
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

  const header = useMemo(() => {
    const base = pattern.title
    const suffix = clientName ?? (clientId ? `Client ${clientId}` : null)
    return suffix ? `${base} • ${suffix}` : base
  }, [pattern.title, clientName, clientId])

  const KPI_DESCRIPTIONS: Record<string, string> = {
    depth: 'Depth achieved relative to target range; sufficient ROM maintained.',
    knee_valgus: 'Knee tracking over the foot; minimize inward collapse (valgus).',
    trunk_flex: 'Torso inclination and bracing; maintain a neutral, controlled spine.',
    tempo: 'Eccentric and concentric pacing; smooth control across phases.',
    hinge_ratio: 'Hip vs knee flexion balance indicating a proper hinge pattern.',
    heels_down: 'Foot stability and heel contact maintained through the rep.',
    scap_timing_ok: 'Scapular setting and timing relative to torso/arm motion.',
    torso_sway_deg: 'Side-to-side sway indicating stability and control.',
    elbow_path_deg: 'Elbow travel path relative to the intended groove.',
    wrist_dev_deg: 'Wrist deviation and neutral grip control under load.',
    knee_flex_deg: 'Knee flexion angle quality and consistency.',
    hip_flex_deg: 'Hip flexion angle quality and consistency.',
  }

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
    setCameraError(null)
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
        setCameraReady(true)
      }
      if (overlayVideoRef.current) {
        overlayVideoRef.current.srcObject = stream
        await overlayVideoRef.current.play().catch(() => undefined)
      }
    } catch (err: any) {
      console.error('Failed to access camera', err)
      setCameraError(err?.message ?? 'Unable to access camera. Please check permissions and hardware.')
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
    setCameraReady(false)
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
    if (!clientId) return null
    const avgDepth = average(reps.map((rep) => rep.depth_deg ?? 0))
    const avgKneeValgus = average(reps.map((rep) => rep.knee_valgus_deg ?? 0))
    return {
      pattern: (patternKey.toUpperCase().charAt(0) + patternKey.slice(1)) as Pattern,
      clientId,
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
    if (!clientId) return null
    const reps = capturedReps.length
      ? capturedReps
      : [
          {
            rep: 1,
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
            heels_down: true
          }
        ]
    const assembled = computeFeaturePayload(reps)
    if (!assembled) return null
    return {
      ...assembled,
      flags: {
        ...assembled.flags,
        sample: true
      }
    }
  }, [capturedReps, clientId, computeFeaturePayload])

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
        videoRef.current.loop = true
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

  const runAnalysis = useCallback(async () => {
    setAnalysisError(null)
    setAnalysisResponse(null)
    setSaveSuccess(null)
    setKpiOverrides({})
    setKpiOriginals({})
    setUploadMeta(null)
    const built = payload ?? buildMockPayload()
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
        fd.append('pattern', patternKey)
        fd.append('camera_view', 'front')
        const up = await fetch('/.netlify/functions/movement-upload', { method: 'POST', body: fd })
        if (!up.ok) {
          const errJson = await up.json().catch(() => ({}))
          throw new Error(errJson?.error ?? `Upload analyze failed (${up.status})`)
        }
        const uploaded = await up.json()
        if (uploaded?.analysis?.kpis?.length === 4) {
          const analysis = uploaded.analysis as MovementAnalysisResponse
          setAnalysisResponse(analysis)
          setUploadMeta({ storageKey: uploaded.storageKey, clip_duration_s_est: uploaded.clip_duration_s_est })
          const originals = Object.fromEntries(analysis.kpis.map((kpi: KpiResult) => [kpi.key, !!kpi.pass]))
          setKpiOriginals(originals)
          setKpiOverrides(originals)
          return
        }
      }
      // Fallback: direct analyze from frames or feature payload
      const requestBody = frames.length >= 8 ? { pattern: patternKey, frames } : built
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
        const originals = Object.fromEntries(analysis.kpis.map((kpi: KpiResult) => [kpi.key, !!kpi.pass]))
        setKpiOriginals(originals)
        setKpiOverrides(originals)
      } else {
        setAnalysisError('Analysis response missing KPI data. See console for payload.')
        console.info('Analysis response:', data)
      }
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
        body: JSON.stringify({ clientId, pattern: payload.pattern, featurePayload: payload, analysis: mergedAnalysis, storageKey: uploadMeta?.storageKey ?? null, clipDuration: uploadMeta?.clip_duration_s_est ?? null })
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
        setSaveSuccess(applyToPlan ? 'Saved and synced to Elevation Map.' : 'Saved screen. Elevation Map refreshed.')
        if (applyToPlan && clientId) {
          navigate(`/elevate/map?clientId=${clientId}&tab=screen`)
        }
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
                      // Close overlay and replay the recorded video in-page
                      setCameraOverlayOpen(false)
                      stopCamera()
                      if (videoRef.current && recordedUrl) {
                        try {
                          (videoRef.current as any).srcObject = null
                        } catch {}
                        videoRef.current.src = recordedUrl
                        videoRef.current.loop = true
                        videoRef.current.controls = true
                        await videoRef.current.play().catch(() => undefined)
                      } else {
                        // No recorded file (unsupported MediaRecorder). Inline preview remains camera placeholder.
                      }
                    }}
                  >Use screen</button>
                  <button
                    type="button"
                    className="rounded-md border bg-white/90 backdrop-blur px-5 py-2 text-sm font-semibold"
                    onClick={async () => {
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

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="relative aspect-[9/16] sm:aspect-video overflow-hidden rounded-lg border bg-black max-h-[80dvh] sm:max-h-none">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <div className="space-y-3 text-center text-sm text-white">
                        <div>{isRequestingCamera ? 'Requesting camera…' : 'Camera not active'}</div>
                        <p className="text-xs text-white/80 max-w-xs mx-auto">
                          Grant camera access to preview movement in real time. We will overlay pose landmarks and rep guidance here.
                        </p>
                        {cameraError && <div className="rounded bg-red-500/80 px-3 py-1 text-xs">{cameraError}</div>}
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-[11px] uppercase tracking-wide text-white">
                    Reps captured: {capturedReps.length}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold">Recording controls</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
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
                        onClick={async () => {
                          setRecordedUrl(null)
                          setCapturedReps([])
                          setPayload(null)
                          setAnalysisResponse(null)
                          setAnalysisError(null)
                          // Prefer native camera full-screen on mobile
                          if (fileInputRef.current) {
                            fileInputRef.current.click()
                          } else {
                            // Fallback to in-app overlay
                            setCameraOverlayOpen(true)
                            await ensureCamera()
                          }
                        }}
                      >Start capture</button>
                      {/* Keep demo/testing buttons */}
                      <button
                        type="button"
                        className="w-full sm:w-auto px-3 py-2 rounded-md border text-sm"
                        onClick={() => {
                          const mock = buildMockPayload()
                          if (mock) {
                            mock.flags.sample = true
                            setCapturedReps(mock.reps)
                            setPayload(mock)
                          }
                          setAnalysisResponse(null)
                          setAnalysisError(null)
                          setTimeout(() => { void runAnalysis() }, 0)
                        }}
                      >Mock reps</button>
                      <button
                        type="button"
                        className="w-full sm:w-auto px-3 py-2 rounded-md border text-sm"
                        onClick={runAnalysis}
                        disabled={analysisLoading}
                      >{analysisLoading ? 'Analyzing…' : 'Analyze sample'}</button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {poseLoading
                      ? 'Loading pose detection model…'
                      : poseError
                        ? poseError
                        : cameraOverlayOpen
                          ? 'Full-screen camera active. Use the on-screen controls.'
                          : 'Tap Start capture to open camera. After recording, choose Use screen or Retake.'}
                  </div>
                </div>

                {/* Feature payload preview removed for end users */}
              </div>

              <aside className="space-y-4">
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
                        const desc = KPI_DESCRIPTIONS[kpi.key] ?? 'Key technique indicator for this pattern.'
                        const noticed = (kpi.why && kpi.why.trim().length)
                          ? kpi.why
                          : `${finalPass ? 'Passing' : 'Needs work'} based on current estimate. Score ${kpi.score_0_3}/3.`
                        return (
                          <div key={kpi.key} className="rounded border bg-background p-3 space-y-2 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between text-sm text-foreground">
                            <span className="font-semibold uppercase tracking-wide">{kpi.key.replace(/_/g, ' ')}</span>
                            <span>{kpi.score_0_3}/3 • {finalPass ? 'Pass' : 'Needs work'}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">What we evaluate: {desc}</div>
                          <div className="text-[11px] text-muted-foreground">What we noticed: {noticed}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1 font-semibold transition ${
                                finalPass
                                  ? 'border-transparent bg-emerald-500 text-white'
                                  : 'hover:bg-muted'
                              }`}
                              onClick={() => setKpiOverrides((prev) => ({ ...prev, [kpi.key]: true }))}
                            >Pass</button>
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1 font-semibold transition ${
                                finalPass
                                  ? 'hover:bg-muted'
                                  : 'border-transparent bg-amber-500 text-white'
                              }`}
                              onClick={() => setKpiOverrides((prev) => ({ ...prev, [kpi.key]: false }))}
                            >Needs work</button>
                            {overrideApplied && (
                              <span className="rounded bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Coach override</span>
                            )}
                          </div>
                          <div>{kpi.why}</div>
                          {kpi.cues.length > 0 && (
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground/90">
                              {kpi.cues.map((cue, idx) => (
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

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold">Next actions</div>
                  <p className="text-xs text-muted-foreground">
                    Provide buttons to Save, Save & Apply to Elevation Map, or retake the screen. When saving, persist to Supabase and invoke `/api/elevation/fuse`.
                  </p>
                  {saveError && <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">{saveError}</div>}
                  {saveSuccess && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700">{saveSuccess}</div>}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <button
                      type="button"
                      className="h-10 rounded-md bg-[#3FAE52] text-white text-sm font-semibold disabled:opacity-60 w-full sm:w-auto"
                      disabled={saveLoading || !analysisResponse}
                      onClick={() => void saveScreen(false)}
                    >{saveLoading ? 'Saving…' : 'Save screen'}</button>
                    <button
                      type="button"
                      className="h-10 rounded-md border text-sm disabled:opacity-60 w-full sm:w-auto"
                      disabled={saveLoading || !analysisResponse}
                      onClick={() => void saveScreen(true)}
                    >{saveLoading ? 'Syncing…' : 'Save & apply to plan'}</button>
                    <button type="button" className="h-10 rounded-md border text-sm w-full sm:w-auto">Retake</button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </Layout>
    </RequireTrainer>
  )
}
