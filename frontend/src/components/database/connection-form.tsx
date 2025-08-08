'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Database } from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'

export function ConnectionForm() {
  const [connectionString, setConnectionString] = useState('')
  const { 
    setConnectionState, 
    setConnecting, 
    isConnecting, 
    connectionError,
    setTables,
    setLoadingTables
  } = useDatabaseStore()

  // Check existing connection on mount
  const { data: connectionStatus } = useQuery({
    queryKey: ['connection-status'],
    queryFn: apiClient.getConnectionStatus.bind(apiClient),
  })

  // Handle connection status changes
  useEffect(() => {
    if (connectionStatus?.connected && connectionStatus.database_info) {
      setConnectionState(true, connectionStatus.database_info)
      // Load tables if connected
      loadTables()
    }
  }, [connectionStatus])

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: (connStr: string) => apiClient.connectDatabase(connStr),
    onMutate: () => {
      setConnecting(true)
      setConnectionState(false, null, null)
    },
    onSuccess: (data) => {
      if (data.success && data.database_info) {
        setConnectionState(true, data.database_info)
        loadTables()
      } else {
        setConnectionState(false, null, data.message)
      }
    },
    onError: (error: Error) => {
      setConnectionState(false, null, error.message)
    },
  })

  // Load tables after successful connection
  const loadTables = async () => {
    try {
      setLoadingTables(true)
      const tablesData = await apiClient.getTables()
      setTables(tablesData.tables)
    } catch (error) {
      console.error('Failed to load tables:', error)
      setLoadingTables(false)
    }
  }

  const handleConnect = () => {
    if (connectionString.trim()) {
      connectMutation.mutate(connectionString.trim())
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting) {
      handleConnect()
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600">
            <Database className="h-6 w-6 text-white" />
          </div>
        </div>
        <CardTitle>Connect to PostgreSQL</CardTitle>
        <CardDescription>
          Enter your PostgreSQL connection string to get started
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="connection-string">Connection String</Label>
          <Input
            id="connection-string"
            type="password"
            placeholder="postgresql://user:password@host:port/database"
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isConnecting}
          />
        </div>

        {connectionError && (
          <Alert variant="destructive">
            <AlertDescription>{connectionError}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleConnect} 
          className="w-full" 
          disabled={isConnecting || !connectionString.trim()}
        >
          {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>

        <div className="text-xs text-neutral-500 space-y-1">
          <p>Example connection strings:</p>
          <code className="block text-xs bg-neutral-100 p-2 rounded">
            postgresql://username:password@localhost:5432/mydb
          </code>
        </div>
      </CardContent>
    </Card>
  )
}
