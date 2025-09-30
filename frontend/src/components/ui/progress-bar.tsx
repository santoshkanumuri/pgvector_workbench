'use client'

import { useEffect, useState } from 'react'

interface ProgressBarProps {
  loading: boolean
}

/**
 * A top-loading progress bar that animates when loading is true
 */
export function ProgressBar({ loading }: ProgressBarProps) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (loading) {
      setVisible(true)
      setProgress(0)
      
      // Simulate progress
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval)
            return 90
          }
          return prev + Math.random() * 10
        })
      }, 200)

      return () => clearInterval(interval)
    } else {
      // Complete the progress
      setProgress(100)
      
      // Hide after animation completes
      const timeout = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 500)
      
      return () => clearTimeout(timeout)
    }
  }, [loading])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
