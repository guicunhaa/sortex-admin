'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

type Stats = {
  totalGroups: number
  totalClients: number
  totalVendors: number
  totalSales: number
  totalRevenue: number
}

export default function AdminReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser
      if (!user) {
        setError('Usuário não autenticado.')
        setLoading(false)
        return
      }

      try {
        const token = await user.getIdToken()
        const res = await fetch('/api/admin/snapshot', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar dados')
        setStats(data.stats)
      } catch (err: any) {
        setError(err.message ?? 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return <p className="p-4">Carregando relatório…</p>
  if (error) return <p className="p-4 text-red-500">Erro: {error}</p>

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Relatório Administrativo</h1>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Grupos" value={stats.totalGroups} />
          <Card title="Clientes" value={stats.totalClients} />
          <Card title="Vendedores" value={stats.totalVendors} />
          <Card title="Vendas" value={stats.totalSales} />
          <Card title="Total Vendido (R$)" value={stats.totalRevenue.toFixed(2)} />
        </div>
      )}
    </div>
  )
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <p className="text-muted text-sm">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
