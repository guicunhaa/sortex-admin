'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { auth } from '@/lib/firebase'

type VendorRow = {
  id: string
  userId: string
  name: string
  active: boolean
  createdAt: number | null
  updatedAt: number | null
}

export default function VendorsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vendors, setVendors] = useState<VendorRow[]>([])

  async function fetchVendors() {
    setLoading(true)
    setError(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/vendors/list', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_listar_vendedores')
      setVendors(data.vendors as VendorRow[])
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar vendedores')
      setVendors([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchVendors()
  }, [user?.uid])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Vendedores</h1>
        <button
          onClick={fetchVendors}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <div className="text-warning text-sm">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th scope="col" className="py-2 pr-4">Nome</th>
              <th scope="col" className="py-2 pr-4">UID</th>
              <th scope="col" className="py-2 pr-4">Ativo</th>
              <th scope="col" className="py-2 pr-4">Criado</th>
              <th scope="col" className="py-2 pr-4">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-6 text-muted-foreground">Nenhum vendedor encontrado.</td>
              </tr>
            )}
            {vendors.map(v => (
              <tr key={v.id} className="border-b border-border/50">
                <td className="py-2 pr-4">{v.name}</td>
                <td className="py-2 pr-4 font-mono text-xs">{v.userId}</td>
                <td className="py-2 pr-4">{v.active ? 'Sim' : 'Não'}</td>
                <td className="py-2 pr-4">{v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}</td>
                <td className="py-2 pr-4">{v.updatedAt ? new Date(v.updatedAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Dica: após criar um novo vendedor em <strong>Admin &gt; Users</strong>, clique em <em>Atualizar</em> aqui para ver a entrada imediatamente.
      </p>
    </div>
  )
}
