'use client'

import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  message: string
  type: 'info' | 'error' | 'success' | 'warning'
}

interface NotificationContextType {
  notifications: Notification[]
  addNotification: (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void
  removeNotification: (id: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [idCounter, setIdCounter] = useState(0)
  const [mounted, setMounted] = useState(false)

  // Ensure notifications only render after hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  const addNotification = (message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    // Use a counter-based ID instead of Math.random() to avoid hydration issues
    const id = `notification-${Date.now()}-${idCounter}`
    setIdCounter(prev => prev + 1)
    setNotifications(prev => [...prev, { id, message, type }])
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      
      {/* Notification Container - Only render after hydration */}
      {mounted && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {notifications.map(notification => (
            <Alert key={notification.id} variant={notification.type === 'error' ? 'destructive' : 'default'} className="pr-10">
              <AlertDescription>{notification.message}</AlertDescription>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0"
                onClick={() => removeNotification(notification.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Alert>
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  )
}
