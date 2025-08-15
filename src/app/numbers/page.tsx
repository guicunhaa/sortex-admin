'use client'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebase'
import {
  collection, getDocs, orderBy, query, doc, updateDoc, Timestamp, where, limit as qlimit,
  DocumentData, getDoc
} from 'firebase/firestore'
import NewSaleModal from '@/components/dashboard/NewSaleModal'
import { auth } from '@/lib/firebase'

const TTL = Number(process.env.NEXT_PUBLIC_RESERVATION_TTL_MS ?? '300000')

type NumDoc = { id: string; status: 'available'|'reserved'|'sold'; lock?: { by: string; until: Date|null } }

export default function NumbersPage() {
  const { user, loading } = useAuth()
  const [nums, setNums] = useState<NumDoc[]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [focus, setFocus] = useState<string | null>(null) // número selecionado
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(id)
  }, [msg])

  const isMine = (n: NumDoc) => n.lock?.by && user?.uid && n.lock.by === user.uid

  function resume(n: string) {
    setFocus(n)
    setOpen(true)
  }

  useEffect(() => {
    if (loading || !user) return
    ;(async () => {
      setLoadingGrid(true)
      // carrega até 1000 docs ordenados pelo ID (0000..0999)
      const snap = await getDocs(query(collection(db, 'numbers'), orderBy('__name__'), qlimit(1000)))
      const list = snap.docs.map(d => {
        const data = d.data() as DocumentData
        const until = data?.lock?.until?.toDate?.() ?? null
        return { id: d.id, status: data.status, lock: data.lock ? { by: data.lock.by, until } : undefined } as NumDoc
      })
      setNums(list)
      setLoadingGrid(false)
    })()
  }, [loading, user])

  async function reserve(n: string) {
    if (!user) return
    if (busy[n]) return
    setBusy(b => ({ ...b, [n]: true }))
    try {
      // checa se vendedor está ativo
      const v = await getDoc(doc(db, 'vendors', user.uid))
      const active = v.exists() ? (v.data() as any).active !== false : true
      if (!active) {
        setMsg('Seu usuário está inativo. Fale com o admin.')
        return
      }
      const until = new Date(Date.now() + TTL)
      await updateDoc(doc(db, 'numbers', n), {
        status: 'reserved',
        lock: { by: user.uid, until: Timestamp.fromDate(until) },
        updatedAt: new Date(),
      })
      setNums(s => s.map(x => x.id === n ? { ...x, status: 'reserved', lock: { by: user.uid, until } } : x))
      setFocus(n); setOpen(true)
    } catch (e: any) {
      setMsg(e?.message ?? 'Não foi possível reservar. Tente novamente.')
    } finally {
      setBusy(b => ({ ...b, [n]: false }))
    }
  }

  async function cancelReserve(n: string) {
    if (!user) return
    if (busy[n]) return
    setBusy(b => ({ ...b, [n]: true }))
    try {
      await updateDoc(doc(db, 'numbers', n), { status: 'available', lock: null, updatedAt: new Date() })
      setNums(s => s.map(x => x.id === n ? { ...x, status: 'available', lock: undefined } : x))
      if (focus === n) setFocus(null)
      setOpen(false)
    } catch (e: any) {
      setMsg(e?.message ?? 'Não foi possível cancelar a reserva.')
    } finally {
      setBusy(b => ({ ...b, [n]: false }))
    }
  }

  async function onCreated() {
    // depois da venda, atualiza o item pra sold
    if (!focus) return
    setNums(s => s.map(x => x.id === focus ? { ...x, status: 'sold', lock: undefined } : x))
    setOpen(false)
    setFocus(null)
  }

  const palette = { available: 'bg-surface text-foreground border border-border', reserved: 'bg-warning/10 text-warning border border-warning/30', sold: 'bg-success/10 text-success border border-success/30' }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6">
        <GlassCard className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-foreground text-lg font-semibold">Números</h1>
              <p className="text-muted text-sm">Clique em um número disponível para reservar e vender.</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          {msg && <div className="mb-3 text-warning text-sm" role="status" aria-live="polite">{msg}</div>}
          {loadingGrid ? (
            <div className="text-muted">Carregando…</div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2" role="list" aria-label="Grade de números" aria-busy={loadingGrid}>
              {nums.map(n => {
                const mine = isMine(n)
                if (n.status === 'available') {
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="listitem"
                      data-status="available"
                      aria-label={`Número ${n.id} disponível. Reservar`}
                      disabled={!!busy[n.id]}
                      aria-disabled={!!busy[n.id]}
                      className="h-9 rounded-lg text-sm bg-surface text-foreground border border-border hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => reserve(n.id)}
                      title="Disponível"
                    >
                      {n.id}
                    </button>
                  )
                }
                if (n.status === 'reserved') {
                  const left = n.lock?.until ? Math.max(0, Math.floor((+n.lock.until - Date.now())/1000)) : 0
                  const mm = String(Math.floor(left/60)).padStart(2,'0')
                  const ss = String(left%60).padStart(2,'0')
                  return mine ? (
                    <div key={n.id} role="listitem" data-status="reserved-mine" className="h-9 flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Número ${n.id} reservado por você. Continuar venda`}
                        disabled={!!busy[n.id]}
                        aria-disabled={!!busy[n.id]}
                        className="flex-1 h-full rounded-lg text-sm bg-warning/10 text-warning border border-warning/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => resume(n.id)}
                        title="Sua reserva — continuar venda"
                      >
                        {n.id}
                        {n.lock?.until && (
                          <span id={`cd-${n.id}`} className="ml-2 text-[10px] opacity-70" aria-live="polite">{mm}:{ss}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancelar reserva do número ${n.id}`}
                        disabled={!!busy[n.id]}
                        aria-disabled={!!busy[n.id]}
                        className="h-full px-2 rounded-lg text-xs border border-border bg-surface hover:brightness-110 text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => cancelReserve(n.id)}
                        title="Cancelar reserva"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      key={n.id}
                      type="button"
                      role="listitem"
                      data-status="reserved-other"
                      aria-label={`Número ${n.id} reservado por outro vendedor`}
                      className="h-9 rounded-lg text-sm bg-warning/10 text-warning border border-warning/30 opacity-60 cursor-not-allowed"
                      title="Reservado por outro vendedor"
                      disabled
                    >
                      {n.id}
                    </button>
                  )
                }
                // sold
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="listitem"
                    data-status="sold"
                    aria-label={`Número ${n.id} vendido`}
                    className="h-9 rounded-lg text-sm bg-success/10 text-success border border-success/30 cursor-default"
                    title="Vendido"
                    disabled
                  >
                    {n.id}
                  </button>
                )
              })}
            </div>
          )}
        </GlassCard>

        {/* Modal de venda */}
        <NewSaleModal
          open={open}
          onClose={() => { if (focus) cancelReserve(focus) }}
          onCreated={onCreated}
          initialNumber={focus ?? undefined}
          createSale={async (payload) => {
            const token = await auth.currentUser?.getIdToken()
            const res = await fetch('/api/sales/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error((await res.json()).error || 'erro')
            return res.json()
          }}
        />
      </div>
    </div>
  )
}
