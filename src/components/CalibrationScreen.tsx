/**
 * Calibration Component
 * Full-screen calibration interface for eye tracking
 */

import { useEffect, useCallback, useState } from 'react'
import './CalibrationScreen.css'

interface CalibrationPoint {
  step: number
  pose_idx: number
  point_idx: number
  point_name: string
  target_x: number
  target_y: number
  pose_instruction: string
}

interface CalibrationScreenProps {
  currentPoint: CalibrationPoint | null
  currentStep: number
  totalSteps: number
  videoElement: HTMLVideoElement | null
  onCaptureSample: (videoElement: HTMLVideoElement) => Promise<any>
  onNext: () => Promise<boolean>
  onCancel: () => void
  calibrationType: 'standard' | 'multipose'
}

function CalibrationScreen({
  currentPoint,
  currentStep,
  totalSteps,
  videoElement,
  onCaptureSample,
  onNext,
  onCancel,
  calibrationType
}: CalibrationScreenProps) {
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [waitingForSpace, setWaitingForSpace] = useState(true)
  const [currentPose, setCurrentPose] = useState(0)

  // Update current pose when point changes
  useEffect(() => {
    if (currentPoint) {
      setCurrentPose(currentPoint.pose_idx)
      setWaitingForSpace(true)
      setCountdown(null)
    }
  }, [currentPoint])

  // Handle space key to start countdown
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !isCapturing && waitingForSpace) {
      e.preventDefault()
      setWaitingForSpace(false)
      setCountdown(3) // 3 second countdown
    }
  }, [isCapturing, waitingForSpace])

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return

    const timer = setTimeout(() => {
      if (countdown === 1) {
        // Capture sample
        handleCapture()
      } else {
        setCountdown(countdown - 1)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown])

  // Capture calibration sample
  const handleCapture = async () => {
    if (!videoElement || isCapturing) return

    setIsCapturing(true)
    
    const result = await onCaptureSample(videoElement)
    
    if (result) {
      // Wait a moment, then move to next point
      setTimeout(async () => {
        const hasNext = await onNext()
        if (!hasNext) {
          // Calibration complete
          return
        }
        setIsCapturing(false)
        setWaitingForSpace(true)
        setCountdown(null)
      }, 500)
    } else {
      // Failed, reset
      setIsCapturing(false)
      setWaitingForSpace(true)
      setCountdown(null)
    }
  }

  if (!currentPoint) {
    return (
      <div className="calibration-screen">
        <div className="calibration-loading">
          <div className="spinner"></div>
          <p>Loading calibration...</p>
        </div>
      </div>
    )
  }

  const progress = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="calibration-screen">
      {/* Header */}
      <div className="calibration-header">
        <div className="calibration-title">
          Eye Tracking Calibration
          {calibrationType === 'multipose' && ` - Pose ${currentPose + 1}/3`}
        </div>
        <div className="calibration-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">
            {currentStep + 1} / {totalSteps}
          </div>
        </div>
      </div>

      {/* Calibration Point */}
      <div 
        className="calibration-point"
        style={{
          left: `${currentPoint.target_x}px`,
          top: `${currentPoint.target_y}px`
        }}
      >
        <div className={`point-outer ${countdown !== null ? 'pulsing' : ''}`}>
          <div className="point-inner">
            {countdown !== null && countdown > 0 && (
              <div className="countdown-number">{countdown}</div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="calibration-instructions">
        {calibrationType === 'multipose' && (
          <div className="pose-instruction">
            <div className="instruction-icon">
              {currentPose === 0 && '●'}
              {currentPose === 1 && '←'}
              {currentPose === 2 && '→'}
            </div>
            <div className="instruction-text">
              {currentPoint.pose_instruction}
            </div>
          </div>
        )}
        
        <div className="action-instruction">
          {waitingForSpace && (
            <>
              <div className="instruction-main">
                Look at the <span className="highlight">center</span> of the circle
              </div>
              <div className="instruction-sub">
                Press <kbd>SPACE</kbd> when ready
              </div>
            </>
          )}
          {countdown !== null && countdown > 0 && (
            <div className="instruction-main">
              Keep looking at the point...
            </div>
          )}
          {isCapturing && (
            <div className="instruction-main">
              Capturing... <div className="spinner-small"></div>
            </div>
          )}
        </div>
      </div>

      {/* Cancel button */}
      <button 
        className="calibration-cancel"
        onClick={onCancel}
        disabled={isCapturing}
      >
        Cancel Calibration
      </button>

      {/* Debug info */}
      <div className="calibration-debug">
        Point: {currentPoint.point_name} | 
        Position: ({currentPoint.target_x}, {currentPoint.target_y})
      </div>
    </div>
  )
}

export default CalibrationScreen