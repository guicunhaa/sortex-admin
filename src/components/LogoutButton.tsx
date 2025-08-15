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
      className="rounded-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition"
    >
      Sair
    </button>
  )
}
