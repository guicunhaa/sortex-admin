'use client'

import { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { db } from '@/lib/firebase'
import Label from '@/components/ui/form/Label'
import Select from '@/components/ui/form/Select'
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore'

type Sale = {
  id: string
  number: string
  vendorId: string
  vendorName?: string
  clientId?: string
  clientName?: string
  total: number
  status: 'pago' | 'pendente'
  region?: string
  date: Date
}

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const PAGE_SIZE = 30

type VendorOpt = { id: string; name: string }
const NUMBER_OPTS = Array.from({ length: 71 }, (_, i) => String(i).padStart(2, '0'))

export default function SalesPage() {
  const { user } = useAuth()
  const role = useRole()

  // filtros ativos
  const [numberFilter, setNumberFilter] = useState<string>('') // "00" .. "70" ou ""
  const [vendor, setVendor] = useState<string>('') // admin escolhe; vendedor ignora

  // suporte à UI
  const [vendorOpts, setVendorOpts] = useState<VendorOpt[]>([])
  const [clientNames, setClientNames] = useState<Record<string, string>>({})

  // dados carregados
  const [rows, setRows] = useState<Sale[]>([])
  const [cursor, setCursor] = useState<DocumentSnapshot | undefined>()
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  // ===== Helpers =====

  function norm2(n: any) {
    return String(n ?? '').padStart(2, '0')
  }

  // Filtro visual sempre aplicado na renderização (fallback mesmo que a query já filtre)
  const visibleRows = useMemo(() => {
    if (!numberFilter) return rows
    return rows.filter(r => norm2(r.number) === numberFilter)
  }, [rows, numberFilter])

  // KPIs sobre os dados visíveis
  const kpis = useMemo(() => {
    const total = visibleRows.reduce((s, r) => s + (r.total || 0), 0)
    const pagos = visibleRows
      .filter(r => r.status === 'pago')
      .reduce((s, r) => s + (r.total || 0), 0)
    const pend = total - pagos
    return { total, pagos, pend }
  }, [visibleRows])

  async function loadVendors() {
    if (role !== 'admin' || !user) return
    try {
      const token = await user.getIdToken?.()
      const res = await fetch('/api/vendors/list', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      })
      if (res.ok) {
        const j = await res.json()
        if (Array.isArray(j?.vendors)) {
          const opts: VendorOpt[] = j.vendors.map((v: any) => ({
            id: v.uid || v.id,
            name: v.name || v.email || v.uid || v.id,
          }))
          setVendorOpts(opts)
          return
        }
      }
    } catch {
      /* silencioso */
    }
  }

  // ===== Carregadores =====

  async function loadFirst() {
    if (!user) return
    setLoading(true)

    const col = collection(db, 'sales')
    const clauses: any[] = [orderBy('date', 'desc'), limit(PAGE_SIZE)]

    // vendedor comum só vê dele
    if (role !== 'admin' && user?.uid) clauses.unshift(where('vendorId', '==', user.uid))
    // admin pode filtrar um vendedor específico
    if (role === 'admin' && vendor) clauses.unshift(where('vendorId', '==', vendor))
    // número (string "00".."70")
    if (numberFilter) clauses.unshift(where('number', '==', numberFilter))

    const snap = await getDocs(query(col, ...clauses))
    const docs = snap.docs

    setRows(
      docs.map(d => {
        const s: any = d.data()
        return {
          id: d.id,
          number: s.number ?? '',
          vendorId: s.vendorId ?? '',
          vendorName: s.vendorName ?? '',
          clientId: s.clientId ?? '',
          clientName: s.clientName ?? '',
          total: Number(s.total ?? 0),
          status: (s.status as 'pago' | 'pendente') ?? 'pendente',
          region: s.region ?? '',
          date: s.date?.toDate?.() ?? new Date(0),
        }
      }),
    )

    // fallback: preencher select de vendedores com o que veio das vendas, caso API não responda
    if (role === 'admin' && vendorOpts.length === 0) {
      const uniq = new Map<string, string>()
      docs.forEach(d => {
        const s: any = d.data()
        const id = s.vendorId
        if (id) uniq.set(id, s.vendorName || id)
      })
      if (uniq.size) setVendorOpts(Array.from(uniq, ([id, name]) => ({ id, name })))
    }

    setCursor(docs.length ? docs[docs.length - 1] : undefined)
    setHasMore(docs.length === PAGE_SIZE)
    setLoading(false)
  }

  async function loadMore() {
    if (!cursor || !user) return
    setLoading(true)

    const col = collection(db, 'sales')
    const clauses: any[] = [orderBy('date', 'desc'), startAfter(cursor), limit(PAGE_SIZE)]

    if (role !== 'admin' && user?.uid) clauses.unshift(where('vendorId', '==', user.uid))
    if (role === 'admin' && vendor) clauses.unshift(where('vendorId', '==', vendor))
    if (numberFilter) clauses.unshift(where('number', '==', numberFilter))

    const snap = await getDocs(query(col, ...clauses))
    const docs = snap.docs

    setRows(prev => [
      ...prev,
      ...docs.map(d => {
        const s: any = d.data()
        return {
          id: d.id,
          number: s.number ?? '',
          vendorId: s.vendorId ?? '',
          vendorName: s.vendorName ?? '',
          clientId: s.clientId ?? '',
          clientName: s.clientName ?? '',
          total: Number(s.total ?? 0),
          status: (s.status as 'pago' | 'pendente') ?? 'pendente',
          region: s.region ?? '',
          date: s.date?.toDate?.() ?? new Date(0),
        }
      }),
    ])

    if (role === 'admin' && vendorOpts.length === 0) {
      const uniq = new Map<string, string>()
      docs.forEach(d => {
        const s: any = d.data()
        const id = s.vendorId
        if (id) uniq.set(id, s.vendorName || id)
      })
      if (uniq.size) setVendorOpts(Array.from(uniq, ([id, name]) => ({ id, name })))
    }

    setCursor(docs.length ? docs[docs.length - 1] : undefined)
    setHasMore(docs.length === PAGE_SIZE)
    setLoading(false)
  }

  // recarrega quando filtros mudam
  useEffect(() => {
    loadFirst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor, numberFilter, role, user?.uid])

  useEffect(() => {
    loadVendors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.uid])

  // completa nomes de clientes ausentes
  useEffect(() => {
    const missing = Array.from(
      new Set(
        visibleRows
          .filter(r => r.clientId && !r.clientName && !clientNames[r.clientId!])
          .map(r => r.clientId!),
      ),
    )
    if (!missing.length) return
    ;(async () => {
      const updates: Record<string, string> = {}
      for (const id of missing.slice(0, 25)) {
        try {
          const snap = await getDoc(doc(db, 'clients', id))
          const data: any = snap.exists() ? snap.data() : null
          const name = data?.name || data?.nome || data?.displayName || ''
          if (name) updates[id] = name
        } catch {
          /* noop */
        }
      }
      if (Object.keys(updates).length) setClientNames(prev => ({ ...prev, ...updates }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows])

  return (
    <div className="min-h-screen">
      <Sidebar />

      <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6">
        {/* Header + filtros */}
        <GlassCard className="p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
            <div>
              <h1 className="text-foreground text-lg font-semibold">Vendas</h1>
              <p className="text-muted text-sm">Histórico completo com filtros.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label>Número</Label>
                <Select
                  value={numberFilter}
                  onChange={e => setNumberFilter(e.target.value)}
                  className="w-28"
                >
                  <option value="">Todos</option>
                  {NUMBER_OPTS.map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>

              {role === 'admin' && (
                <div>
                  <Label>Vendedor</Label>
                  <Select
                    value={vendor}
                    onChange={e => setVendor(e.target.value)}
                    className="w-56"
                  >
                    <option value="">Todos</option>
                    {vendorOpts.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name || v.id}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <button
                onClick={loadFirst}
                className="self-end rounded px-3 py-2 border border-border bg-surface hover:brightness-110 text-foreground text-sm"
              >
                Aplicar
              </button>
            </div>
          </div>
        </GlassCard>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <GlassCard className="p-4">
            <div className="text-muted text-xs">Total (carregado)</div>
            <div className="text-2xl font-semibold mt-1">{CURRENCY.format(kpis.total)}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-muted text-xs">Pago</div>
            <div className="text-2xl font-semibold mt-1">{CURRENCY.format(kpis.pagos)}</div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-muted text-xs">Pendente</div>
            <div className="text-2xl font-semibold mt-1">{CURRENCY.format(kpis.pend)}</div>
          </GlassCard>
        </div>

        {/* Tabela */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-w-full" aria-busy={loading}>
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-[960px] w-full text-sm border-collapse">
                <caption className="sr-only">
                  Tabela de vendas com filtros e paginação
                </caption>
                <thead className="bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Data
                    </th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Número
                    </th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Vendedor
                    </th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Cliente
                    </th>
                    <th className="text-right font-medium text-muted px-4 py-3 border-b border-border">
                      Total
                    </th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Status
                    </th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">
                      Região
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-muted">
                        Carregando…
                      </td>
                    </tr>
                  )}

                  {visibleRows.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-surface">
                      <td className="px-4 py-3">{DATE.format(s.date)}</td>
                      <td className="px-4 py-3">{norm2(s.number)}</td>
                      <td className="px-4 py-3">{s.vendorName || s.vendorId}</td>
                      <td className="px-4 py-3">
                        {s.clientName ||
                          (s.clientId && clientNames[s.clientId]) ||
                          s.clientId ||
                          '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {CURRENCY.format(s.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'px-2 py-1 rounded text-xs border ' +
                            (s.status === 'pago'
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-warning/10 text-warning border-warning/30')
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{s.region || '-'}</td>
                    </tr>
                  ))}

                  {!loading && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        Sem registros neste filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-xs text-muted" aria-live="polite">
              {visibleRows.length} registro(s)
            </div>
            <button
              onClick={loadMore}
              disabled={!hasMore || loading}
              aria-label={loading ? 'Carregando' : hasMore ? 'Carregar mais registros' : 'Fim da lista'}
              className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground disabled:opacity-50"
            >
              {loading ? 'Carregando…' : hasMore ? 'Carregar mais' : 'Fim'}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
