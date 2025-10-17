declare module '@tensorflow-models/pose-detection' {
  export type SupportedModel = 'MoveNet'

  export interface Keypoint {
    name?: string
    x: number
    y: number
    score?: number
  }

  export interface Pose {
    keypoints: Keypoint[]
  }

  export interface PoseDetector {
    estimatePoses(
      source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas,
      options?: { flipHorizontal?: boolean }
    ): Promise<Pose[]>
  }

  export const SupportedModels: {
    MoveNet: SupportedModel
  }

  export const movenet: {
    modelType: {
      SINGLEPOSE_LIGHTNING: string
      SINGLEPOSE_THUNDER: string
    }
  }

  export function createDetector(model: SupportedModel, config?: Record<string, unknown>): Promise<PoseDetector>
}

declare module '@tensorflow/tfjs-core' {
  export function getBackend(): string
  export function setBackend(name: string): Promise<void>
  export function ready(): Promise<void>
}

declare module '@tensorflow/tfjs-backend-webgl'
