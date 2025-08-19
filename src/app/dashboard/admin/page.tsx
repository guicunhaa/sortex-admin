'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

export default function AdminDashboardPage() {
  const [userOk, setUserOk] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const user = auth.currentUser
      if (!user) {
        setUserOk(false)
        setLoading(false)
        return
      }

      const token = await user.getIdTokenResult()
      const isAdmin = token.claims?.role === 'admin'
      setUserOk(isAdmin)
      setLoading(false)
    }

    checkAuth()
  }, [])

  if (loading) return <p className="p-4">Carregando painel…</p>
  if (!userOk) return <p className="p-4 text-red-500">Acesso restrito ao administrador.</p>

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Painel Administrativo</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminCard title="📊 Relatórios" href="/dashboard/admin/reports" />
        <AdminCard title="🕓 Histórico de Sorteios" href="/dashboard/admin/history" />
        <AdminCard title="🔒 Encerrar e Sortear" href="/dashboard/admin/close-and-draw" />
        <AdminCard title="🛠️ Ferramentas (em breve)" href="#" disabled />
      </div>
    </div>
  )
}

function AdminCard({
  title,
  href,
  disabled = false,
}: {
  title: string
  href: string
  disabled?: boolean
}) {
  return (
    <div className={`rounded-xl border border-border p-4 shadow-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 transition'}`}>
      {disabled ? (
        <div className="text-lg font-medium">{title}</div>
      ) : (
        <Link href={href} className="text-lg font-medium block">
          {title}
        </Link>
      )}
    </div>
  )
}
