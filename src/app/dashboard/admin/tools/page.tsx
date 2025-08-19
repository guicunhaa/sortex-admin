'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

export default function AdminToolsPage() {
  const [userOk, setUserOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

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

  if (loading) return <p className="p-4">Carregando ferramentas…</p>
  if (!userOk) return <p className="p-4 text-red-500">Acesso restrito ao administrador.</p>

  const runTool = async (url: string, label: string) => {
    setMsg(`Executando: ${label}...`)
    const user = auth.currentUser
    if (!user) return setMsg('Usuário não autenticado.')
    try {
      const token = await user.getIdToken()
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha')
      setMsg(`✅ ${label} executado com sucesso.`)
    } catch (err: any) {
      setMsg(`Erro ao executar ${label}: ${err.message ?? 'Erro desconhecido'}`)
    }
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">Ferramentas Administrativas</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminToolButton label="Liberar Reservas Vencidas" onClick={() => runTool('/api/admin/expire-reservations', 'Liberar Reservas')} />
        <AdminToolButton label="Seed de Números (0..69)" onClick={() => runTool('/api/admin/seed-numbers', 'Seed de Números')} />
        <AdminToolButton label="Snapshot de Vendas" onClick={() => runTool('/api/admin/snapshot', 'Snapshot')} />
      </div>

      {msg && <p className="text-sm text-blue-600">{msg}</p>}
    </div>
  )
}

function AdminToolButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border p-4 bg-white shadow hover:bg-gray-50 transition"
    >
      <span className="font-medium">{label}</span>
    </button>
  )
}
