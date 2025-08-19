'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useDatabaseStore } from '@/stores/database'

/**
 * This component handles hydrating Zustand stores that use skipHydration: true
 * It must be included high in the component tree to ensure stores are hydrated
 * before any components that depend on them are rendered.
 */
export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    // Only run in the browser
    if (typeof window === 'undefined') {
      setIsHydrated(true)
      return
    }
    
    // Manually hydrate the stores from localStorage
    const authStoreKey = 'db-look-auth'
    const dbStoreKey = 'db-look-database'
    
    try {
      // Hydrate auth store
      const authData = localStorage.getItem(authStoreKey)
      if (authData) {
        const parsedAuthData = JSON.parse(authData)
        if (parsedAuthData.state) {
          const { token, user, sessions, activeSessionId } = parsedAuthData.state
          
          // Only hydrate if we have a token
          if (token) {
            console.log('Hydrating auth store from localStorage')
            useAuthStore.setState({
              token,
              user,
              sessions: sessions || [],
              activeSessionId: activeSessionId || null
            })
          }
        }
      }
      
      // Hydrate database store
      const dbData = localStorage.getItem(dbStoreKey)
      if (dbData) {
        const parsedDbData = JSON.parse(dbData)
        if (parsedDbData.state) {
          const { selectedCollectionId } = parsedDbData.state
          if (selectedCollectionId) {
            console.log('Hydrating database store from localStorage')
            useDatabaseStore.setState({
              selectedCollectionId
            })
          }
        }
      }
    } catch (error) {
      console.error('Error hydrating stores:', error)
    }
    
    // Mark hydration as complete
    setIsHydrated(true)
  }, [])

  // Don't render children until hydration is complete
  // This prevents components from seeing empty store state
  if (!isHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return <>{children}</>
}