/**
 * Hook for Eye Tracking Calibration
 * Handles multi-pose calibration process with step-by-step flow
 */

import { useState, useCallback, useRef } from 'react'
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

interface CalibrationHookProps {
  sessionId: string
  cameraId: string
  onLog?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

export function useCalibration({ sessionId, cameraId, onLog }: CalibrationHookProps) {
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [totalSteps, setTotalSteps] = useState(0)
  const [currentPoint, setCurrentPoint] = useState<CalibrationPoint | null>(null)
  const [calibrationType, setCalibrationType] = useState<'standard' | 'multipose'>('multipose')
  const [calibrationComplete, setCalibrationComplete] = useState(false)
  const [calibrationAccuracy, setCalibrationAccuracy] = useState(0)
  
  const videoRefForCalibration = useRef<HTMLVideoElement | null>(null)

  /**
   * Start calibration process for specific camera
   */
  const startCalibration = useCallback(async (type: 'standard' | 'multipose' = 'multipose') => {
    try {
      onLog?.(`${cameraId}: Starting eye tracking calibration...`, 'info')
      
      const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationStart}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          camera_id: cameraId,
          calibration_type: type
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to start calibration: ${response.statusText}`)
      }

      const data = await response.json()
      
      setIsCalibrating(true)
      setCalibrationType(type)
      setTotalSteps(data.total_steps)
      setCurrentStep(0)
      setCalibrationComplete(false)
      
      // Get first point
      await loadCalibrationPoint(0)
      
      onLog?.(`${cameraId}: Calibration started: ${data.total_steps} points (${type})`, 'success')
      
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`${cameraId}: Calibration start failed: ${message}`, 'error')
      return false
    }
  }, [sessionId, cameraId, onLog])

  /**
   * Load calibration point data for specific step (per-camera)
   */
  const loadCalibrationPoint = useCallback(async (step: number) => {
    try {
      // Backend format: /calibration/point/{camera_id}/{session_id}/{step}
      const response = await fetch(
        `${config.apiUrl}${config.endpoints.calibrationPoint}/${cameraId}/${sessionId}/${step}`
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
      onLog?.(`${cameraId}: Failed to load calibration point: ${message}`, 'error')
      return null
    }
  }, [sessionId, cameraId, onLog])

  /**
   * Capture and send calibration sample for specific camera
   */
  const captureCalibrationSample = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      if (!currentPoint) {
        throw new Error('No calibration point loaded')
      }

      // Capture frame from video
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }
      
      ctx.drawImage(videoElement, 0, 0)
      const frameBase64 = canvas.toDataURL('image/jpeg', 0.9)

      // Send to backend with camera_id
      const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationSample}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          camera_id: cameraId,
          step: currentStep,
          frame_base64: frameBase64
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add calibration sample')
      }

      const result = await response.json()
      
      if (result.error) {
        throw new Error(result.error)
      }

      onLog?.(`${cameraId}: Point ${currentStep + 1}/${totalSteps} captured`, 'success')
      
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`${cameraId}: Sample capture failed: ${message}`, 'error')
      return null
    }
  }, [sessionId, cameraId, currentStep, currentPoint, totalSteps, onLog])

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
   * Finish calibration and build model for specific camera
   */
  const finishCalibration = useCallback(async () => {
    try {
      onLog?.(`${cameraId}: Finalizing calibration model...`, 'info')
      
      const response = await fetch(`${config.apiUrl}${config.endpoints.calibrationFinish}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          camera_id: cameraId
        })
      })

      if (!response.ok) {
        throw new Error('Failed to finish calibration')
      }

      const result = await response.json()
      
      if (result.error) {
        throw new Error(result.error)
      }

      setIsCalibrating(false)
      setCalibrationComplete(true)
      setCalibrationAccuracy(result.accuracy || 0)
      
      onLog?.(
        `${cameraId}: Calibration complete! Accuracy: ${(result.accuracy * 100).toFixed(1)}%`,
        'success'
      )
      
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onLog?.(`${cameraId}: Calibration finish failed: ${message}`, 'error')
      return false
    }
  }, [sessionId, cameraId, onLog])

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
    calibrationType,
    calibrationComplete,
    calibrationAccuracy,
    
    // Methods
    startCalibration,
    captureCalibrationSample,
    nextCalibrationPoint,
    finishCalibration,
    cancelCalibration,
    getProgress,
    
    // Refs
    videoRefForCalibration
  }
}