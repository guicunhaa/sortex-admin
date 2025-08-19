'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, getDoc, doc, limit, orderBy, query, startAfter, where, Timestamp, type DocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import GlassCard from '@/components/ui/GlassCard'
import LogoutButton from '@/components/LogoutButton'
import NewSaleModal from '@/components/dashboard/NewSaleModal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import Sidebar from '@/components/layout/Sidebar'
import { useRole } from '@/hooks/useRole'
import Label from '@/components/ui/form/Label'
import Select from '@/components/ui/form/Select'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { REGIONS } from '@/lib/regions'

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

  // opções de região a partir do arquivo de regiões
  const regionOptions = (Array.isArray(REGIONS) ? REGIONS : []).map((r:any)=>({ value: r.code ?? r.value ?? r, label: r.label ?? r.name ?? String(r) }))

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pt-14 md:pt-0 ml-0 md:ml-60 overflow-x-hidden">
        {/* HEADER */}
        <div className="sticky top-0 z-40">
          <GlassCard className="mx-auto max-w-7xl mt-4 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold text-foreground text-glow">Dashboard de Vendas</h1>
                <p className="text-sm text-muted truncate">Visão geral • filtros dinâmicos • UI glass</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="hidden md:flex">
                  <ThemeToggle />
                </div>
                <button
                  onClick={()=>setOpenModal(true)}
                  className="rounded-lg px-4 py-2 border border-border bg-surface hover:brightness-110 text-foreground text-sm transition whitespace-nowrap shrink-0 min-w-[120px]"
                >
                  + Nova venda
                </button>
                <LogoutButton />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* CONTAINER */}
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
          {/* FILTER BAR (apenas para admin) */}
          {role === 'admin' && (
            <GlassCard className="px-4 py-3">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <Label>Vendedor</Label>
                  <Select value={filters.vendor??''}
                    onChange={e=>setFilters(f=>({...f,vendor:e.target.value||undefined}))}>
                    <option value="">{role==='admin'?'Todos':'Meu usuário'}</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1">
                  <Label>Região</Label>
                  <Select value={filters.region??''}
                    onChange={e=>setFilters(f=>({...f,region:e.target.value||undefined}))}>
                    <option value="">Todas</option>
                    {regionOptions.map((r:any)=> (
                      <option key={String(r.value)} value={String(r.value)}>{r.label} ({String(r.value)})</option>
                    ))}
                  </Select>
                </div>
                <div className="w-full md:w-48">
                  <Label>Status</Label>
                  <Select value={filters.status??''}
                    onChange={e=>setFilters(f=>({...f,status:e.target.value as any}))}>
                    <option value="">Todos</option>
                    <option value="pago">Pago</option>
                    <option value="pendente">Pendente</option>
                  </Select>
                </div>
              </div>
            </GlassCard>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <GlassCard className="p-5">
              <div className="text-muted text-xs">Faturamento</div>
              <div className="mt-2 text-2xl font-semibold">{CURRENCY.format(kpis.totalRevenue)}</div>
              <div className="mt-1 text-[11px] text-muted">Soma do período filtrado</div>
            </GlassCard>
            <GlassCard className="p-5">
              <div className="text-muted text-xs">Ticket médio</div>
              <div className="mt-2 text-2xl font-semibold">{CURRENCY.format(kpis.avgTicket||0)}</div>
              <div className="mt-1 text-[11px] text-muted">Média por venda</div>
            </GlassCard>
            <GlassCard className="p-5">
              <div className="text-muted text-xs">Itens vendidos</div>
              <div className="mt-2 text-2xl font-semibold">{kpis.items}</div>
              <div className="mt-1 text-[11px] text-muted">Quantidade total</div>
            </GlassCard>
          </div>

          {/* CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <GlassCard className="p-4 lg:col-span-2">
              <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8}/>
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" stroke="currentColor" tick={{ fontSize: 12 }} />
                    <YAxis stroke="currentColor" tickFormatter={(v)=>CURRENCY.format(v).replace('R$','R$ ')} />
                    <Tooltip formatter={(v:number)=>CURRENCY.format(v)} />
                    <Legend onClick={(e:any)=>{ if(e && e.dataKey==='total') setShowTotal(v=>!v) }} />
                    <Line type="monotone" dataKey="total" name="Faturamento" stroke="#a5b4fc" strokeWidth={2} dot={false} activeDot={{r:4}} hide={!showTotal}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="total" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {pieData.map((_,i)=>(<Cell key={i} fill={SERIES[i%SERIES.length]}/>))}
                    </Pie>
                    <Legend/>
                    <Tooltip formatter={(v:number)=>CURRENCY.format(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* TABLE */}
          <GlassCard className="mt-4 overflow-hidden">
            <div className="px-4 py-3 text-muted text-sm">Vendas</div>
            <div className="divider"/>
            <div className="overflow-auto" aria-busy={loadingPage}>
              <table className="min-w-[1040px] w-full text-sm border-collapse">
                <caption className="sr-only">Tabela de vendas com filtros e paginação</caption>
                <thead className="bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Data</th>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Vendedor</th>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Número</th>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Grupo</th>
                    <th scope="col" className="text-right font-medium text-muted px-4 py-3 border-b border-border">Qtd</th>
                    <th scope="col" className="text-right font-medium text-muted px-4 py-3 border-b border-border">Total</th>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Região</th>
                    <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Skeleton inicial */}
                  {loadingPage && sales.length===0 && Array.from({length:6}).map((_,i)=>(
                    <tr key={i} className="border-t border-border animate-pulse">
                      {Array.from({length:8}).map((__,j)=>(
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface rounded w-24" />
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* Dados */}
                  {sales.map(s=>(
                    <tr key={s.id} className="border-t border-border hover:bg-surface">
                      <td className="px-4 py-3">{DATE.format(s.date)}</td>
                      <td className="px-4 py-3">{s.vendorName}</td>
                      <td className="px-4 py-3">{s.number}</td>
                      <td className="px-4 py-3">{s.groupName || (s.groupId && groupNames[s.groupId]) || s.groupId}</td>
                      <td className="px-4 py-3 text-right">{s.quantity}</td>
                      <td className="px-4 py-3 text-right">{CURRENCY.format(s.total)}</td>
                      <td className="px-4 py-3">{s.region}</td>
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
                    </tr>
                  ))}

                  {/* Empty state */}
                  {sales.length===0 && !loadingPage && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">Nenhum registro com esses filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="divider"/>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-xs text-muted" aria-live="polite">{sales.length} registro(s)</div>
              <button onClick={loadMore} disabled={!hasMore||loadingPage}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50 transition text-foreground">
                {loadingPage?'Carregando…':hasMore?'Carregar mais':'Fim'}
              </button>
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
