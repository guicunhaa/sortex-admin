'use client'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import Label from '@/components/ui/form/Label'
import Input from '@/components/ui/form/Input'
import Select from '@/components/ui/form/Select'
import HelperText from '@/components/ui/form/HelperText'
import { db } from '@/lib/firebase'
import { auth } from '@/lib/firebase'
import { collection, doc, getDocs, orderBy, query, where, getDoc } from 'firebase/firestore'
import { padNumber } from '@/lib/groups'
import { REGIONS } from '@/lib/regions'

// Estado do formulário — tudo selecionável
const schema = z.object({
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  groupId: z.string().min(1),
  number: z.string().min(1),
  clientId: z.string().min(1), // obrigatório: cliente deve vir da base
  region: z.string().optional(), // no Sub-lote B vira Select com @/lib/regions
  quantity: z.coerce.number().min(1),
  total: z.coerce.number().min(0),
  status: z.enum(['pago','pendente']),
})
type FormData = z.infer<typeof schema>

export default function NewSaleModal({
  open, onClose, onCreated, initialGroupId, initialNumber
}:{
  open:boolean
  onClose:()=>void
  onCreated:()=>void
  initialGroupId?:string|null
  initialNumber?:string|null
}) {
  const { user } = useAuth()
  const [err,setErr] = useState<string|null>(null)
  const [isSubmitting,setSubmitting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState:{errors} } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialGroupId && initialNumber ? {
      groupId: initialGroupId ?? '',
      number: initialNumber ?? '',
      vendorId: user?.uid ?? '',
      vendorName: user?.displayName ?? (user?.email ?? 'Vendedor'),
      total: 0,
      status: 'pago',
      quantity: 1,
      region: '',
      clientId: '',
    } : undefined
  })

  const vendorId = watch('vendorId')
  const groupId = watch('groupId')
  const clientId = watch('clientId')

  useEffect(() => {
    (async () => {
      if (!user?.uid) { setIsAdmin(false); return }
      const tr = await auth.currentUser?.getIdTokenResult?.()
      const claims = (tr?.claims || {}) as any
      setIsAdmin(!!claims.admin || claims.role === 'admin')
    })()
  }, [user?.uid])

  // dados para selects
  const [vendors,setVendors] = useState<{id:string;name:string}[]>([])
  const [groups,setGroups] = useState<{id:string;label?:string|null}[]>([])
  const [clients,setClients] = useState<{id:string;name:string;region?:string|null}[]>([])
  const [numbers,setNumbers] = useState<string[]>([]) // "00".."70"
  const [creatingGroup, setCreatingGroup] = useState(false)

  // helpers para API Admin
  async function loadGroupsAPI(vendorId?: string) {
    const token = await auth.currentUser?.getIdToken()
    const qs = vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''
    const res = await fetch(`/api/groups/list${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_listar_grupos')
    const list = (data.groups as any[]).map((g: any) => ({ id: g.id, label: g.label ?? null }))
    setGroups(list)
    return list
  }

  async function loadNumbersAPI(groupId: string) {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch(`/api/groups/${groupId}/numbers`, { headers: { Authorization: `Bearer ${token}` } })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_listar_numeros')
    const me = auth.currentUser?.uid
    const nums: string[] = (data.numbers as any[])
      .filter((it: any) => it.status === 'available' || (it.status === 'reserved' && it.lock?.by === me))
      .map((it: any) => String(it.id))
    setNumbers(nums)
    return nums
  }

  async function ensureReservedAPI(groupId: string, nId: string) {
    const token = await auth.currentUser?.getIdToken()
    // Checa status primeiro
    const res = await fetch(`/api/groups/${groupId}/numbers`, { headers: { Authorization: `Bearer ${token}` } })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'falha_status_numero')
    const me = auth.currentUser?.uid
    const found = (data.numbers as any[]).find((x: any) => String(x.id) === String(nId))
    if (!found) throw new Error('number_not_found')
    if (found.status === 'available') {
      // reserva
      const res2 = await fetch(`/api/groups/${groupId}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ n: Number(nId) }),
      })
      const ct2 = res2.headers.get('content-type') || ''
      const data2 = ct2.includes('application/json') ? await res2.json() : { ok: false, error: await res2.text() }
      if (!res2.ok || !data2?.ok) throw new Error(data2?.error || 'falha_reservar')
      return true
    }
    if (found.status === 'reserved' && found.lock?.by === me) return true
    throw new Error('number_not_available')
  }

  async function handleCreateGroup() {
    try {
      setErr(null)
      setCreatingGroup(true)
      // Admin pode criar para qualquer vendor selecionado; vendedor cria para si
      const me = auth.currentUser
      const meUid = me?.uid
      const effectiveVendorId = isAdmin ? (vendorId || meUid) : meUid
      if (!effectiveVendorId) {
        throw new Error('missing_vendor')
      }
      const label = window.prompt('Nome do grupo (opcional):') ?? ''
      const token = await me?.getIdToken()
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // só envia vendorId quando admin; vendedor sempre cria para si
          ...(isAdmin ? { vendorId: effectiveVendorId } : {}),
          label: label || null,
        }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'falha_criar_grupo')
      }
      // recarrega lista de grupos para o vendor e seleciona o novo
      await loadGroupsAPI(effectiveVendorId)
      setValue('groupId', data.groupId, { shouldDirty: false })
      try { await loadNumbersAPI(data.groupId) } catch {}
    } catch (e: any) {
      setErr(e?.message || 'Erro ao criar grupo')
    } finally {
      setCreatingGroup(false)
    }
  }

  async function createSale(payload: any) {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch('/api/sales/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'erro')
    return res.json()
  }

  // Para uso quando o modal for aberto do Dashboard (sem reserva prévia):
  // tenta reservar se o número estiver "available"
  async function ensureReserved(groupId: string, nId: string) {
    await ensureReservedAPI(groupId, nId)
  }

  async function onSubmit(data: FormData) {
    setErr(null)
    setSubmitting(true)
    try {
      const nId = padNumber(Number(data.number))
      await ensureReserved(data.groupId, nId)

      await createSale({
        groupId: data.groupId,
        number: nId,
        vendorId: data.vendorId, // importante: admin pode vender por outro vendedor
        vendorName: data.vendorName,
        clientId: data.clientId,
        total: data.total,
        status: data.status,
        quantity: data.quantity,
        region: data.region,
      })
      reset()
      onCreated()
    } catch (e:any) {
      setErr(e.message ?? 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(()=>{
    const c = clients.find(x=>x.id===clientId)
    if (c?.region) setValue('region', c.region, { shouldDirty:false })
  },[clientId, clients, setValue])

  // Carrega vendedores (admin vê todos; vendedor só ele)
  useEffect(()=>{(async()=>{
    if(!user) return
    const meName = user.displayName ?? user.email ?? 'Vendedor'
    if (!isAdmin) {
      // vendedor comum: trava no próprio vendedor
      setVendors([{ id: user.uid, name: meName }])
      setValue('vendorId', user.uid, { shouldDirty:false })
      setValue('vendorName', meName, { shouldDirty:false })
      return
    }
    // admin: carrega todos
    const snap = await getDocs(collection(db,'vendors'))
    const list = snap.docs.map(d=>({id:d.id, name:(d.data() as any).name ?? d.id}))
    setVendors(list)
    if (user?.uid) {
      setValue('vendorId', user.uid, { shouldDirty:false })
      setValue('vendorName', meName, { shouldDirty:false })
    }
  })()},[user, isAdmin, setValue])

  // Prefill vendor para vendedor logado
  useEffect(()=>{ if(user?.uid){ setValue('vendorId', user.uid, { shouldDirty:false }) } },[user?.uid, setValue])

  // Vendor name espelhado
  useEffect(()=>{
    const v = vendors.find(x=>x.id===vendorId)
    if (v) setValue('vendorName', v.name, { shouldDirty:false })
  },[vendorId, vendors, setValue])

  // Carregar grupos do vendor escolhido via API
  useEffect(()=>{(async()=>{
    if(!vendorId) { setGroups([]); return }
    try { await loadGroupsAPI(vendorId) } catch {}
  })()},[vendorId])

  // Carregar clientes do vendor escolhido para Select (com region)
  useEffect(()=>{(async()=>{
    if(!vendorId) return setClients([])
    const qy = query(collection(db,'clients'), where('vendorId','==',vendorId), orderBy('name','asc'))
    const snap = await getDocs(qy)
    setClients(snap.docs.map(d=>({
      id:d.id,
      name:(d.data() as any).name ?? d.id,
      region:(d.data() as any).region ?? null,
    })))
  })()},[vendorId])

  // Carregar números (00..70) do grupo via API — listar apenas "available"
  useEffect(()=>{(async()=>{
    if(!groupId) { setNumbers([]); return }
    try { await loadNumbersAPI(groupId) } catch { setNumbers([]) }
  })()},[groupId])

  // Se o modal for aberto do /numbers, garantimos que o vendor está correto e valores preenchidos, e carregamos números
  useEffect(()=>{(async()=>{
    if(initialGroupId) {
      setValue('groupId', initialGroupId, { shouldDirty:false })
      try { await loadNumbersAPI(initialGroupId) } catch {}
    }
    if(initialNumber) setValue('number', initialNumber, { shouldDirty:false })
  })()},[initialGroupId, initialNumber, setValue])

  return (
    <Modal open={open} onClose={onClose} title="Registrar venda">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Label>Vendedor</Label>
            <Select
              id="vendorId"
              {...register('vendorId')}
              disabled={!isAdmin}
              className={!isAdmin ? 'opacity-70 pointer-events-none' : undefined}
            >
              <option value="">Selecione</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}
            </Select>
            {errors.vendorId && <HelperText variant="error">{String(errors.vendorId.message)}</HelperText>}
          </div>

          <div className="md:col-span-1">
            <div className="flex items-center justify-between">
              <Label>Grupo</Label>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="text-sm text-primary hover:underline disabled:opacity-50"
                aria-label="Criar novo grupo com números 00 a 70"
              >
                {creatingGroup ? 'Criando…' : 'Criar grupo'}
              </button>
            </div>
            <Select id="groupId" {...register('groupId')}>
              <option value="">Selecione</option>
              {groups.length === 0 && <option disabled>Nenhum grupo encontrado</option>}
              {groups.map(g => <option key={g.id} value={g.id}>{g.label ? g.label : g.id}</option>)}
            </Select>
            {errors.groupId && <HelperText variant="error">{String(errors.groupId.message)}</HelperText>}
          </div>

          <div className="md:col-span-1">
            <Label>Número</Label>
            <Select id="number" {...register('number')}>
              <option value="">Selecione</option>
              {numbers.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
            {errors.number && <HelperText variant="error">{String(errors.number.message)}</HelperText>}
          </div>
        </div>

        <div>
          <Label>Cliente</Label>
          <Select id="clientId" {...register('clientId')}>
            <option value="">Selecione</option>
            {clients.length === 0 && <option disabled>Nenhum cliente encontrado</option>}
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {errors.clientId && <HelperText variant="error">{String(errors.clientId.message)}</HelperText>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Qtd</Label>
            <Input id="quantity" type="number" {...register('quantity', { valueAsNumber:true })} error={!!errors.quantity} />
            {errors.quantity && <HelperText variant="error">{String(errors.quantity.message)}</HelperText>}
          </div>
          <div>
            <Label>Total (R$)</Label>
            <Input id="total" type="number" step="0.01" {...register('total', { valueAsNumber:true })} error={!!errors.total} />
            {errors.total && <HelperText variant="error">{String(errors.total.message)}</HelperText>}
          </div>
          <div>
            <Label>Status</Label>
            <Select id="status" {...register('status')}>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
            </Select>
            {errors.status && <HelperText variant="error">{String(errors.status.message)}</HelperText>}
          </div>
        </div>

        <div>
          <Label>Região</Label>
          <Select id="region" {...register('region')}>
            <option value="">Selecione</option>
            {Object.entries(REGIONS).map(([code, meta]) => (
              <option key={code} value={code}>
                {typeof meta === 'string' ? meta : (meta as any)?.label ?? String(code)}
              </option>
            ))}
          </Select>
        </div>

        {err && <p className="text-warning text-sm">{err}</p>}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 text-foreground">Cancelar</button>
          <button disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50 text-foreground">
            {isSubmitting ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
