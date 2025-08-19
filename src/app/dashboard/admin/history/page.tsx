'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { format } from 'date-fns'

type GroupInfo = {
  id: string
  label?: string | null
  endsAt?: { seconds: number } | null
  drawnNumber?: number | null
  totalSold?: number | null
  totalNumbers?: number
}

export default function AdminHistoryPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      const user = auth.currentUser
      if (!user) {
        setError('Usuário não autenticado.')
        setLoading(false)
        return
      }

      try {
        const token = await user.getIdToken()
        const res = await fetch('/api/groups/history', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || 'erro_backend')
        setGroups(data.groups)
      } catch (err: any) {
        setError(err.message ?? 'erro_desconhecido')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) return <p className="p-4">Carregando histórico…</p>
  if (error) return <p className="p-4 text-red-500">Erro: {error}</p>

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Histórico de Grupos Fechados</h1>
      {groups.length === 0 && <p>Nenhum grupo encontrado.</p>}
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.id} className="border rounded-xl p-4 bg-white shadow-sm">
            <p><strong>ID:</strong> {g.id}</p>
            <p><strong>Nome:</strong> {g.label ?? '(sem rótulo)'}</p>
            <p><strong>Sorteado:</strong> {g.drawnNumber ?? '—'}</p>
            <p><strong>Encerrado em:</strong> {g.endsAt ? format(new Date(g.endsAt.seconds * 1000), 'dd/MM/yyyy HH:mm') : '—'}</p>
            <p><strong>Vendidos:</strong> {g.totalSold ?? 0} / {g.totalNumbers ?? 71}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
