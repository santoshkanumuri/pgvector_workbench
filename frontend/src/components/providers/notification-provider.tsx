'use client'

import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
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

const notificationIcons = {
  success: <CheckCircle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
}

const notificationStyles = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
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
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
          {notifications.map((notification, index) => (
            <div
              key={notification.id}
              className="pointer-events-auto animate-in slide-in-from-right-full duration-300"
              style={{
                animationDelay: `${index * 50}ms`
              }}
            >
              <Alert 
                variant={notification.type === 'error' ? 'destructive' : 'default'} 
                className={`pr-10 shadow-lg border-2 ${notificationStyles[notification.type]}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {notificationIcons[notification.type]}
                  </div>
                  <AlertDescription className="flex-1">
                    {notification.message}
                  </AlertDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-white/50"
                  onClick={() => removeNotification(notification.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Alert>
            </div>
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  )
}
