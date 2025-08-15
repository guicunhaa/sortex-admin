'use client'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { redirect } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { user } = useAuth()
  if (user) redirect('/dashboard')        // já logado

  async function handleGoogle() {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  return (
    <div className="h-screen flex items-center justify-center">
      <button
        onClick={handleGoogle}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow">
        Entrar com Google
      </button>
    </div>
  )
}