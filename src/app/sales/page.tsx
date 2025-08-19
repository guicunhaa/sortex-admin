'use client'
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, getDoc, doc, limit, orderBy, query, startAfter, where, type DocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import Label from '@/components/ui/form/Label'
import Select from '@/components/ui/form/Select'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'

type Row = {
  id: string
  date: Date
  number: number
  groupId: string
  groupName?: string
  vendorName: string
  clientName: string
  total: number
  status: 'pago' | 'pendente'
  region: string
}

type Filters = { number?: number; vendor?: string }

const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PAGE_SIZE = 20

function toRow(d: DocumentData): Row {
  const data = d.data()
  // Garanta número numérico
  const rawNum = data.number
  const num = typeof rawNum === 'number' ? rawNum : Number(String(rawNum || '0'))
  return {
    id: d.id,
    date: (data.date?.toDate?.() ?? new Date(data.date ?? 0)) as Date,
    number: Number.isFinite(num) ? num : 0,
    groupId: data.groupId ?? '',
    groupName: data.groupName ?? data.groupLabel ?? data.group_label ?? '',
    vendorName: data.vendorName ?? '',
    clientName: data.clientName ?? data.client ?? '',
    total: Number(data.total ?? 0),
    status: (data.status ?? 'pendente') as Row['status'],
    region: data.region ?? '',
  }
}

export default function SalesPage() {
  const { user } = useAuth()
  const role = useRole()

  const [filters, setFilters] = useState<Filters>({})
  const [rows, setRows] = useState<Row[]>([])
  const [cursor, setCursor] = useState<DocumentSnapshot | undefined>()
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})

  // Vendors dropdown
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, 'vendors'), orderBy('name', 'asc')))
      setVendors(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name ?? d.id })))
    })()
  }, [])

  // Busca nomes de grupos que faltam
  useEffect(() => {
    const missing = Array.from(new Set(rows.filter(r => r.groupId && !r.groupName && !groupNames[r.groupId]).map(r => r.groupId)))
    if (!missing.length) return
    ;(async () => {
      const up: Record<string, string> = {}
      for (const gid of missing.slice(0, 25)) {
        try {
          const s = await getDoc(doc(db, 'groups', gid))
          const data: any = s.exists() ? s.data() : null
          const name = data?.label ?? data?.name ?? data?.nome ?? data?.title ?? ''
          if (name) up[gid] = name
        } catch {}
      }
      if (Object.keys(up).length) setGroupNames(prev => ({ ...prev, ...up }))
    })()
  }, [rows, groupNames])

  // Builder das cláusulas (com fallback de ordenação)
  function buildClauses(orderField: 'date' | '__name__') {
    const parts: any[] = []
    if (orderField === 'date') parts.push(orderBy('date', 'desc'))
    else parts.push(orderBy('__name__'))

    // Vendedor: admin escolhe; vendedor vê só o próprio
    if (role !== 'admin' && user?.uid) parts.push(where('vendorId', '==', user.uid))
    if (filters.vendor) parts.push(where('vendorId', '==', filters.vendor))

    // Número: alguns docs antigos têm `number` salvo como string com zero à esquerda ("04")
    // e outros como number (4). Usamos `in` para cobrir ambos formatos.
    if (typeof filters.number !== 'undefined') {
      const n = Number(filters.number)
      const s = String(n)
      const s2 = s.padStart(2, '0')
      const values: any[] = Array.from(new Set([n, s, s2]))
      parts.push(where('number', 'in', values))
    }

    // paginação/limite no fim
    return parts
  }

  async function loadFirst() {
    setLoading(true)
    const col = collection(db, 'sales')
    try {
      const snap = await getDocs(query(col, ...buildClauses('date'), limit(PAGE_SIZE)))
      const docs = snap.docs
      setRows(docs.map(toRow))
      setCursor(docs.length ? docs[docs.length - 1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } catch {
      // sem índice p/ (where + orderBy date) => cai para __name__
      const snap = await getDocs(query(col, ...buildClauses('__name__'), limit(PAGE_SIZE)))
      const docs = snap.docs
      setRows(docs.map(toRow))
      setCursor(docs.length ? docs[docs.length - 1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    const col = collection(db, 'sales')
    try {
      const snap = await getDocs(query(col, ...buildClauses('date'), startAfter(cursor), limit(PAGE_SIZE)))
      const docs = snap.docs
      setRows(prev => [...prev, ...docs.map(toRow)])
      setCursor(docs.length ? docs[docs.length - 1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } catch {
      const snap = await getDocs(query(col, ...buildClauses('__name__'), startAfter(cursor), limit(PAGE_SIZE)))
      const docs = snap.docs
      setRows(prev => [...prev, ...docs.map(toRow)])
      setCursor(docs.length ? docs[docs.length - 1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }

  // Carrega quando filtros mudam
  useEffect(() => {
    loadFirst()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.total || 0), 0)
    return { total }
  }, [rows])

  // Número de 0..70
  const numberOptions = Array.from({ length: 71 }, (_, i) => i)

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pt-14 md:pt-0 ml-0 md:ml-60">
        {/* filtros */}
        <GlassCard className="mx-auto max-w-7xl mt-4 px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="w-full sm:w-48">
              <Label>Número</Label>
              <Select
                value={typeof filters.number === 'number' ? String(filters.number) : ''}
                onChange={e =>
                  setFilters(f => ({
                    ...f,
                    number: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
              >
                <option value="">Todos</option>
                {numberOptions.map(n => (
                  <option key={n} value={n}>
                    {String(n).padStart(2, '0')}
                  </option>
                ))}
              </Select>
            </div>

            <div className="w-full sm:max-w-xs">
              <Label>Vendedor</Label>
              <Select
                value={filters.vendor ?? ''}
                onChange={e => setFilters(f => ({ ...f, vendor: e.target.value || undefined }))}
              >
                <option value="">{role === 'admin' ? 'Todos' : 'Meu usuário'}</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.id})
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:ml-auto">
              <button
                onClick={() => setRefresh(x => x + 1)}
                className="rounded-lg px-4 py-2 border border-border bg-surface hover:brightness-110 text-foreground text-sm transition whitespace-nowrap"
              >
                Aplicar
              </button>
            </div>
          </div>
        </GlassCard>

        {/* KPIs */}
        <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <GlassCard className="p-5">
            <div className="text-muted text-xs">Total (carregado)</div>
            <div className="mt-2 text-2xl font-semibold">{CURRENCY.format(kpis.total)}</div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="text-muted text-xs">Pago</div>
            <div className="mt-2 text-2xl font-semibold">
              {CURRENCY.format(rows.filter(r => r.status === 'pago').reduce((s, r) => s + (r.total || 0), 0))}
            </div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="text-muted text-xs">Pendente</div>
            <div className="mt-2 text-2xl font-semibold">
              {CURRENCY.format(rows.filter(r => r.status !== 'pago').reduce((s, r) => s + (r.total || 0), 0))}
            </div>
          </GlassCard>
        </div>

        {/* Tabela */}
        <div className="mx-auto max-w-7xl">
          <GlassCard className="mt-4 overflow-hidden">
            <div className="px-4 py-3 text-muted text-sm">Vendas</div>
            <div className="divider" />
            <div className="overflow-auto" aria-busy={loading}>
              <table className="min-w-[1040px] w-full text-sm border-collapse">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Data</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Número</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Grupo</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Vendedor</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Cliente</th>
                    <th className="text-right font-medium text-muted px-4 py-3 border-b border-border">Total</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Status</th>
                    <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Região</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3">{DATE.format(r.date)}</td>
                      <td className="px-4 py-3">{String(r.number).padStart(2, '0')}</td>
                      <td className="px-4 py-3">{r.groupName || groupNames[r.groupId] || r.groupId}</td>
                      <td className="px-4 py-3">{r.vendorName}</td>
                      <td className="px-4 py-3">{r.clientName}</td>
                      <td className="px-4 py-3 text-right">{CURRENCY.format(r.total)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'px-2 py-1 rounded text-xs border ' +
                            (r.status === 'pago'
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-warning/10 text-warning border-warning/30')
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.region}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted">
                        Nenhum registro com esses filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divider" />
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-xs text-muted">{rows.length} registro(s)</div>
              <button
                onClick={loadMore}
                disabled={!hasMore || loading}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50 transition text-foreground"
              >
                {loading ? 'Carregando…' : hasMore ? 'Carregar mais' : 'Fim'}
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
