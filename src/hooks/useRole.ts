'use client'
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

export function useRole() {
  const [role, setRole] = useState<'admin'|'vendor'|'unknown'>('unknown')
  useEffect(() => {
    let stop = false
    ;(async () => {
      const u = auth.currentUser
      if (!u) { setRole('unknown'); return }
      const t = await u.getIdTokenResult(true)
      const r = (t.claims as any).role as string | undefined
      if (!stop) setRole(r === 'admin' ? 'admin' : 'vendor')
    })()
    return () => { stop = true }
  }, [auth.currentUser?.uid])
  return role
}
