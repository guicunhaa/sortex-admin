'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, getDoc, doc, limit, orderBy, query, startAfter, where, Timestamp, type DocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import GlassCard from '@/components/ui/GlassCard'
import LogoutButton from '@/components/LogoutButton'
import NewSaleModal from '@/components/dashboard/NewSaleModal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts'
import Sidebar from '@/components/layout/Sidebar'
import { useRole } from '@/hooks/useRole'
import Label from '@/components/ui/form/Label'
import Select from '@/components/ui/form/Select'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { REGIONS } from '@/lib/regions'
import { CircleDollarSign, Filter as FilterIcon, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react'

type Sale = {
  id:string; vendorName:string; vendorId:string; region:string; groupId:string; groupName?:string; number:string;
  quantity:number; total:number; status:'pago'|'pendente'; date:Date
}

type Filters = { vendor?:string; region?:string; status?:'pago'|'pendente'|'' }

type VendorOpt = { id:string; name:string }

const PAGE_SIZE=20
const CURRENCY=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const DATE=new Intl.DateTimeFormat('pt-BR')
const SERIES=['#6366f1','#22d3ee','#a5b4fc','#06b6d4','#60a5fa','#34d399','#f472b6']

function toSale(d:DocumentData):Sale{
  return {
    id:d.id,
    vendorName:d.get('vendorName')??'',
    vendorId:d.get('vendorId')??'',
    region:d.get('region')??'',
    groupId:d.get('groupId')??'',
    groupName:d.get('groupName') ?? d.get('group_label') ?? d.get('groupLabel') ?? '',
    number:String(d.get('number')??''),
    quantity:Number(d.get('quantity')??0),
    total:Number(d.get('total')??0),
    status:d.get('status')??'pendente',
    date:(d.get('date') as Timestamp)?.toDate()??new Date(0),
  }
}

export default function DashboardPage(){
  const { user, loading } = useAuth()
  const role = useRole()
  const router = useRouter()
  if (!loading && !user) router.replace('/login')

  const [filters,setFilters]=useState<Filters>({status:''})
  const [sales,setSales]=useState<Sale[]>([])
  const [cursor,setCursor]=useState<DocumentSnapshot|undefined>()
  const [hasMore,setHasMore]=useState(true)
  const [loadingPage,setLoadingPage]=useState(false)
  const [refreshTick,setRefreshTick]=useState(0)
  const [openModal,setOpenModal]=useState(false)
  const [showTotal,setShowTotal]=useState(true)

  const [vendors,setVendors]=useState<VendorOpt[]>([])
  const [groupNames, setGroupNames] = useState<Record<string,string>>({})
  useEffect(() => {
    const missing = Array.from(new Set(
      sales
        .filter(s => s.groupId && !s.groupName && !groupNames[s.groupId])
        .map(s => s.groupId)
    ))
    if (!missing.length) return
    ;(async () => {
      const updates: Record<string, string> = {}
      for (const gid of missing.slice(0, 25)) {
        try {
          const snap = await getDoc(doc(db, 'groups', gid))
          const data: any = snap.exists() ? snap.data() : null
          const name = data?.label ?? data?.name ?? data?.nome ?? data?.title ?? ''
          if (name) updates[gid] = name
        } catch {
          /* noop */
        }
      }
      if (Object.keys(updates).length) setGroupNames(prev => ({ ...prev, ...updates }))
    })()
  }, [sales])

  // carregar opções de vendedores
  useEffect(()=>{(async()=>{
    if(!user) return
    const snap = await getDocs(query(collection(db,'vendors'), orderBy('name','asc')))
    const list = snap.docs.map(d=>({ id:d.id, name:(d.data() as any).name ?? d.id }))
    setVendors(list)
  })()},[user?.uid])

  // carrega primeira página ao mudar filtros ou quando criar venda
  useEffect(()=>{ let alive=true;(async()=>{
    setLoadingPage(true)
    const col = collection(db,'sales')

    // helper para montar as clausulas com campo de ordenação parametrizado
    const buildClauses = (orderField: 'date'|'__name__') => {
      const base:any[] = [limit(PAGE_SIZE)]
      if (orderField === 'date') base.unshift(orderBy('date','desc'))
      else base.unshift(orderBy('__name__'))

      // Segurança: se não for admin, limita ao próprio vendedor sempre
      if (role !== 'admin' && user?.uid) base.unshift(where('vendorId','==', user.uid))
      // Filtros (admin pode aplicar qualquer um)
      if (filters.vendor) base.unshift(where('vendorId','==',filters.vendor))
      if (filters.region) base.unshift(where('region','==',filters.region))
      if (filters.status) base.unshift(where('status','==',filters.status))
      return base
    }

    try {
      const snap = await getDocs(query(col, ...buildClauses('date')))
      if(!alive) return
      const docs = snap.docs
      setSales(docs.map(toSale))
      setCursor(docs.length ? docs[docs.length-1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } catch (err:any) {
      // Fallback: se faltar índice para (filtros + orderBy date), ordena por __name__
      const snap = await getDocs(query(col, ...buildClauses('__name__')))
      if(!alive) return
      const docs = snap.docs
      setSales(docs.map(toSale))
      setCursor(docs.length ? docs[docs.length-1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } finally {
      if(alive) setLoadingPage(false)
    }
  })();return()=>{alive=false}} ,[filters.vendor,filters.region,filters.status,refreshTick, role, user?.uid])

  async function loadMore(){
    if(!cursor) return
    setLoadingPage(true)
    const col = collection(db,'sales')

    const buildClauses = (orderField: 'date'|'__name__') => {
      const base:any[] = [startAfter(cursor), limit(PAGE_SIZE)]
      if (orderField === 'date') base.unshift(orderBy('date','desc'))
      else base.unshift(orderBy('__name__'))

      if (role !== 'admin' && user?.uid) base.unshift(where('vendorId','==', user.uid))
      if (filters.vendor) base.unshift(where('vendorId','==',filters.vendor))
      if (filters.region) base.unshift(where('region','==',filters.region))
      if (filters.status) base.unshift(where('status','==',filters.status))
      return base
    }

    try {
      const snap = await getDocs(query(col, ...buildClauses('date')))
      const docs = snap.docs
      setSales(prev=>[...prev, ...docs.map(toSale)])
      setCursor(docs.length ? docs[docs.length-1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } catch (err:any) {
      // Fallback sem índice: ordena por __name__ (reinicia paginação nesse eixo)
      const snap = await getDocs(query(col, ...buildClauses('__name__')))
      const docs = snap.docs
      setSales(prev=>[...prev, ...docs.map(toSale)])
      setCursor(docs.length ? docs[docs.length-1] : undefined)
      setHasMore(docs.length === PAGE_SIZE)
    } finally {
      setLoadingPage(false)
    }
  }

  const kpis=useMemo(()=>{
    const totalRevenue=sales.reduce((s,r)=>s+(r.total||0),0)
    const items=sales.reduce((s,r)=>s+(r.quantity||0),0)
    const avgTicket=sales.length?totalRevenue/sales.length:0
    return { totalRevenue, items, avgTicket }
  },[sales])

  const lineData=useMemo(()=>{
    const byDay=new Map<string,number>()
    for(const s of sales){const k=DATE.format(s.date);byDay.set(k,(byDay.get(k)??0)+s.total)}
    return Array.from(byDay,([date,total])=>({date,total}))
      .sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  },[sales])

  const pieData=useMemo(()=>{
    const byVendor=new Map<string,number>()
    for(const s of sales){byVendor.set(s.vendorName,(byVendor.get(s.vendorName)??0)+s.total)}
    return Array.from(byVendor,([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,6)
  },[sales])

  const statusDistribution = useMemo(() => {
    const base = new Map<string, number>([
      ['pago', 0],
      ['pendente', 0],
    ])
    for (const s of sales) {
      base.set(s.status, (base.get(s.status) ?? 0) + 1)
    }
    return Array.from(base, ([name, value]) => ({ name, value }))
  }, [sales])

  const statusTotals = useMemo(() => {
    let paidCount = 0
    let pendingCount = 0
    let paidValue = 0
    let pendingValue = 0
    for (const sale of sales) {
      if (sale.status === 'pago') {
        paidCount += 1
        paidValue += sale.total || 0
      } else {
        pendingCount += 1
        pendingValue += sale.total || 0
      }
    }
    return { paidCount, pendingCount, paidValue, pendingValue }
  }, [sales])

  const completionRate = sales.length ? statusTotals.paidCount / sales.length : 0
  const pipelineValue = statusTotals.paidValue + statusTotals.pendingValue
  const paidShare = pipelineValue ? statusTotals.paidValue / pipelineValue : 0

  const recentSales = useMemo(() => sales.slice(0, 6), [sales])

  const topRegions = useMemo(() => {
    const byRegion = new Map<string, { total: number; quantity: number }>()
    for (const sale of sales) {
      const current = byRegion.get(sale.region) ?? { total: 0, quantity: 0 }
      current.total += sale.total
      current.quantity += sale.quantity
      byRegion.set(sale.region, current)
    }
    return Array.from(byRegion, ([region, stats]) => ({
      region,
      ...stats,
      avgTicket: stats.quantity ? stats.total / stats.quantity : 0,
    }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)
  }, [sales])

  const highlightSale = useMemo(() => {
    if (!sales.length) return null
    return sales.reduce((acc: Sale | null, curr) => {
      if (!acc || curr.total > acc.total) return curr
      return acc
    }, null)
  }, [sales])

  const bestDay = useMemo(() => {
    if (!lineData.length) return null
    return lineData.reduce((acc: { date: string; total: number } | null, curr) => {
      if (!acc || curr.total > acc.total) return curr
      return acc
    }, null)
  }, [lineData])

  const momentum = useMemo(() => {
    if (lineData.length < 2) return 0
    const first = lineData[0]?.total ?? 0
    const last = lineData[lineData.length - 1]?.total ?? 0
    if (first === 0) return last > 0 ? 1 : 0
    return (last - first) / first
  }, [lineData])

  const insights = useMemo(() => {
    const entries: string[] = []
    if (!sales.length) return entries
    const bestVendor = pieData[0]
    if (bestVendor) entries.push(`${bestVendor.name} lidera o faturamento com ${CURRENCY.format(bestVendor.total)}.`)
    const bestRegion = topRegions[0]
    if (bestRegion) entries.push(`A região ${bestRegion.region || 'não informada'} responde por ${CURRENCY.format(bestRegion.total)} e ticket médio de ${CURRENCY.format(bestRegion.avgTicket)}.`)
    if (bestDay) entries.push(`Melhor dia: ${bestDay.date} com ${CURRENCY.format(bestDay.total)} faturados.`)
    if (highlightSale) entries.push(`Maior venda registrada: ${highlightSale.vendorName || highlightSale.vendorId} com ticket de ${CURRENCY.format(highlightSale.total)}.`)
    if (statusTotals.pendingValue > 0) entries.push(`Existem ${CURRENCY.format(statusTotals.pendingValue)} em pendências aguardando follow-up.`)
    entries.push(`Taxa de pagamentos em dia: ${(completionRate * 100).toFixed(1)}% (${statusTotals.paidCount} de ${sales.length} vendas).`)
    if (Math.abs(momentum) > 0.01) {
      entries.push(`Momentum do período: ${(momentum * 100).toFixed(1)}% ${momentum >= 0 ? 'acima' : 'abaixo'} do início.`)
    }
    entries.push(`Cobertura de receita já recebida: ${(paidShare * 100).toFixed(1)}%.`)
    return entries
  }, [bestDay, completionRate, highlightSale, momentum, paidShare, pieData, sales.length, statusTotals, topRegions])

  // opções de região a partir do arquivo de regiões
  const regionOptions = (Array.isArray(REGIONS) ? REGIONS : []).map((r:any)=>({ value: r.code ?? r.value ?? r, label: r.label ?? r.name ?? String(r) }))

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-[-20%] h-[520px] bg-[radial-gradient(ellipse_at_top,_rgba(79,70,229,0.35),_rgba(15,23,42,0))] blur-3xl opacity-80" />
        <div className="absolute right-[10%] top-1/3 h-[380px] w-[380px] rounded-full bg-[conic-gradient(from_120deg_at_50%_50%,_rgba(56,189,248,0.45),_rgba(56,189,248,0)_65%,_rgba(99,102,241,0.45))] blur-3xl opacity-70" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.08)_0%,rgba(15,23,42,0.2)_45%,rgba(15,23,42,0.75)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_60%,rgba(15,23,42,0.85)_100%)]" />
      </div>
      <Sidebar />
      <div className="relative z-10 pt-14 md:pt-0 ml-0 md:ml-60 overflow-x-hidden">
        {/* HEADER */}
        <div className="sticky top-0 z-40 px-4 md:px-6">
          <GlassCard className="relative mx-auto mt-6 max-w-7xl overflow-hidden border-transparent bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-900/20 px-6 py-8 shadow-[0_45px_120px_-60px_rgba(56,189,248,0.65)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 opacity-80">
              <div className="absolute -left-20 top-12 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.35)_0%,_transparent_65%)] blur-2xl" />
              <div className="absolute -right-20 -bottom-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.4)_0%,_transparent_60%)] blur-3xl" />
              <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_0%,rgba(15,23,42,0)_55%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.35em] text-white/60">
                    <Sparkles className="size-3" /> visão premium
                  </span>
                  <div>
                    <h1 className="text-3xl font-semibold leading-tight text-white drop-shadow-[0_5px_25px_rgba(59,130,246,0.35)] md:text-4xl">
                      Centro de Inteligência Comercial
                    </h1>
                    <p className="text-sm text-white/70 md:text-base">
                      Uma experiência imersiva para antecipar resultados, acompanhar o pulso da operação e guiar decisões com precisão.
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 text-sm xl:w-auto">
                  <div className="hidden md:flex">
                    <ThemeToggle />
                  </div>
                  <button
                    onClick={()=>setOpenModal(true)}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 px-5 py-2.5 font-medium text-white shadow-lg shadow-sky-500/40 transition hover:scale-[1.01]"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <span className="text-lg leading-none">+</span> Nova venda
                    </span>
                    <span className="absolute inset-0 bg-white opacity-0 transition group-hover:opacity-30" />
                  </button>
                  <LogoutButton />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-inner shadow-slate-900/40">
                  <div className="absolute -right-10 -top-10 size-24 rounded-full bg-indigo-500/20 blur-2xl transition group-hover:scale-110" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Faturamento</p>
                      <p className="mt-1 text-xl font-semibold text-white md:text-2xl">{CURRENCY.format(kpis.totalRevenue)}</p>
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-200">
                      <CircleDollarSign className="size-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/60">
                    Cobertura recebida de {(paidShare * 100).toFixed(1)}% com {statusTotals.paidCount} vendas quitadas.
                  </p>
                </div>
                <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-inner shadow-slate-900/40">
                  <div className="absolute -right-16 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-2xl transition group-hover:scale-110" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Ticket médio</p>
                      <p className="mt-1 text-xl font-semibold text-white md:text-2xl">{CURRENCY.format(kpis.avgTicket||0)}</p>
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
                      <TrendingUp className="size-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/60">
                    Melhor venda registrada em {highlightSale ? `${highlightSale.vendorName || highlightSale.vendorId}` : '—'}.
                  </p>
                </div>
                <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-inner shadow-slate-900/40">
                  <div className="absolute -left-12 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-purple-500/20 blur-2xl transition group-hover:scale-110" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Itens vendidos</p>
                      <p className="mt-1 text-xl font-semibold text-white md:text-2xl">{kpis.items}</p>
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-purple-500/20 text-purple-200">
                      <Target className="size-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/60">
                    {bestDay ? `Maior volume diário em ${bestDay.date}.` : 'Aguardando histórico para destacar um pico.'}
                  </p>
                </div>
                <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-inner shadow-slate-900/40">
                  <div className="absolute -right-16 bottom-0 h-32 w-32 rounded-full bg-amber-500/20 blur-2xl transition group-hover:scale-110" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Pagamentos em dia</p>
                      <p className="mt-1 text-xl font-semibold text-white md:text-2xl">
                        {statusDistribution.length ? `${(completionRate * 100).toFixed(1)}%` : '--'}
                      </p>
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-200">
                      <ShieldCheck className="size-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/60">
                    Pipeline pendente de {CURRENCY.format(statusTotals.pendingValue)} aguardando ação.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Saúde da operação</p>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs text-emerald-200">
                      {(completionRate * 100).toFixed(1)}% concluído
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-white/70">
                    <p>
                      {momentum >= 0
                        ? `Crescimento de ${(momentum * 100).toFixed(1)}% versus o início do período.`
                        : `Queda de ${Math.abs(momentum * 100).toFixed(1)}% versus o início do período.`}
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-cyan-300"
                        style={{ width: `${Math.min(100, Math.max(0, completionRate * 100))}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                      <span>{statusTotals.paidCount} vendas pagas</span>
                      <span>{statusTotals.pendingCount} pendentes</span>
                      <span>Recebido: {CURRENCY.format(statusTotals.paidValue)}</span>
                      <span>A receber: {CURRENCY.format(statusTotals.pendingValue)}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80 shadow-inner shadow-slate-900/40">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Região destaque</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {topRegions[0]?.region || 'Aguardando dados'}
                    </p>
                    <p className="text-xs text-white/60">
                      {topRegions[0]
                        ? `${CURRENCY.format(topRegions[0].total)} • Ticket médio ${CURRENCY.format(topRegions[0].avgTicket)}`
                        : 'Combine filtros para revelar tendências locais.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80 shadow-inner shadow-slate-900/40">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Meta viva</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {CURRENCY.format(pipelineValue)}
                    </p>
                    <p className="text-xs text-white/60">Volume total monitorado no período filtrado.</p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* CONTAINER */}
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 space-y-8">
          {/* FILTER BAR (apenas para admin) */}
          {role === 'admin' && (
            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 px-6 py-6 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.35)_0%,_transparent_70%)] blur-2xl" />
                <div className="absolute right-0 bottom-0 h-44 w-44 translate-x-1/3 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.3)_0%,_transparent_70%)] blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
              <div className="relative flex flex-col gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-white/50">
                      <FilterIcon className="size-3" /> filtros imersivos
                    </p>
                    <h2 className="text-xl font-semibold text-white">Segmentação avançada</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">tempo real</span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">multidimensional</span>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                  <div className="flex flex-col">
                    <Label className="text-white/70">Vendedor</Label>
                    <Select
                      value={filters.vendor??''}
                      onChange={e=>setFilters(f=>({...f,vendor:e.target.value||undefined}))}
                      className="border-white/20 bg-white/10 text-white/90 backdrop-blur placeholder:text-white/50"
                    >
                      <option value="">{role==='admin'?'Todos':'Meu usuário'}</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <Label className="text-white/70">Região</Label>
                    <Select
                      value={filters.region??''}
                      onChange={e=>setFilters(f=>({...f,region:e.target.value||undefined}))}
                      className="border-white/20 bg-white/10 text-white/90 backdrop-blur placeholder:text-white/50"
                    >
                      <option value="">Todas</option>
                      {regionOptions.map((r:any)=> (
                        <option key={String(r.value)} value={String(r.value)}>{r.label} ({String(r.value)})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col">
                    <Label className="text-white/70">Status</Label>
                    <Select
                      value={filters.status??''}
                      onChange={e=>setFilters(f=>({...f,status:e.target.value as any}))}
                      className="border-white/20 bg-white/10 text-white/90 backdrop-blur"
                    >
                      <option value="">Todos</option>
                      <option value="pago">Pago</option>
                      <option value="pendente">Pendente</option>
                    </Select>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {/* CHARTS & INSIGHTS */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 lg:p-7 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -top-16 left-1/3 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28)_0%,_transparent_70%)] blur-3xl" />
                <div className="absolute right-0 bottom-0 h-40 w-40 translate-x-1/3 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(45,212,191,0.22)_0%,_transparent_70%)] blur-2xl" />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Curva de faturamento</p>
                    <h2 className="text-xl font-semibold text-white">Faturamento diário</h2>
                    <p className="text-sm text-white/60">Performance temporal com linha suavizada, captura de picos e projeção de tendências.</p>
                  </div>
                  <button
                    onClick={()=>setShowTotal(v=>!v)}
                    className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40 hover:text-white"
                  >
                    <TrendingUp className="size-3" /> {showTotal ? 'Ocultar' : 'Mostrar'} série
                  </button>
                </div>
                <div className="h-72 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9}/>
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="4 8" opacity={0.25} stroke="#94a3b8" />
                      <XAxis dataKey="date" stroke="#cbd5f5" tick={{ fontSize: 12, fill: '#cbd5f5' }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#cbd5f5" tickFormatter={(v)=>CURRENCY.format(v).replace('R$','R$ ')} tick={{ fill: '#cbd5f5', fontSize: 12 }} tickLine={false} axisLine={false} width={120} />
                      <Tooltip formatter={(v:number)=>CURRENCY.format(v)} contentStyle={{ backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)' }} cursor={{ strokeDasharray: '3 3' }} />
                      <Legend wrapperStyle={{ color: '#e2e8f0' }} />
                      <Line type="monotone" dataKey="total" name="Faturamento" stroke="#a5b4fc" strokeWidth={3} dot={{ r: 3 }} activeDot={{r:5}} fill="url(#grad)" fillOpacity={0.15} hide={!showTotal}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 gap-4">
              <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
                <div className="pointer-events-none absolute inset-0 opacity-80">
                  <div className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(251,191,36,0.25)_0%,_transparent_70%)] blur-3xl" />
                </div>
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Saúde de pagamentos</p>
                      <h2 className="text-lg font-semibold text-white">Status das vendas</h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-0.5 text-xs text-white/60">
                      {statusTotals.paidCount} quitadas · {statusTotals.pendingCount} pendentes
                    </span>
                  </div>
                  <p className="mb-4 text-xs text-white/60">Distribuição entre receitas recebidas e o backlog que ainda necessita acompanhamento.</p>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusDistribution}>
                        <CartesianGrid vertical={false} strokeDasharray="4 8" opacity={0.15} stroke="#94a3b8" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#cbd5f5' }} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} tick={{ fill: '#cbd5f5', fontSize: 12 }} />
                        <Tooltip formatter={(v:number)=>`${v} venda(s)`} contentStyle={{ backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0' }} />
                        <Bar dataKey="value" radius={[12,12,6,6]}>
                          {statusDistribution.map((item)=>(
                            <Cell key={item.name} fill={item.name==='pago' ? '#34d399' : '#fbbf24'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="relative overflow-hidden border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-900/20 p-5 shadow-inner shadow-slate-900/40">
                <div className="pointer-events-none absolute inset-0 opacity-80">
                  <div className="absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28)_0%,_transparent_70%)] blur-3xl" />
                  <div className="absolute right-0 top-0 h-52 w-52 translate-x-1/4 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.3)_0%,_transparent_70%)] blur-2xl" />
                </div>
                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Insights rápidos</p>
                      <h2 className="text-lg font-semibold text-white">Contexto acionável</h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-0.5 text-xs text-white/60">
                      Atualizado em tempo real
                    </span>
                  </div>
                  <ul className="space-y-4 text-sm text-white/80">
                    {insights.length ? insights.map((text, index) => (
                      <li key={index} className="relative pl-6">
                        <div className="absolute left-0 top-1 size-3 rounded-full bg-gradient-to-br from-indigo-400 to-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.6)]" />
                        <div className="font-medium text-white">Insight #{index + 1}</div>
                        <p className="text-sm text-white/70 leading-relaxed">{text}</p>
                      </li>
                    )) : (
                      <li className="text-white/60">Nenhum insight disponível com os dados atuais.</li>
                    )}
                  </ul>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* DISTRIBUTIONS */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -right-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.3)_0%,_transparent_70%)] blur-3xl" />
              </div>
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Top performers</p>
                    <h2 className="text-lg font-semibold text-white">Ranking de vendedores</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-0.5 text-xs text-white/60">
                    {pieData.length || 0} vendedores em destaque
                  </span>
                </div>
                <div className="space-y-3">
                  {pieData.length ? pieData.map((item, index) => {
                    const share = kpis.totalRevenue ? item.total / kpis.totalRevenue : 0
                    return (
                      <div key={item.name} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 transition group-hover:opacity-100" />
                        <div className="relative flex items-center gap-4">
                          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500/20 text-sm font-semibold text-indigo-200">
                            #{index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-medium text-white">{item.name}</p>
                              <span className="text-sm text-white/70">{CURRENCY.format(item.total)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                              <span>Share {Math.max(0, share * 100).toFixed(1)}%</span>
                              <span>Contribuição acumulada</span>
                            </div>
                            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-cyan-300"
                                style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="text-sm text-white/60">Sem dados disponíveis para o ranking.</div>
                  )}
                </div>
              </div>
            </GlassCard>

            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -left-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(34,211,238,0.28)_0%,_transparent_70%)] blur-3xl" />
              </div>
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Mapa de calor</p>
                    <h2 className="text-lg font-semibold text-white">Desempenho por região</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-0.5 text-xs text-white/60">
                    {topRegions.length || 0} regiões monitoradas
                  </span>
                </div>
                <div className="space-y-3">
                  {topRegions.length ? topRegions.map(region => (
                    <div key={region.region} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between text-sm font-medium text-white">
                        <span>{region.region || 'Não informado'}</span>
                        <span>{CURRENCY.format(region.total)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                        <span>{region.quantity} itens vendidos</span>
                        <span>Ticket médio {CURRENCY.format(region.avgTicket)}</span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300"
                          style={{ width: `${Math.min(100, (region.total / (topRegions[0]?.total || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )) : (
                    <div className="text-sm text-white/60">Sem dados suficientes para analisar regiões.</div>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* CHART PIE + TIMELINE */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -left-12 top-0 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(165,180,252,0.25)_0%,_transparent_70%)] blur-3xl" />
                <div className="absolute right-0 bottom-0 h-48 w-48 translate-x-1/4 rounded-full bg-[radial-gradient(circle,_rgba(6,182,212,0.28)_0%,_transparent_70%)] blur-2xl" />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Contribuição individual</p>
                    <h2 className="text-lg font-semibold text-white">Participação por vendedor</h2>
                    <p className="text-xs text-white/60">Percentual de contribuição para o faturamento total neste recorte.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/60">
                    Top {pieData.length || 0}
                  </span>
                </div>
                <div className="h-72 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="total" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3} stroke="transparent">
                        {pieData.map((_,i)=>(<Cell key={i} fill={SERIES[i%SERIES.length]}/>))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        wrapperStyle={{ color: '#e2e8f0' }}
                      />
                      <Tooltip formatter={(v:number)=>CURRENCY.format(v)} contentStyle={{ backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 p-5 shadow-inner shadow-slate-900/40">
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28)_0%,_transparent_70%)] blur-3xl" />
              </div>
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Linha do tempo</p>
                    <h2 className="text-lg font-semibold text-white">Últimas movimentações</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-0.5 text-xs text-white/60">
                    {recentSales.length} registros recentes
                  </span>
                </div>
                <div className="relative pl-5">
                  <div className="absolute left-[6px] top-2 bottom-4 w-px bg-white/15" />
                  <div className="space-y-5">
                    {recentSales.length ? recentSales.map(item => (
                      <div key={item.id} className="relative pl-6">
                        <div className="absolute left-0 top-2 size-3 rounded-full border border-white/40 bg-gradient-to-br from-indigo-400 to-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.6)]" />
                        <div className="flex items-center justify-between text-sm font-medium text-white">
                          <span className="truncate pr-3">{item.vendorName || 'Vendedor sem nome'}</span>
                          <span>{CURRENCY.format(item.total)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <span>#{item.number}</span>
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <TrendingUp className="size-3" /> {item.quantity} itens
                          </span>
                          <span>{item.region || 'Sem região'}</span>
                          <span>{DATE.format(item.date)}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-white/60">Nenhuma movimentação encontrada.</div>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* TABLE */}
          <GlassCard className="relative overflow-hidden border-white/10 bg-white/5 shadow-inner shadow-slate-900/40">
            <div className="pointer-events-none absolute inset-0 opacity-70">
              <div className="absolute -left-24 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.25)_0%,_transparent_70%)] blur-3xl" />
              <div className="absolute right-0 bottom-0 h-72 w-72 translate-x-1/3 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.3)_0%,_transparent_70%)] blur-3xl" />
            </div>
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Matriz de vendas</p>
                  <h2 className="text-lg font-semibold text-white">Vendas consolidadas</h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/60">
                  <span>{sales.length} registro(s)</span>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1">Atualização instantânea</span>
                </div>
              </div>
              <div className="overflow-auto" aria-busy={loadingPage}>
                <table className="min-w-[1040px] w-full border-collapse text-sm text-white/80">
                  <caption className="sr-only">Tabela de vendas com filtros e paginação</caption>
                  <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur supports-[backdrop-filter]:bg-white/10">
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-white/50">
                      <th scope="col" className="px-5 py-3">Data</th>
                      <th scope="col" className="px-5 py-3">Vendedor</th>
                      <th scope="col" className="px-5 py-3">Número</th>
                      <th scope="col" className="px-5 py-3">Grupo</th>
                      <th scope="col" className="px-5 py-3 text-right">Qtd</th>
                      <th scope="col" className="px-5 py-3 text-right">Total</th>
                      <th scope="col" className="px-5 py-3">Região</th>
                      <th scope="col" className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Skeleton inicial */}
                    {loadingPage && sales.length===0 && Array.from({length:6}).map((_,i)=>(
                      <tr key={i} className="border-t border-white/10 animate-pulse">
                        {Array.from({length:8}).map((__,j)=>(
                          <td key={j} className="px-5 py-3">
                            <div className="h-4 w-24 rounded bg-white/10" />
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* Dados */}
                    {sales.map(s=>(
                      <tr key={s.id} className="border-t border-white/10 transition hover:bg-white/5">
                        <td className="px-5 py-3 align-middle">{DATE.format(s.date)}</td>
                        <td className="px-5 py-3 align-middle">{s.vendorName}</td>
                        <td className="px-5 py-3 align-middle">{s.number}</td>
                        <td className="px-5 py-3 align-middle">{s.groupName || (s.groupId && groupNames[s.groupId]) || s.groupId}</td>
                        <td className="px-5 py-3 text-right align-middle">{s.quantity}</td>
                        <td className="px-5 py-3 text-right align-middle">{CURRENCY.format(s.total)}</td>
                        <td className="px-5 py-3 align-middle">{s.region}</td>
                        <td className="px-5 py-3 align-middle">
                          <span
                            className={
                              'inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-[0.2em] ' +
                              (s.status === 'pago'
                                ? 'border-emerald-400/20 bg-emerald-500/15 text-emerald-200'
                                : 'border-amber-400/20 bg-amber-500/15 text-amber-200')
                            }
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Empty state */}
                    {sales.length===0 && !loadingPage && (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-white/60">Nenhum registro com esses filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                <div className="text-xs text-white/60" aria-live="polite">{sales.length} registro(s) exibidos</div>
                <button
                  onClick={loadMore}
                  disabled={!hasMore||loadingPage}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-xs uppercase tracking-[0.25em] text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-40"
                >
                  {loadingPage?'Carregando…':hasMore?'Carregar mais':'Fim da lista'}
                </button>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Modal Nova venda */}
        <NewSaleModal
          open={openModal}
          onClose={()=>setOpenModal(false)}
          onCreated={()=>setRefreshTick(x=>x+1)}
        />
      </div>
    </div>
  )
}
