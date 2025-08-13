import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  created_at: string
  last_login_at?: string | null
}

interface SessionMeta {
  id: string
  name: string
  created_at: string
  last_used_at: string
  last_db_name?: string | null
  last_db_version?: string | null
}

interface AuthState {
  token: string | null
  user: User | null
  sessions: SessionMeta[]
  activeSessionId: string | null
  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  setSessions: (sessions: SessionMeta[]) => void
  setActiveSession: (id: string | null) => void
  logout: () => void
  disconnect: () => void
  reset: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      sessions: [],
      activeSessionId: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setSessions: (sessions) => set({ sessions }),
      setActiveSession: (id) => set({ activeSessionId: id }),
      logout: () => {
        console.log('Auth store: logout() called');
        set({ token: null, user: null, sessions: [], activeSessionId: null });
        // Don't trigger database reset from here - let components handle it
      },
      disconnect: () => {
        console.log('Auth store: disconnect() called');
        set({ activeSessionId: null });
        // Don't trigger database reset from here - let components handle it
      },
      reset: () => {
        console.log('Auth store: reset() called');
        set({ token: null, user: null, sessions: [], activeSessionId: null });
      },
    }),
    {
      name: 'db-look-auth',
      skipHydration: true,
    }
  )
)
