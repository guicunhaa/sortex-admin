// src/contexts/AuthContext.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

type Ctx = { user: User | null; loading: boolean }
const AuthCtx = createContext<Ctx>({ user: null, loading: true })

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null)
  const [loading, setLoad]  = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, u => {
        setUser(u)
        setLoad(false)
      }),
    []
  )

  return (
    <AuthCtx.Provider value={{ user, loading }}>
      {children}
    </AuthCtx.Provider>
  )
}
export const useAuth = () => useContext(AuthCtx)