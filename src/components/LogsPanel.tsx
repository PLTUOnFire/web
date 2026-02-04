import './LogsPanel.css'

interface Log {
  id: string
  timestamp: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

interface LogsPanelProps {
  logs: Log[]
}

function LogsPanel({ logs }: LogsPanelProps) {
  return (
    <div className="logs-panel">
      <div className="logs-header">System Logs</div>
      <div className="log-container">
        {logs.map(log => (
          <div key={log.id} className={`log-entry ${log.type}`}>
            <span className="log-timestamp">[{log.timestamp}]</span>
            {log.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default LogsPanel
