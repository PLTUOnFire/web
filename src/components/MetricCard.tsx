import './MetricCard.css'

interface MetricCardProps {
  label: string
  value: number
  type: string
}

function MetricCard({ label, value, type }: MetricCardProps) {
  const getBarClass = () => {
    if (value < 30) return 'low'
    if (value < 70) return 'medium'
    return 'high'
  }

  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${type}`}>{value}%</div>
      <div className="metric-bar">
        <div
          className={`metric-bar-fill ${getBarClass()}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export default MetricCard
