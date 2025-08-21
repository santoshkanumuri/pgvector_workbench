'use client'

import { useDatabaseStore } from '@/stores/database'
import { useAuthStore } from '@/stores/auth'
import { AuthPanel } from './auth-panel'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import { TablesList } from './tables-list'
import { TableView } from './table-view'
import { Header } from './header'
import { useNotifications } from '@/components/providers/notification-provider'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

export function DatabaseWorkbench() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { isConnected, selectedTable, isLoadingTables, reset: resetDatabase } = useDatabaseStore()
  const { token, activeSessionId } = useAuthStore()
  const { setConnectionState, setTables, setLoadingTables } = useDatabaseStore()
  const { addNotification } = useNotifications()

  // Watch for auth state changes and reset database accordingly
  useEffect(() => {
    // If user logs out (token becomes null), reset database
    if (!token) {
      resetDatabase()
    }
  }, [token, resetDatabase])

  // Watch for session changes and reset database accordingly  
  useEffect(() => {
    // If active session is removed, reset database
    if (token && !activeSessionId) {
      resetDatabase()
    }
  }, [token, activeSessionId, resetDatabase])

  // Listen for session expiry events
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent) => {
      addNotification(event.detail.message, 'warning')
    }

    window.addEventListener('session-expired', handleSessionExpired as EventListener)
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired as EventListener)
    }
  }, [addNotification])

  useEffect(() => {
    const run = async () => {
      if (token && activeSessionId) {
        try {
          console.log('Attempting to validate stored token and restore database connection...', { token: !!token, activeSessionId });
          
          // First validate that our stored token is still valid
          const isValidToken = await apiClient.validateStoredToken();
          if (!isValidToken) {
            console.log('Stored token is invalid, not attempting database connection');
            setLoadingTables(false);
            return;
          }
          
          setLoadingTables(true)
          const status = await apiClient.getConnectionStatus()
          console.log('Connection status:', status);
          
          if (status.connected && status.database_info) {
            setConnectionState(true, status.database_info)
            console.log('Database connected, fetching tables...');
            const tablesResp = await apiClient.getTables()
            console.log('Tables fetched:', tablesResp.tables.length, 'tables');
            setTables(tablesResp.tables)
          } else {
            console.log('Database not connected on startup');
            setConnectionState(false, null, 'Not connected')
            setLoadingTables(false)
          }
        } catch (e) {
          console.error('Error restoring database connection:', e);
          setConnectionState(false, null, `Connection error: ${e instanceof Error ? e.message : 'Unknown error'}`)
          setLoadingTables(false)
        }
      } else {
        console.log('No token or activeSessionId available for connection restoration', { token: !!token, activeSessionId });
      }
    }
    
    // Add a small delay to ensure auth store is fully hydrated
    const timeoutId = setTimeout(run, 100)
    return () => clearTimeout(timeoutId)
  }, [token, activeSessionId, setConnectionState, setLoadingTables, setTables])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header />
      
      <div className="flex flex-1 overflow-hidden min-h-0 pr-[10px]">
        {!token || !activeSessionId ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <AuthPanel />
          </div>
        ) : !isConnected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center text-sm text-neutral-600 max-w-md">
              {isLoadingTables ? (
                <div className="space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p>Restoring database connection...</p>
                </div>
              ) : activeSessionId ? (
                <>
                  <p>You have an active session but are not connected to a database.</p>
                  <p className="mt-2">The connection will be established automatically when you browse tables, or you can select a different session above.</p>
                </>
              ) : (
                <>
                  <p>Select a session above to connect to a database.</p>
                  <p className="mt-2">Use the session list to activate a session or create a new one.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Collapsible Sidebar */}
            <div className={`relative transition-all duration-300 ease-in-out ${
              sidebarCollapsed ? 'w-12' : 'w-72 min-w-64 max-w-80'
            }`}>
              <div className={`h-full border-r border-slate-200 bg-gradient-to-b from-white to-slate-50 overflow-hidden ${
                sidebarCollapsed ? 'w-12' : 'w-full'
              }`}>
                {!sidebarCollapsed && <TablesList />}
                
                {/* Sidebar Toggle Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={`absolute -right-3 top-4 h-6 w-6 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-all duration-200 z-10 ${
                    sidebarCollapsed ? 'rotate-180' : ''
                  }`}
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                
                {/* Collapsed Sidebar Content */}
                {sidebarCollapsed && (
                  <div className="h-full flex flex-col items-center py-4 space-y-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">DB</span>
                    </div>
                    <div className="w-0.5 h-8 bg-gradient-to-b from-slate-200 to-slate-300"></div>
                    <div className="text-xs text-slate-500 text-center px-1 leading-tight">
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 bg-gradient-to-br from-slate-50 to-white overflow-hidden min-w-0">
              {selectedTable ? (
                <TableView />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <span className="text-white text-xl font-bold">DB</span>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      Select a Collection
                    </h3>
                    <p className="text-sm text-slate-600 max-w-md">
                      Choose a table from the sidebar to view its vector data and explore your database
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
