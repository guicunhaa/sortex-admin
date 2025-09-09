'use client'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LogoutButton() {
  const router = useRouter()
  async function handle() {
    await signOut(auth)
    router.replace('/login')
  }
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:brightness-110 text-foreground"
    >
      Sair
    </button>
  )
}
