import './Header.css'

interface HeaderProps {
  systemActive: boolean
  deviceCount: number
  isRecording: boolean
  recordingSessionId?: string | null
  operatorName: string
  onOperatorNameChange: (name: string) => void
  showNameInput: boolean
  onShowNameInput: () => void
}

function Header({ 
  systemActive, 
  deviceCount,
  isRecording,
  operatorName,
  onOperatorNameChange,
  showNameInput,
  onShowNameInput
}: HeaderProps) {
  const handleNameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('operatorName') as string
    if (name.trim()) {
      onOperatorNameChange(name.trim())
    }
  }

  return (
    <header className="header">
      <div className="header-content">
        <div className="title-section">
          <h1 className="main-title">
            <span className="title-accent">PLTU</span>
            <span className="title-main">Eye Tracking System</span>
          </h1>
          <p className="subtitle">Power Plant Operator Monitoring • Real-time Gaze Detection</p>
        </div>

        <div className="status-section">
          {/* Operator Name */}
          <div className="operator-info">
            <div className="operator-label">Operator:</div>
            {showNameInput ? (
              <form onSubmit={handleNameSubmit} style={{ display: 'inline-flex', gap: '8px' }}>
                <input
                  type="text"
                  name="operatorName"
                  defaultValue={operatorName}
                  placeholder="Enter name"
                  autoFocus
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: '4px',
                    color: 'var(--text-bright)',
                    fontSize: '0.9rem'
                  }}
                />
                <button 
                  type="submit"
                  style={{
                    padding: '4px 12px',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'var(--bg-dark)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Save
                </button>
              </form>
            ) : (
              <div 
                className="operator-name"
                onClick={onShowNameInput}
                title="Click to change operator name"
              >
                {operatorName} ✏️
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="status-indicators">
            <div className={`status-item ${systemActive ? 'active' : ''}`}>
              <span className="status-dot"></span>
              <span className="status-label">System</span>
            </div>
            <div className="status-item info">
              <span className="status-icon">📹</span>
              <span className="status-label">{deviceCount} Devices</span>
            </div>
            {isRecording && (
              <div className="status-item recording">
                <span className="status-dot"></span>
                <span className="status-label">REC</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header