import './Header.css'

interface HeaderProps {
  systemActive: boolean
  wsConnected: boolean
  mlActive: boolean
  deviceCount?: number
}

function Header({ systemActive, wsConnected, mlActive, deviceCount }: HeaderProps) {
  return (
    <header className="header">
      <div className="logo-section">
        <h1>PLTU MONITORING SYSTEM🔥</h1>
        <div className="tagline">Multi-Camera ML Monitoring System</div>
      </div>
      <div className="status-bar">
        <div className="status-item">
          <div className={`status-dot ${systemActive ? 'active' : 'inactive'}`} />
          <span>System</span>
        </div>
        <div className="status-item">
          <div className={`status-dot ${wsConnected ? 'active' : 'inactive'}`} />
          <span>WebSocket</span>
        </div>
        <div className="status-item">
          <div className={`status-dot ${mlActive ? 'active' : 'inactive'}`} />
          <span>ML Worker</span>
        </div>
        {deviceCount !== undefined && (
          <div className="status-item">
            <span>📹 {deviceCount} Device{deviceCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
