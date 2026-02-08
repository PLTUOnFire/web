/**
 * Hook for Eye Tracking Calibration
 * Handles multi-pose calibration process with step-by-step flow
 * Supports simultaneous capture from multiple cameras
 */

import { useState, useCallback } from 'react'
import config from '../config'

interface CalibrationPoint {
  step: number
  pose_idx: number
  point_idx: number
  point_name: string
  target_x: number
  target_y: number
  pose_instruction: string
}

interface CameraConfig {
  cameraId: string
  sessionId: string
  videoRef: React.RefObject<HTMLVideoElement>
}

interface CalibrationHookProps {
  cameras: CameraConfig[]
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

export function useCalibration({ cameras, onLog }: CalibrationHookProps) {
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [totalSteps, setTotalSteps] = useState(0)
  const [currentPoint, setCurrentPoint] = useState<CalibrationPoint | null>(null)
  const [calibrationComplete, setCalibrationComplete] = useState(false)
  const [calibrationAccuracy, setCalibrationAccuracy] = useState(0)

  /**
   * Get active cameras that have:
   * 1. A valid video element with active stream
   * 2. A sessionId (meaning /record/start was called for this camera)
   */
  const getActiveCameras = useCallback(() => {
    return cameras.filter(cam => {
      const video = cam.videoRef.current
      return video && video.srcObject && video.videoWidth > 0 && cam.sessionId
    })
  }, [cameras])

  /**
   * Start calibration process for ALL cameras simultaneously
   * Backend requires /record/start first (creates CameraSession in camera_sessions dict)
   * Backend StartCalibrationRequest: { session_id, camera_id }
   */
  const startCalibration = useCallback(async () => {
    try {
      const activeCameras = getActiveCameras()
      if (activeCameras.length === 0) {
        onLog?.('No cameras with active recording session. Please start recording first.', 'error')
        return false
      }

      onLog?.(`Starting calibration for ${activeCameras.length} camera(s): ${activeCameras.map(c => c.cameraId).join(', ')}`, 'info')

      // Start calibration on backend for each camera in parallel
      const startResults = await Promise.all(
        activeCameras.map(async (cam) => {
          try {
            const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationStart}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: cam.sessionId,
                camera_id: cam.cameraId
              })
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || `Failed: ${response.statusText}`)
            }

            const data = await response.json()

            // Backend may return error in response body
            if (data.error) {
              throw new Error(data.error)
            }

            onLog?.(`${cam.cameraId}: Calibration registered (${data.total_steps} points)`, 'success')
            return { cameraId: cam.cameraId, success: true, totalSteps: data.total_steps }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            onLog?.(`${cam.cameraId}: Calibration start failed: ${message}`, 'error')
            return { cameraId: cam.cameraId, success: false, totalSteps: 0 }
          }
        })
      )

      const successfulCams = startResults.filter(r => r.success)
      if (successfulCams.length === 0) {
        onLog?.('All cameras failed to start calibration', 'error')
        return false
      }

      // Use the total_steps from the first successful camera (should be the same for all)
      const steps = successfulCams[0].totalSteps

      setIsCalibrating(true)
      setTotalSteps(steps)
      setCurrentStep(0)
      setCalibrationComplete(false)

      // Get first point (use first camera - points are the same for all)
      await loadCalibrationPoint(0, activeCameras[0])

      onLog?.(`Calibration started: ${steps} points for ${successfulCams.length} camera(s)`, 'success')

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Calibration start failed: ${message}`, 'error')
      return false
    }
  }, [cameras, getActiveCameras, onLog])

  /**
   * Load calibration point data for specific step
   */
  const loadCalibrationPoint = useCallback(async (step: number, cam?: CameraConfig) => {
    try {
      // Use provided camera or first active camera
      const targetCam = cam || getActiveCameras()[0] || cameras[0]
      if (!targetCam) {
        throw new Error('No camera available')
      }

      // Backend format: /calibration/point/{camera_id}/{session_id}/{step}
      const response = await fetch(
        `${config.apiUrl}${config.endpoints.calibrationPoint}/${targetCam.cameraId}/${targetCam.sessionId}/${step}`
      )

      if (!response.ok) {
        throw new Error(`Failed to load point ${step}`)
      }

      const point: CalibrationPoint = await response.json()
      setCurrentPoint(point)
      setCurrentStep(step)

      return point
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Failed to load calibration point: ${message}`, 'error')
      return null
    }
  }, [cameras, getActiveCameras, onLog])

  /**
   * Capture frame from a single video element as base64 JPEG
   */
  const captureFrame = useCallback((videoElement: HTMLVideoElement): string | null => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      ctx.drawImage(videoElement, 0, 0)
      return canvas.toDataURL('image/jpeg', 0.9)
    } catch {
      return null
    }
  }, [])

  /**
   * Capture and send calibration sample from ALL cameras simultaneously
   */
  const captureCalibrationSample = useCallback(async () => {
    try {
      if (!currentPoint) {
        throw new Error('No calibration point loaded')
      }

      const activeCameras = getActiveCameras()
      if (activeCameras.length === 0) {
        throw new Error('No active cameras')
      }

      // Capture frames from ALL cameras at the same moment
      const frames: { cameraId: string; sessionId: string; frameBase64: string }[] = []
      for (const cam of activeCameras) {
        const video = cam.videoRef.current
        if (!video) continue

        const frameBase64 = captureFrame(video)
        if (frameBase64) {
          frames.push({ cameraId: cam.cameraId, sessionId: cam.sessionId, frameBase64 })
        } else {
          onLog?.(`${cam.cameraId}: Failed to capture frame`, 'warning')
        }
      }

      if (frames.length === 0) {
        throw new Error('Failed to capture any frames')
      }

      // Send all frames to backend in parallel (each with its own session_id)
      const results = await Promise.all(
        frames.map(async ({ cameraId, sessionId: camSessionId, frameBase64 }) => {
          try {
            const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationSample}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: camSessionId,
                camera_id: cameraId,
                step: currentStep,
                frame_base64: frameBase64
              })
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to add calibration sample')
            }

            const result = await response.json()
            if (result.error) {
              throw new Error(result.error)
            }

            onLog?.(`${cameraId}: Point ${currentStep + 1}/${totalSteps} captured`, 'success')
            return { cameraId, success: true, result }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            onLog?.(`${cameraId}: Sample capture failed: ${message}`, 'error')
            return { cameraId, success: false, result: null }
          }
        })
      )

      const successCount = results.filter(r => r.success).length
      if (successCount === 0) {
        throw new Error('All cameras failed to send samples')
      }

      onLog?.(`Step ${currentStep + 1}: ${successCount}/${frames.length} cameras captured`, 'info')

      // Return the first successful result (for CalibrationScreen flow)
      return results.find(r => r.success)?.result || results[0].result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Sample capture failed: ${message}`, 'error')
      return null
    }
  }, [currentStep, currentPoint, totalSteps, cameras, getActiveCameras, captureFrame, onLog])

  /**
   * Move to next calibration point
   */
  const nextCalibrationPoint = useCallback(async () => {
    const nextStep = currentStep + 1

    if (nextStep >= totalSteps) {
      // Calibration complete
      return await finishCalibration()
    }

    await loadCalibrationPoint(nextStep)
    return true
  }, [currentStep, totalSteps, loadCalibrationPoint])

  /**
   * Finish calibration and build model for ALL cameras
   */
  const finishCalibration = useCallback(async () => {
    try {
      const activeCameras = getActiveCameras()
      if (activeCameras.length === 0) {
        throw new Error('No active cameras')
      }

      onLog?.(`Finalizing calibration model for ${activeCameras.length} camera(s)...`, 'info')

      // Finish calibration for each camera in parallel (each with its own session_id)
      const results = await Promise.all(
        activeCameras.map(async (cam) => {
          try {
            const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationFinish}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: cam.sessionId,
                camera_id: cam.cameraId
              })
            })

            if (!response.ok) {
              throw new Error(`Failed to finish calibration for ${cam.cameraId}`)
            }

            const result = await response.json()
            if (result.error) {
              throw new Error(result.error)
            }

            const accuracy = result.accuracy || 0
            onLog?.(
              `${cam.cameraId}: Calibration complete! Accuracy: ${(accuracy * 100).toFixed(1)}%`,
              'success'
            )
            return { cameraId: cam.cameraId, success: true, accuracy }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            onLog?.(`${cam.cameraId}: Calibration finish failed: ${message}`, 'error')
            return { cameraId: cam.cameraId, success: false, accuracy: 0 }
          }
        })
      )

      const successfulResults = results.filter(r => r.success)
      if (successfulResults.length === 0) {
        throw new Error('All cameras failed to finish calibration')
      }

      // Average accuracy from all successful cameras
      const avgAccuracy = successfulResults.reduce((sum, r) => sum + r.accuracy, 0) / successfulResults.length

      setIsCalibrating(false)
      setCalibrationComplete(true)
      setCalibrationAccuracy(avgAccuracy)

      onLog?.(`Calibration complete for ${successfulResults.length} camera(s)! Avg accuracy: ${(avgAccuracy * 100).toFixed(1)}%`, 'success')

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`Calibration finish failed: ${message}`, 'error')
      return false
    }
  }, [getActiveCameras, onLog])

  /**
   * Cancel calibration
   */
  const cancelCalibration = useCallback(() => {
    setIsCalibrating(false)
    setCurrentStep(0)
    setCurrentPoint(null)
    onLog?.('Calibration cancelled', 'warning')
  }, [onLog])

  /**
   * Get calibration progress
   */
  const getProgress = useCallback(() => {
    if (totalSteps === 0) return 0
    return Math.round((currentStep / totalSteps) * 100)
  }, [currentStep, totalSteps])

  return {
    // State
    isCalibrating,
    currentStep,
    totalSteps,
    currentPoint,
    calibrationComplete,
    calibrationAccuracy,

    // Methods
    startCalibration,
    captureCalibrationSample,
    nextCalibrationPoint,
    finishCalibration,
    cancelCalibration,
    getProgress
  }
}