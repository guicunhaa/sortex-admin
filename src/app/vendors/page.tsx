'use client'

import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { auth } from '@/lib/firebase'
import { createPortal } from 'react-dom'

type VendorRow = {
  id: string
  userId: string
  name: string
  active: boolean
  createdAt: number | null
  updatedAt: number | null
}

type VendorStats = {
  createdGroups: { id: string; label: string | null }[]
  soldGroups: { id: string; label: string | null }[]
  participating: { id: string; label: string | null }[]
}

function PopoverPortal({
  open, anchor, onClose, children, width = 448,
}: {
  open: boolean
  anchor: HTMLElement | null
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const r = anchor.getBoundingClientRect()
    const margin = 8
    const left = Math.min(
      Math.max(margin, r.right - width),
      window.innerWidth - width - margin
    )
    const top = Math.min(r.bottom + margin, window.innerHeight - margin)
    setPos({ top, left })
  }, [open, anchor, width])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onClick = (e: MouseEvent) => {
      if (anchor && (e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [open, anchor, onClose])

  if (!open) return null
  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
      className="z-[10000] rounded-2xl border border-border bg-background p-4 shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
    >
      {children}
    </div>,
    document.body
  )
}

export default function VendorsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vendors, setVendors] = useState<VendorRow[]>([])

  // Estado para o popover "Mais informações"
  const [openInfo, setOpenInfo] = useState<string | null>(null) // vendorId aberto
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [stats, setStats] = useState<Record<string, VendorStats>>({})
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

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

  async function fetchStats(vendorId: string) {
    setLoadingInfo(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/vendors/stats?vendorId=${encodeURIComponent(vendorId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_stats')
      setStats((prev) => ({
        ...prev,
        [vendorId]: {
          createdGroups: data.createdGroups ?? [],
          soldGroups: data.soldGroups ?? [],
          participating: data.participating ?? [],
        },
      }))
    } catch (e) {
      // mostra vazio com mensagem genérica no balão
      setStats((prev) => ({
        ...prev,
        [vendorId]: { createdGroups: [], soldGroups: [], participating: [] },
      }))
    } finally {
      setLoadingInfo(false)
    }
  }

  function toggleInfo(vendorId: string) {
    if (openInfo === vendorId) {
      setOpenInfo(null)
      return
    }
    setOpenInfo(vendorId)
    if (!stats[vendorId]) {
      fetchStats(vendorId)
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

      {error && <div className="text-warning text-sm">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th scope="col" className="py-2 pr-4">Nome</th>
              <th scope="col" className="py-2 pr-4">UID</th>
              <th scope="col" className="py-2 pr-4">Ativo</th>
              <th scope="col" className="py-2 pr-4">Criado</th>
              <th scope="col" className="py-2 pr-4">Atualizado</th>
              <th scope="col" className="py-2 pr-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-6 text-muted-foreground">Nenhum vendedor encontrado.</td>
              </tr>
            )}
            {vendors.map((v) => {
              const isOpen = openInfo === v.userId
              const s = stats[v.userId]
              return (
                <tr key={v.id} className="border-b border-border/50">
                  <td className="py-2 pr-4">{v.name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{v.userId}</td>
                  <td className="py-2 pr-4">{v.active ? 'Sim' : 'Não'}</td>
                  <td className="py-2 pr-4">{v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}</td>
                  <td className="py-2 pr-4">{v.updatedAt ? new Date(v.updatedAt).toLocaleString() : '-'}</td>
                  <td className="py-2 pl-2 pr-2 relative">
                    <div className="flex justify-end">
                      <button
                        ref={el => { btnRefs.current[v.userId] = el }}
                        onClick={() => toggleInfo(v.userId)}
                        className="px-2 py-1 text-sm rounded-lg border border-border bg-surface hover:brightness-110"
                      >
                        Mais informações
                      </button>
                    </div>
                  </td>
                  <PopoverPortal
                    open={isOpen}
                    anchor={btnRefs.current[v.userId] || null}
                    onClose={() => setOpenInfo(null)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-medium">Resumo do vendedor</div>
                      <button
                        onClick={() => setOpenInfo(null)}
                        className="px-2 py-1 text-xs rounded-md hover:bg-muted"
                        aria-label="Fechar"
                      >
                        ×
                      </button>
                    </div>

                    {loadingInfo && <div className="text-sm text-muted-foreground mt-2">Carregando…</div>}
                    {!loadingInfo && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <div className="font-medium text-xs mb-1">Grupos criados</div>
                          <ul className="text-xs list-disc list-inside space-y-0.5">
                            {s?.createdGroups?.length ? (
                              s.createdGroups.map((g) => (
                                <li key={g.id}>{g.label || g.id}</li>
                              ))
                            ) : (
                              <li className="text-muted-foreground">Nenhum</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-medium text-xs mb-1">Grupos com venda</div>
                          <ul className="text-xs list-disc list-inside space-y-0.5">
                            {s?.soldGroups?.length ? (
                              s.soldGroups.map((g) => (
                                <li key={g.id}>{g.label || g.id}</li>
                              ))
                            ) : (
                              <li className="text-muted-foreground">Nenhum</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-medium text-xs mb-1">Participa</div>
                          <ul className="text-xs list-disc list-inside space-y-0.5">
                            {s?.participating?.length ? (
                              s.participating.map((g) => (
                                <li key={g.id}>{g.label || g.id}</li>
                              ))
                            ) : (
                              <li className="text-muted-foreground">Nenhum</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                  </PopoverPortal>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Dica: após criar um novo vendedor em <strong>Admin &gt; Users</strong>, clique em <em>Atualizar</em> aqui para ver a entrada imediatamente.
      </p>
    </div>
  )
}
