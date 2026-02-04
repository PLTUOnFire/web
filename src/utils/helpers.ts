// Utility functions for the Vision Nexus application

/**
 * Format timestamp to readable string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted time string
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Get metric level classification
 * @param {number} value - Metric value (0-100)
 * @returns {string} Level: 'low', 'medium', or 'high'
 */
export function getMetricLevel(value: number): 'low' | 'medium' | 'high' {
  if (value < 30) return 'low'
  if (value < 70) return 'medium'
  return 'high'
}

/**
 * Convert normalized coordinates to pixel coordinates
 * @param {number} normalized - Normalized coordinate (0-1)
 * @param {number} dimension - Canvas dimension (width or height)
 * @returns {number} Pixel coordinate
 */
export function toPixel(normalized: number, dimension: number): number {
  return normalized * dimension
}

/**
 * Convert pixel coordinates to normalized coordinates
 * @param {number} pixel - Pixel coordinate
 * @param {number} dimension - Canvas dimension (width or height)
 * @returns {number} Normalized coordinate (0-1)
 */
export function toNormalized(pixel: number, dimension: number): number {
  return pixel / dimension
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Throttle limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number) {
  let inThrottle: boolean
  
  return function throttledFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Get color based on metric value
 * @param {number} value - Metric value (0-100)
 * @returns {string} Color hex code
 */
export function getMetricColor(value: number): string {
  if (value < 30) return '#00ff88' // Green
  if (value < 70) return '#ffaa00' // Orange
  return '#ff3333' // Red
}

/**
 * Calculate percentage
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(current: number, total: number): number {
  return total === 0 ? 0 : Math.round((current / total) * 100)
}
