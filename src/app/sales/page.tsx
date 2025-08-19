'use client'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { db } from '@/lib/firebase'
import Label from '@/components/ui/form/Label'
import Input from '@/components/ui/form/Input'
import Select from '@/components/ui/form/Select'
import {
  collection, getDocs, query, where, orderBy, limit, startAfter,
  Timestamp, type DocumentSnapshot
} from 'firebase/firestore'

type Sale = {
  id: string
  number: string
  vendorId: string
  vendorName?: string
  clientId?: string
  clientName?: string
  total: number
  status: 'pago'|'pendente'
  region?: string
  product?: string
  quantity?: number
  date: Date
}

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const PAGE_SIZE = 30

export default function SalesPage() {
  const { user } = useAuth()
  const role = useRole()

  const [status, setStatus] = useState<''|'pago'|'pendente'>('')
  const [vendor, setVendor] = useState<string>('') // admin escolhe; vendedor ignora
  const [from, setFrom] = useState<string>('')     // yyyy-mm-dd
  const [to, setTo] = useState<string>('')

  const [rows, setRows] = useState<Sale[]>([])
  const [cursor, setCursor] = useState<DocumentSnapshot | undefined>()
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  function toDateStart(s?: string) {
    if (!s) return null
    const d = new Date(s + 'T00:00:00')
    if (Number.isNaN(+d)) return null
    return d
  }
  function toDateEnd(s?: string) {
    if (!s) return null
    const d = new Date(s + 'T23:59:59.999')
    if (Number.isNaN(+d)) return null
    return d
  }

  async function loadFirst() {
    if (!user) return
    setLoading(true)
    const col = collection(db, 'sales')
    const clauses: any[] = [orderBy('date', 'desc'), limit(PAGE_SIZE)]

    // papel: vendor só vê dele
    if (role !== 'admin' && user?.uid) clauses.unshift(where('vendorId', '==', user.uid))
    // admin pode filtrar vendor específico
    if (role === 'admin' && vendor) clauses.unshift(where('vendorId', '==', vendor))
    // status
    if (status) clauses.unshift(where('status', '==', status))
    // período
    const dFrom = toDateStart(from)
    const dTo = toDateEnd(to)
    if (dFrom) clauses.unshift(where('date', '>=', Timestamp.fromDate(dFrom)))
    if (dTo)   clauses.unshift(where('date', '<=', Timestamp.fromDate(dTo)))

    const snap = await getDocs(query(col, ...clauses))
    const docs = snap.docs
    setRows(docs.map(d => {
      const s:any = d.data()
      return {
        id: d.id,
        number: s.number ?? '',
        vendorId: s.vendorId ?? '',
        vendorName: s.vendorName ?? '',
        clientId: s.clientId ?? '',
        clientName: s.clientName ?? '',
        total: Number(s.total ?? 0),
        status: s.status ?? 'pendente',
        region: s.region ?? '',
        product: s.product ?? '',
        quantity: Number(s.quantity ?? 1),
        date: s.date?.toDate?.() ?? new Date(0),
      } as Sale
    }))
    setCursor(docs.length ? docs[docs.length-1] : undefined)
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
    if (status) clauses.unshift(where('status', '==', status))
    const dFrom = toDateStart(from)
    const dTo = toDateEnd(to)
    if (dFrom) clauses.unshift(where('date', '>=', Timestamp.fromDate(dFrom)))
    if (dTo)   clauses.unshift(where('date', '<=', Timestamp.fromDate(dTo)))

    const snap = await getDocs(query(col, ...clauses))
    const docs = snap.docs
    setRows(prev => [...prev, ...docs.map(d => {
      const s:any = d.data()
      return {
        id: d.id,
        number: s.number ?? '',
        vendorId: s.vendorId ?? '',
        vendorName: s.vendorName ?? '',
        clientId: s.clientId ?? '',
        clientName: s.clientName ?? '',
        total: Number(s.total ?? 0),
        status: s.status ?? 'pendente',
        region: s.region ?? '',
        product: s.product ?? '',
        quantity: Number(s.quantity ?? 1),
        date: s.date?.toDate?.() ?? new Date(0),
      } as Sale
    })])
    setCursor(docs.length ? docs[docs.length-1] : undefined)
    setHasMore(docs.length === PAGE_SIZE)
    setLoading(false)
  }

  // carrega quando filtros mudam
  useEffect(() => { loadFirst() }, [status, vendor, from, to, role, user?.uid])

  // KPIs rápidos dos resultados carregados
  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.total || 0), 0)
    const pagos = rows.filter(r => r.status === 'pago').reduce((s, r) => s + (r.total || 0), 0)
    const pend  = total - pagos
    return { total, pagos, pend }
  }, [rows])

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
                <Label>Status</Label>
                <Select value={status} onChange={e=>setStatus(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                </Select>
              </div>
              {role==='admin' && (
                <div>
                  <Label>Vendedor (vendorId)</Label>
                  <Input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="UID do vendedor" className="w-56" />
                </div>
              )}
              <div>
                <Label>De</Label>
                <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
              </div>
              <div>
                <Label>Até</Label>
                <Input type="date" value={to} onChange={e=>setTo(e.target.value)} />
              </div>
              <button onClick={loadFirst}
                      className="self-end rounded px-3 py-2 border border-border bg-surface hover:brightness-110 text-foreground text-sm">
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
          <div className="overflow-x-auto max-w-full" aria-busy={loading}><div className="inline-block min-w-full align-middle"><table className="min-w-[960px] w-full text-sm border-collapse">
                <caption className="sr-only">Tabela de vendas com filtros e paginação</caption>
            <thead className="bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-10">
              <tr>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Data</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Número</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Vendedor</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Cliente</th>
                <th scope="col" className="text-right font-medium text-muted px-4 py-3 border-b border-border">Qtd</th>
                <th scope="col" className="text-right font-medium text-muted px-4 py-3 border-b border-border">Total</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Status</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Produto</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Região</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length===0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-muted">Carregando…</td></tr>
              )}
              {rows.map(s => (
                <tr key={s.id} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-3">{DATE.format(s.date)}</td>
                  <td className="px-4 py-3">{s.number}</td>
                  <td className="px-4 py-3">{s.vendorName || s.vendorId}</td>
                  <td className="px-4 py-3">{s.clientName || s.clientId || '-'}</td>
                  <td className="px-4 py-3 text-right">{s.quantity ?? 1}</td>
                  <td className="px-4 py-3 text-right">{CURRENCY.format(s.total)}</td>
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
                  <td className="px-4 py-3">{s.product || '-'}</td>
                  <td className="px-4 py-3">{s.region || '-'}</td>
                </tr>
              ))}
              {!loading && rows.length===0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">Sem registros neste filtro.</td></tr>
              )}
            </tbody>
          </table></div></div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-xs text-muted" aria-live="polite">{rows.length} registro(s)</div>
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
