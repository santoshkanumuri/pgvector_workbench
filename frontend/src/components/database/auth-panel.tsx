'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { useNotifications } from '@/components/providers/notification-provider'

export function AuthPanel() {
  const { token, user, setToken, setUser, sessions, setSessions, activeSessionId, setActiveSession, disconnect } = useAuthStore()
  const { reset: resetDatabase } = useDatabaseStore()
  const { addNotification } = useNotifications()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)
  const [newDbUrl, setNewDbUrl] = useState('')
  const [newName, setNewName] = useState('')
  const queryClient = useQueryClient()

  const { refetch: refetchSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      if (!token) return { sessions: [] }
      const res = await apiClient.listSessions();
      setSessions(res.sessions)
      return res
    },
    enabled: !!token,
  })

  const authMutation = useMutation({
    mutationFn: async () => {
      setError(null)
      if (mode === 'register') {
        await apiClient.register(username, password)
      }
      const tokenResp = await apiClient.login(username, password)
      setToken(tokenResp.access_token)
      const me = await apiClient.me()
      setUser(me)
      await refetchSessions()
    },
    onError: (e: any) => setError(e.message || 'Auth failed'),
  })

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!newDbUrl.trim() || !newName.trim()) return
      await apiClient.createSession(newName.trim(), newDbUrl.trim())
      setNewDbUrl('')
      setNewName('')
      await refetchSessions()
    },
    onError: (e: any) => setError(e.message || 'Create session failed')
  })

  const connectSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiClient.connectSession(sessionId)
      setActiveSession(sessionId)
    },
    onError: (e: any) => setError(e.message || 'Connect failed')
  })

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === 'login' ? 'Login' : 'Register'}</CardTitle>
          <CardDescription>Access your workspace sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2">
            <Input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
            <Input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={authMutation.isPending} onClick={()=>authMutation.mutate()}>
            {authMutation.isPending ? 'Working...' : (mode==='login' ? 'Login' : 'Register')}
          </Button>
          <Button variant="ghost" type="button" className="w-full" onClick={()=>setMode(mode==='login' ? 'register':'login')}>
            {mode==='login' ? 'Need an account? Register' : 'Have an account? Login'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Select a recent session or create a new one</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="grid gap-3">
          {sessions.map(s => (
            <div key={s.id} className="flex items-center justify-between rounded border p-3 bg-white">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  {s.name}
                  {s.last_db_name && <Badge variant="secondary" className="font-mono">{s.last_db_name}</Badge>}
                </div>
                <div className="text-xs text-neutral-500">Last used: {new Date(s.last_used_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                {activeSessionId===s.id ? (
                  <>
                    <Badge variant="secondary" className="px-3 py-1">Active</Badge>
                    <Button size="sm" variant="outline" onClick={() => {
                      if (confirm('Disconnect from current session?')) {
                        disconnect()
                        resetDatabase()
                        addNotification('Disconnected from session', 'info')
                      }
                    }}>
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="default" disabled={connectSessionMutation.isPending} onClick={()=>connectSessionMutation.mutate(s.id)}>
                    Connect
                  </Button>
                )}
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-sm text-neutral-500">No sessions yet. Create one below.</div>
          )}
        </div>
        <div className="space-y-2 border-t pt-4">
          <h4 className="font-medium text-sm">Create New Session</h4>
          <div className="grid gap-2">
            <Input placeholder="Session name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <Input placeholder="PostgreSQL URL" value={newDbUrl} onChange={e=>setNewDbUrl(e.target.value)} />
            <Button onClick={()=>createSessionMutation.mutate()} disabled={createSessionMutation.isPending || !newDbUrl.trim() || !newName.trim()}>
              {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
