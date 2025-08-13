'use client'

import { Database, Wifi, WifiOff, LogOut, User as UserIcon } from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { useAuthStore } from '@/stores/auth'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useNotifications } from '@/components/providers/notification-provider'

export function Header() {
  const { isConnected, databaseInfo, reset: resetDatabase, selectedTable, selectedCollectionId, tables } = useDatabaseStore()
  const { user, token, logout, disconnect: authDisconnect } = useAuthStore()
  const { addNotification } = useNotifications()
  const selectedCollectionName = useMemo(() => {
    if (!selectedTable || !selectedCollectionId) return null
    const tableEntry = tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name)
    return tableEntry?.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, selectedTable, selectedCollectionId])
  const queryClient = useQueryClient()

  const disconnectMutation = useMutation({
    mutationFn: () => apiClient.disconnectDatabase(),
    onSuccess: () => {
      authDisconnect()
      resetDatabase()
      addNotification('Successfully disconnected from database', 'success')
      // Clear all cached queries
      queryClient.clear()
    },
    onError: (error) => {
      console.error('Failed to disconnect:', error)
      // Even if API call fails, disconnect locally
      authDisconnect()
      resetDatabase()
      addNotification('Disconnected from session (connection may have been lost)', 'info')
      queryClient.clear()
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => {
      logout()
      resetDatabase()
      addNotification('Successfully logged out', 'success')
      queryClient.clear()
    },
    onError: (error) => {
      console.error('Failed to logout:', error)
      // Even if API call fails, logout locally
      logout()
      resetDatabase()
      addNotification('Logged out locally', 'info')
      queryClient.clear()
    },
  })

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logoutMutation.mutate()
    }
  }

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect from the database?')) {
      disconnectMutation.mutate()
    }
  }

  return (
    <header className="border-b border-neutral-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              PGVector Workbench
            </h1>
            <p className="text-sm text-neutral-500">
              PostgreSQL vector database visualization tool
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {user && (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <UserIcon className="h-4 w-4" /> {user.username}
            </div>
          )}
          {isConnected && databaseInfo && (
            <>
              <div className="flex items-center space-x-2 text-sm">
                <Badge variant="secondary" className="font-mono">
                  {databaseInfo.database}
                </Badge>
                {selectedCollectionName && (
                  <>
                    <span className="text-neutral-300">›</span>
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200" title={selectedCollectionName}>
                      {selectedCollectionName}
                    </Badge>
                  </>
                )}
                {databaseInfo.pgvector_installed && (
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    pgvector
                  </Badge>
                )}
              </div>
              
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </>
          )}
          
          <div className="flex items-center space-x-4 text-sm">
            {isConnected ? (
              <div className="flex items-center space-x-2 text-green-600">
                <Wifi className="h-4 w-4" />
                <span>Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-neutral-500">
                <WifiOff className="h-4 w-4" />
                <span>Disconnected</span>
              </div>
            )}
            {token && (
              <Button variant="ghost" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending} className="text-neutral-500 hover:text-red-600">
                <LogOut className="h-4 w-4 mr-1" /> {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
