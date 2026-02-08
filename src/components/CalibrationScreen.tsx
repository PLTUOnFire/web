/**
 * Enhanced Calibration Component
 * Step-by-step calibration wizard with intro, instructions, and completion screens
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
  hasActiveCamera: boolean
  onCaptureSample: () => Promise<any>
  onNext: () => Promise<boolean>
  onCancel: () => void
  calibrationType: 'standard' | 'multipose'
}

type CalibrationPhase = 'intro' | 'instructions' | 'calibrating' | 'processing' | 'complete'

function CalibrationScreen({
  currentPoint,
  currentStep,
  totalSteps,
  hasActiveCamera,
  onCaptureSample,
  onNext,
  onCancel,
  calibrationType
}: CalibrationScreenProps) {
  const [phase, setPhase] = useState<CalibrationPhase>('intro')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [waitingForSpace, setWaitingForSpace] = useState(true)
  const [currentPose, setCurrentPose] = useState(0)
  const [introCountdown, setIntroCountdown] = useState(5)
  const [capturedPoints, setCapturedPoints] = useState(0)

  // Update current pose when point changes
  useEffect(() => {
    if (currentPoint && phase === 'calibrating') {
      setCurrentPose(currentPoint.pose_idx)
      setWaitingForSpace(true)
      setCountdown(null)
    }
  }, [currentPoint, phase])

  // Intro countdown
  useEffect(() => {
    if (phase === 'intro' && introCountdown > 0) {
      const timer = setTimeout(() => {
        setIntroCountdown(introCountdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (phase === 'intro' && introCountdown === 0) {
      setPhase('instructions')
    }
  }, [phase, introCountdown])

  // Handle space key to start countdown
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (phase === 'instructions' && e.code === 'Enter') {
      e.preventDefault()
      setPhase('calibrating')
      return
    }

    if (phase === 'calibrating' && e.code === 'Space' && !isCapturing && waitingForSpace) {
      e.preventDefault()
      setWaitingForSpace(false)
      setCountdown(3) // 3 second countdown
    }
  }, [phase, isCapturing, waitingForSpace])

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  // Countdown timer for point capture
  useEffect(() => {
    if (countdown === null || countdown <= 0 || phase !== 'calibrating') return

    const timer = setTimeout(() => {
      if (countdown === 1) {
        handleCapture()
      } else {
        setCountdown(countdown - 1)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, phase])

  // Capture calibration sample from all cameras
  const handleCapture = async () => {
    if (!hasActiveCamera || isCapturing) return

    setIsCapturing(true)

    const result = await onCaptureSample()
    
    if (result) {
      setCapturedPoints(prev => prev + 1)
      
      // Wait a moment, then move to next point
      setTimeout(async () => {
        const hasNext = await onNext()
        if (!hasNext) {
          // Calibration complete
          setPhase('processing')
          setTimeout(() => {
            setPhase('complete')
          }, 2000)
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

  const handleStartCalibration = () => {
    setPhase('calibrating')
  }

  const handleSkipIntro = () => {
    setPhase('instructions')
  }

  // Render intro screen
  if (phase === 'intro') {
    return (
      <div className="calibration-screen">
        <div className="calibration-wizard intro-screen">
          <div className="wizard-content">
            <div className="wizard-icon pulse-icon">👁️</div>
            <h1 className="wizard-title">Eye Tracking Calibration</h1>
            <p className="wizard-subtitle">
              Let's calibrate the eye tracking system to ensure accurate gaze detection
            </p>

            <div className="info-cards">
              <div className="info-card">
                <div className="info-icon">⏱️</div>
                <div className="info-label">Duration</div>
                <div className="info-value">~2 minutes</div>
              </div>
              <div className="info-card">
                <div className="info-icon">📍</div>
                <div className="info-label">Points</div>
                <div className="info-value">{totalSteps} positions</div>
              </div>
              <div className="info-card">
                <div className="info-icon">👤</div>
                <div className="info-label">Poses</div>
                <div className="info-value">3 head positions</div>
              </div>
            </div>

            <div className="countdown-circle">
              <div className="countdown-number-large">{introCountdown}</div>
              <div className="countdown-label">Starting in...</div>
            </div>

            <button className="wizard-btn secondary" onClick={handleSkipIntro}>
              Skip Intro
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render instructions screen
  if (phase === 'instructions') {
    return (
      <div className="calibration-screen">
        <div className="calibration-wizard instructions-screen">
          <div className="wizard-content">
            <h1 className="wizard-title">How It Works</h1>
            <p className="wizard-subtitle">Follow these simple steps for accurate calibration</p>

            <div className="instruction-steps">
              <div className="instruction-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h3>Position Your Head</h3>
                  <p>You'll be asked to hold your head in 3 different positions:</p>
                  <div className="pose-examples">
                    <div className="pose-example">
                      <span className="pose-icon">●</span>
                      <span>Center (looking straight)</span>
                    </div>
                    <div className="pose-example">
                      <span className="pose-icon">←</span>
                      <span>Left (head turned left)</span>
                    </div>
                    <div className="pose-example">
                      <span className="pose-icon">→</span>
                      <span>Right (head turned right)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="instruction-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h3>Follow the Dots</h3>
                  <p>Green circles will appear on screen. Look directly at the center of each circle with your eyes.</p>
                </div>
              </div>

              <div className="instruction-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h3>Press SPACE When Ready</h3>
                  <p>When you're looking at the dot, press <kbd>SPACE</kbd>. A 3-second countdown will start.</p>
                </div>
              </div>

              <div className="instruction-step">
                <div className="step-number">4</div>
                <div className="step-content">
                  <h3>Stay Still During Capture</h3>
                  <p>Keep your eyes on the dot while the system captures your gaze position.</p>
                </div>
              </div>
            </div>

            <div className="tips-box">
              <div className="tips-icon">💡</div>
              <div className="tips-content">
                <strong>Tips for Best Results:</strong>
                <ul>
                  <li>Sit comfortably about 50-70 cm from the screen</li>
                  <li>Ensure good lighting on your face</li>
                  <li>Keep your head as still as possible</li>
                  <li>Follow instructions for each head position</li>
                </ul>
              </div>
            </div>

            <div className="wizard-actions">
              <button className="wizard-btn secondary" onClick={onCancel}>
                Cancel
              </button>
              <button className="wizard-btn primary pulse-btn" onClick={handleStartCalibration}>
                Start Calibration <span className="btn-icon">→</span>
              </button>
            </div>

            <div className="keyboard-hint">
              Press <kbd>ENTER</kbd> to begin
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render processing screen
  if (phase === 'processing') {
    return (
      <div className="calibration-screen">
        <div className="calibration-wizard processing-screen">
          <div className="wizard-content">
            <div className="processing-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
            <h2 className="wizard-title">Processing Calibration Data...</h2>
            <p className="wizard-subtitle">Building your personalized gaze model</p>
            
            <div className="processing-stats">
              <div className="stat-item">
                <div className="stat-value">{capturedPoints}</div>
                <div className="stat-label">Points Captured</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">3</div>
                <div className="stat-label">Poses Completed</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render completion screen
  if (phase === 'complete') {
    return (
      <div className="calibration-screen">
        <div className="calibration-wizard complete-screen">
          <div className="wizard-content">
            <div className="success-icon">
              <div className="success-checkmark">✓</div>
            </div>
            <h1 className="wizard-title success-title">Calibration Complete!</h1>
            <p className="wizard-subtitle">Your eye tracking system is now calibrated and ready to use</p>

            <div className="success-stats">
              <div className="success-stat">
                <div className="success-stat-icon">📊</div>
                <div className="success-stat-content">
                  <div className="success-stat-label">Accuracy</div>
                  <div className="success-stat-value">High Precision</div>
                </div>
              </div>
              <div className="success-stat">
                <div className="success-stat-icon">⚡</div>
                <div className="success-stat-content">
                  <div className="success-stat-label">Status</div>
                  <div className="success-stat-value">Ready to Track</div>
                </div>
              </div>
            </div>

            <div className="next-steps-box">
              <h3>What's Next?</h3>
              <ul>
                <li>✓ Eye tracking is now active</li>
                <li>✓ Start recording to capture gaze data</li>
                <li>✓ Monitor real-time drowsiness alerts</li>
              </ul>
            </div>

            <button className="wizard-btn primary large-btn" onClick={onCancel}>
              Start Eye Tracking <span className="btn-icon">→</span>
            </button>

            <div className="auto-close-hint">
              This window will close automatically in a moment...
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render calibration screen (main capture phase)
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
      {/* Progress Header */}
      <div className="calibration-header">
        <div className="calibration-title">
          Eye Tracking Calibration
          {calibrationType === 'multipose' && (
            <span className="pose-badge">
              Pose {currentPose + 1}/3
            </span>
          )}
        </div>
        <div className="calibration-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">
            Point {currentStep + 1} of {totalSteps}
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
        <div className={`point-outer ${countdown !== null ? 'pulsing' : ''} ${waitingForSpace ? 'ready' : ''}`}>
          <div className="point-inner">
            {countdown !== null && countdown > 0 && (
              <div className="countdown-number">{countdown}</div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions Panel */}
      <div className="calibration-instructions">
        {calibrationType === 'multipose' && (
          <div className="pose-instruction">
            <div className="instruction-icon">
              {currentPose === 0 && <span className="pose-emoji">●</span>}
              {currentPose === 1 && <span className="pose-emoji">←</span>}
              {currentPose === 2 && <span className="pose-emoji">→</span>}
            </div>
            <div className="instruction-text">
              <strong>{currentPoint.pose_instruction}</strong>
            </div>
          </div>
        )}
        
        <div className="action-instruction">
          {waitingForSpace && (
            <>
              <div className="instruction-main">
                Look at the <span className="highlight">center</span> of the green circle
              </div>
              <div className="instruction-sub">
                Press <kbd>SPACE</kbd> when your eyes are focused on the dot
              </div>
            </>
          )}
          {countdown !== null && countdown > 0 && (
            <div className="instruction-main">
              <span className="pulse-text">Keep looking at the point...</span>
            </div>
          )}
          {isCapturing && (
            <div className="instruction-main">
              <div className="capturing-indicator">
                <div className="spinner-small"></div>
                <span>Capturing gaze data...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mini Progress Indicator */}
      <div className="mini-progress">
        <div className="mini-progress-label">Progress</div>
        <div className="mini-progress-dots">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div 
              key={i} 
              className={`mini-dot ${i < currentStep ? 'completed' : i === currentStep ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Cancel Button */}
      <button 
        className="calibration-cancel"
        onClick={onCancel}
        disabled={isCapturing}
      >
        Cancel Calibration
      </button>
    </div>
  )
}

export default CalibrationScreen