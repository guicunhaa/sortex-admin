'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, getIdTokenResult, User as FirebaseUser } from 'firebase/auth'
import { auth } from '@/lib/firebase'

type User = {
  uid: string
  email: string | null
  displayName: string | null
  role: 'admin' | 'vendor' | null
}

type Ctx = { user: User | null; loading: boolean }
const AuthCtx = createContext<Ctx>({ user: null, loading: true })

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null)
  const [loading, setLoad]  = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null)
        setLoad(false)
        return
      }

      try {
        const token = await getIdTokenResult(fbUser)
        const role = token.claims.role as 'admin' | 'vendor' | null

        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName ?? fbUser.email,
          role: role ?? null,
        })
      } catch (e) {
        console.error('Erro ao obter claims:', e)
        setUser(null)
      } finally {
        setLoad(false)
      }
    })

    return () => unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{ user, loading }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
