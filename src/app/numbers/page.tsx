'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import { useAuth } from '@/contexts/AuthContext'
import { db, auth } from '@/lib/firebase'
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  where,
  getDoc,
} from 'firebase/firestore'
import NewSaleModal from '@/components/dashboard/NewSaleModal'
import Modal from '@/components/ui/Modal'
import Label from '@/components/ui/form/Label'
import Input from '@/components/ui/form/Input'
import Select from '@/components/ui/form/Select'

const TTL = Number(process.env.NEXT_PUBLIC_RESERVATION_TTL_MS ?? '300000')

type NumDoc = {
  id: string
  status: 'available' | 'reserved' | 'sold'
  lock?: { by: string; until: Date | null }
  canceled?: boolean
}

type VendorOpt = { id: string; name: string }

export default function NumbersPage() {
  const { user, loading } = useAuth()

  const [groupId, setGroupId] = useState<string>('')
  const [groups, setGroups] = useState<{ id: string; label?: string | null }[]>([])

  const [nums, setNums] = useState<NumDoc[]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [focus, setFocus] = useState<string | null>(null) // número selecionado
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  // permissões
  const [isAdmin, setIsAdmin] = useState(false)
  const [canCreateGroups, setCanCreateGroups] = useState(false)
  const [openCreate, setOpenCreate] = useState(false)
  const [vendors, setVendors] = useState<VendorOpt[]>([])

  // tick de 1s para countdown — pausado com modais abertos para não roubar foco
  useEffect(() => {
    if (open || openCreate) return
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [open, openCreate])

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

  // Carrega grupos via API (Admin SDK), ignorando regras/índices do client
  async function loadGroups() {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch('/api/groups/list', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_listar_grupos')
    const list = (data.groups as any[]).map((g: any) => ({ id: g.id, label: g.label ?? null }))
    setGroups(list)
    if (!groupId && list.length) setGroupId(list[0].id)
  }

  // Carrega números do grupo via API (Admin SDK)
  async function loadNumbers(gid: string) {
    if (!gid) return
    setLoadingGrid(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/groups/${gid}/numbers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_listar_numeros')
      const list: NumDoc[] = (data.numbers as any[]).map((it: any) => ({
        id: String(it.id),
        status: it.status,
        canceled: !!it.canceled,
        lock: it.lock
          ? {
              by: it.lock.by,
              until: typeof it.lock.untilMs === 'number' ? new Date(it.lock.untilMs) : null,
            }
          : undefined,
      }))
      list.sort((a, b) => Number(a.id) - Number(b.id))
      setNums(list)
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar números')
      setNums([])
    } finally {
      setLoadingGrid(false)
    }
  }

  // Descobre papel/permissões e carrega vendors + grupos (com fallback de índice)
  useEffect(() => {
    ;(async () => {
      if (loading || !user) return

      const token = await auth.currentUser?.getIdTokenResult()
      const admin = token?.claims?.role === 'admin'
      setIsAdmin(!!admin)

      if (admin) {
        setCanCreateGroups(true)
        const vs = await getDocs(query(collection(db, 'vendors'), orderBy('name', 'asc')))
        setVendors(vs.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? d.id })))
      } else {
        const v = await getDoc(doc(db, 'vendors', user.uid))
        setCanCreateGroups(Boolean(v.exists() && (v.data() as any)?.canCreateGroups))
      }

      // Carrega grupos via API (Admin SDK) -> ignora regras/índices no cliente
      await loadGroups()
    })()
  }, [loading, user?.uid])

  // Carregar números do grupo (via API)
  useEffect(() => {
    if (!groupId || !user) return
    loadNumbers(groupId)
      .catch((err) => setMsg(String(err?.message || err)))
  }, [groupId, user?.uid])

  async function reserve(n: string) {
    if (!user || !groupId) return
    if (busy[n]) return
    setBusy((b) => ({ ...b, [n]: true }))
    try {
      // checa se vendedor está ativo
      const v = await getDoc(doc(db, 'vendors', user.uid))
      const active = v.exists() ? (v.data() as any).active !== false : true
      if (!active) throw new Error('vendor_inactive')

      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/groups/${groupId}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ n: Number(n) }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_alterar_numero')

      // Atualiza UI conforme retorno
      if (data.status === 'reserved') {
        setNums((s) =>
          s.map((x) =>
            x.id === n
              ? {
                  ...x,
                  status: 'reserved',
                  lock: { by: user.uid, until: data.lock?.untilMs ? new Date(data.lock.untilMs) : null },
                }
              : x
          )
        )
        resume(n)
      } else if (data.status === 'available') {
        setNums((s) => s.map((x) => (x.id === n ? { ...x, status: 'available', lock: undefined } : x)))
      }
    } catch (e: any) {
      setMsg(e?.message ?? 'Não foi possível reservar.')
    } finally {
      setBusy((b) => ({ ...b, [n]: false }))
    }
  }

  async function cancelReserve(n: string) {
    if (!user || !groupId) return
    if (busy[n]) return
    setBusy((b) => ({ ...b, [n]: true }))
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/groups/${groupId}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ n: Number(n) }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_liberar_numero')

      if (data.status === 'available') {
        setNums((s) => s.map((x) => (x.id === n ? { ...x, status: 'available', lock: undefined } : x)))
      }
      setOpen(false)
      setFocus(null)
    } catch (e: any) {
      setMsg(e?.message ?? 'Não foi possível cancelar a reserva.')
    } finally {
      setBusy((b) => ({ ...b, [n]: false }))
    }
  }

  async function onCreated() {
    if (!focus) return
    setNums((s) => s.map((x) => (x.id === focus ? { ...x, status: 'sold', lock: undefined, canceled: false } : x)))
    setOpen(false)
    setFocus(null)
  }

  async function createGroup({ vendorId, label }: { vendorId?: string; label?: string }) {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ vendorId: isAdmin ? vendorId : undefined, label: label || null }),
    })

    // Lê resposta com segurança (pode vir HTML em caso de 500 do Next)
    const ct = res.headers.get('content-type') || ''
    let payload: any = null
    try {
      payload = ct.includes('application/json') ? await res.json() : { error: await res.text() }
    } catch (e) {
      payload = { error: 'invalid_response' }
    }

    if (!res.ok || !payload?.ok) {
      throw new Error(payload?.error || 'erro_ao_criar_grupo')
    }

    const newId = payload.groupId as string
    await loadGroups()
    setGroupId(newId)
    setMsg('Grupo criado com sucesso.')
  }

  const palette = {
    available: 'bg-surface text-foreground border border-border hover:brightness-110',
    availableCanceled: 'bg-warning/5 text-warning border border-warning/40 hover:brightness-110',
    reserved: 'bg-warning/10 text-warning border border-warning/30',
    sold: 'bg-success/10 text-success border border-success/30 cursor-default',
  }

  return (
    <div className="min-h-screen">
      <Sidebar />

      <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6">
        <GlassCard className="p-4 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-foreground text-lg font-semibold">Números</h1>
              <p className="text-muted text-sm">Selecione um grupo (0..70 por grupo)</p>
              <div className="mt-3">
                <label className="text-sm text-muted">Grupo</label>
                <select
                  className="mt-1 h-10 rounded-lg border border-border bg-surface px-3 text-foreground"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label ? g.label : g.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(isAdmin || canCreateGroups) && (
              <div className="shrink-0">
                <button
                  onClick={() => setOpenCreate(true)}
                  className="mt-6 rounded-lg px-4 py-2 border border-border bg-surface hover:brightness-110 text-foreground text-sm"
                >
                  + Criar grupo (0..70)
                </button>
              </div>
            )}
          </div>
        </GlassCard>

        {msg && (
          <div
            className="mb-4 rounded-lg border border-warning/30 bg-warning/10 text-warning px-4 py-2"
            role="status"
            aria-live="polite"
          >
            {msg}
          </div>
        )}

        <GlassCard className="p-0 overflow-hidden">
          {loadingGrid ? (
            <div className="px-4 py-6 text-muted">Carregando…</div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-10 text-muted">Nenhum grupo encontrado. Crie um grupo para começar.</div>
          ) : (
            <div
              className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-4 select-none"
              role="list"
              aria-label="Grades de números do grupo selecionado"
            >
              {nums.map((n) => {
                const left = n.lock?.until
                  ? Math.max(0, Math.floor(((n.lock.until as any).getTime?.() ?? (n.lock.until as any)) - Date.now()) / 1000)
                  : 0
                const mm = String(Math.floor(left / 60)).padStart(2, '0')
                const ss = String(left % 60).padStart(2, '0')

                if (n.status === 'available') {
                  const cls = n.canceled ? palette.availableCanceled : palette.available
                  return (
                    <button
                      key={n.id}
                      onClick={() => reserve(n.id)}
                      disabled={!!busy[n.id]}
                      className={`${cls} relative rounded-lg py-4 md:py-5 text-base md:text-lg font-medium transition`}
                      aria-label={`Número ${n.id} disponível${n.canceled ? ' (cancelado nesta rodada)' : ''}`}
                    >
                      {n.id}
                    </button>
                  )
                }
                if (n.status === 'reserved') {
                  const mine = isMine(n)
                  return (
                    <button
                      key={n.id}
                      onClick={() => (mine ? resume(n.id) : undefined)}
                      disabled={!mine || !!busy[n.id]}
                      className={`${
                        palette.reserved
                      } relative rounded-lg py-4 md:py-5 text-base md:text-lg font-medium transition ${mine ? '' : 'opacity-60 cursor-not-allowed'}`}
                      aria-label={`Número ${n.id} reservado ${mine ? 'por você' : 'por outro vendedor'}`}
                    >
                      {n.id}
                      <span className="ml-2 text-[10px] opacity-70" aria-live="polite">
                        {mm}:{ss}
                      </span>
                    </button>
                  )
                }
                return (
                  <button
                    key={n.id}
                    className={`${palette.sold} relative rounded-lg py-4 md:py-5 text-base md:text-lg font-medium`}
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
          onClose={() => {
            if (focus) cancelReserve(focus)
          }}
          onCreated={onCreated}
          initialGroupId={groupId}
          initialNumber={focus}
        />

        {/* Modal Criar Grupo */}
        {(isAdmin || canCreateGroups) && (
          <CreateGroupModal
            open={openCreate}
            onClose={() => setOpenCreate(false)}
            isAdmin={isAdmin}
            vendors={vendors}
            onCreate={createGroup}
          />
        )}
      </div>
    </div>
  )
}

function CreateGroupModal({
  open,
  onClose,
  isAdmin,
  vendors,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  isAdmin: boolean
  vendors: VendorOpt[]
  onCreate: (p: { vendorId?: string; label?: string }) => Promise<void>
}) {
  const [vendorId, setVendorId] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setVendorId('')
    setLabel('')
    setErr(null)
  }, [open])

  async function go() {
    try {
      setSaving(true)
      setErr(null)
      await onCreate({ vendorId: isAdmin ? vendorId : undefined, label })
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Erro ao criar grupo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Criar grupo (0..70)">
      <div className="space-y-3" onMouseDown={(e) => e.stopPropagation()}>
        {isAdmin && (
          <div>
            <Label>Vendedor</Label>
            <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
              <option value="">Selecione</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.id})
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>Label (opcional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Ex.: Grupo 2"
          />
        </div>

        {err && <p className="text-warning text-sm">{err}</p>}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={go}
            disabled={saving || (isAdmin && !vendorId)}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50 text-foreground"
          >
            {saving ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
