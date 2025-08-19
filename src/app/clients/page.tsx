'use client'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { auth, db } from '@/lib/firebase'
import { addDoc, collection, doc, getDocs, limit, orderBy, query, setDoc, startAfter, updateDoc, where, type DocumentSnapshot } from 'firebase/firestore'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import Label from '@/components/ui/form/Label'
import Input from '@/components/ui/form/Input'
import Select from '@/components/ui/form/Select'
import { REGIONS, regionLabel } from '@/lib/regions'

// Padroniza opções de região a partir de REGIONS (mantemos consistência com dashboard)
const REGION_OPTIONS = (Array.isArray(REGIONS) ? REGIONS : []).map((r: any) => ({
  value: r.code ?? r.value ?? r,
  label: r.label ?? r.name ?? String(r),
}))

type Client = { id: string; name: string; email?: string; phone?: string; cpf?: string; region?: string; vendorId: string; createdAt?: any }

export default function ClientsPage() {
  const { user } = useAuth()
  const role = useRole()
  const [list, setList] = useState<Client[]>([])
  const [vendorFilter, setVendorFilter] = useState<string>('')
  const [vendors, setVendors] = useState<{id:string; name:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<DocumentSnapshot | undefined>()
  const [hasMore, setHasMore] = useState(true)

  const myVendorId = user?.uid ?? ''
  const effectiveVendor = role === 'admin' ? (vendorFilter || '') : myVendorId

  // carrega vendors para filtro (admin)
  useEffect(() => {
    if (role !== 'admin') return
    ;(async () => {
      const snap = await getDocs(query(collection(db, 'vendors'), orderBy('__name__')))
      setVendors(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name ?? d.id })))
    })()
  }, [role])

  // primeira página
  useEffect(() => {
    if (!user) return
    ;(async () => {
      setLoading(true)
      const col = collection(db, 'clients')
      const clauses:any[] = [orderBy('name'), limit(25)]
      if (effectiveVendor) clauses.unshift(where('vendorId','==', effectiveVendor))
      const snap = await getDocs(query(col, ...clauses))
      setList(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })))
      setCursor(snap.docs.length ? snap.docs[snap.docs.length-1] : undefined)
      setHasMore(snap.docs.length === 25)
      setLoading(false)
    })()
  }, [effectiveVendor, user?.uid])

  async function loadMore(){
    if(!cursor) return
    const col = collection(db, 'clients')
    const clauses:any[] = [orderBy('name'), startAfter(cursor), limit(25)]
    if (effectiveVendor) clauses.unshift(where('vendorId','==', effectiveVendor))
    const snap = await getDocs(query(col, ...clauses))
    setList(prev => [...prev, ...snap.docs.map(d => ({ id:d.id, ...(d.data() as any) }))])
    setCursor(snap.docs.length ? snap.docs[snap.docs.length-1] : undefined)
    setHasMore(snap.docs.length === 25)
  }

  // criar/editar
  const [openCE, setOpenCE] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  function openCreate() { setEditing(null); setOpenCE(true) }
  function openEdit(c: Client) { setEditing(c); setOpenCE(true) }

  async function saveClient(form: Partial<Client>) {
    if (!user) return
    // região obrigatória
    if (!form.region) return

    if (editing) {
      await updateDoc(doc(db,'clients', editing.id), {
        name: form.name, email: form.email || null, phone: form.phone || null, cpf: form.cpf || null, region: form.region || null, updatedAt: new Date()
      } as any)
      setList(s => s.map(x => x.id===editing.id ? { ...x, ...form } as Client : x))
    } else {
      const payload = {
        name: form.name, email: form.email || null, phone: form.phone || null, cpf: form.cpf || null, region: form.region || null,
        vendorId: myVendorId, createdAt: new Date()
      }
      const ref = await addDoc(collection(db,'clients'), payload as any)
      setList(s => [{ id: ref.id, ...(payload as any) }, ...s])
    }
    setOpenCE(false)
  }

  // mover cliente — pede senha admin e executa rota segura
  const [openMove, setOpenMove] = useState(false)
  const [targetClient, setTargetClient] = useState<Client | null>(null)
  function askMove(c: Client) { setTargetClient(c); setOpenMove(true) }

  async function doMove(newVendorId: string, adminEmail: string, adminPassword: string) {
    // reautentica admin
    const cred = EmailAuthProvider.credential(adminEmail, adminPassword)
    await reauthenticateWithCredential(auth.currentUser!, cred)

    const token = await auth.currentUser!.getIdToken(true)
    const res = await fetch('/api/clients/reassign', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({ clientId: targetClient!.id, newVendorId })
    })
    if(!res.ok) throw new Error((await res.json()).error || 'fail')
    // reflete na UI
    setList(s => s.filter(x => x.id !== targetClient!.id)) // sai da lista do vendor atual
    setOpenMove(false)
    setTargetClient(null)
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6">
        {/* Header */}
        <GlassCard className="p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-foreground text-lg font-semibold">Clientes</h1>
              <p className="text-muted text-sm">Base de clientes por vendedor.</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
              {role==='admin' && (
                <select value={vendorFilter} onChange={e=>setVendorFilter(e.target.value)} aria-label="Filtrar por vendedor"
                  className="w-full sm:w-64 shrink-0 rounded bg-surface border border-border px-3 py-2 text-sm focus:ring-2 ring-brand">
                  <option value="">Todos os vendedores</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              <button onClick={openCreate} className="px-4 py-2 rounded border border-border bg-surface hover:brightness-110 text-foreground whitespace-nowrap shrink-0 min-w-[140px]">+ Novo cliente</button>
            </div>
          </div>
        </GlassCard>

        {/* Tabela */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-w-full" aria-busy={loading}><div className="inline-block min-w-full align-middle"><table className="min-w-[960px] w-full text-sm border-collapse">
                <caption className="sr-only">Tabela de clientes por vendedor, com paginação</caption>
            <thead className="bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-10">
              <tr>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Nome</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Email</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Telefone</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">CPF</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Região</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Vendedor</th>
                <th scope="col" className="text-left font-medium text-muted px-4 py-3 border-b border-border">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-muted">Carregando…</td></tr>
              ) : list.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">{c.email || '-'}</td>
                  <td className="px-4 py-3">{c.phone || '-'}</td>
                  <td className="px-4 py-3">{c.cpf || '-'}</td>
                  <td className="px-4 py-3">{c.region ? regionLabel(c.region) : '-'}</td>
                  <td className="px-4 py-3">{c.vendorId}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={()=>openEdit(c)} aria-label={`Editar cliente ${c.name}`} className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground">Editar</button>
                      {role==='admin' && <button onClick={()=>askMove(c)} aria-label={`Mover cliente ${c.name} para outro vendedor`} className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground">Mover</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-xs text-muted" aria-live="polite">{list.length} registro(s)</div>
            <button
              disabled={!hasMore}
              onClick={loadMore}
              aria-label={hasMore ? 'Carregar mais clientes' : 'Fim da lista'}
              className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground disabled:opacity-50"
            >
              Carregar mais
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Modal Criar/Editar */}
      <ClientEditModal
        open={openCE}
        onClose={()=>setOpenCE(false)}
        initial={editing || undefined}
        onSave={saveClient}
      />

      {/* Modal Mover (admin) */}
      {role==='admin' && (
        <ReassignModal
          open={openMove}
          onClose={()=>{ setOpenMove(false); setTargetClient(null) }}
          client={targetClient || undefined}
          onConfirm={doMove}
        />
      )}
    </div>
  )
}

/* ———— Componentes internos ———— */

function ClientEditModal({ open, onClose, initial, onSave }:{
  open:boolean; onClose:()=>void; initial?:Client; onSave:(f:Partial<Client>)=>Promise<void>
}) {
  const [name,setName]=useState(initial?.name||'')
  const [email,setEmail]=useState(initial?.email||'')
  const [phone,setPhone]=useState(initial?.phone||'')
  const [cpf,setCpf]=useState(initial?.cpf||'')
  const [region,setRegion]=useState(initial?.region||'')
  useEffect(()=>{ setName(initial?.name||''); setEmail(initial?.email||''); setPhone(initial?.phone||''); setCpf(initial?.cpf||''); setRegion(initial?.region||'') },[initial,open])

  const canSave = Boolean(name.trim()) && Boolean(region)

  return (
    <Modal open={open} onClose={onClose} title={initial?'Editar cliente':'Novo cliente'}>
      <div className="space-y-3">
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome" />
        </div>
        <div>
          <Label>Email (opcional)</Label>
          <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email (opcional)" />
        </div>
        <div>
          <Label>Telefone (opcional)</Label>
          <Input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Telefone (opcional)" />
        </div>
        <div>
          <Label>CPF (opcional)</Label>
          <Input value={cpf} onChange={e=>setCpf(e.target.value)} placeholder="CPF (opcional)" />
        </div>
        <div>
          <Label>Região</Label>
          <Select value={region} onChange={e=>setRegion(e.target.value)} aria-label="Selecionar região" required>
            <option value="">Selecione a região</option>
            {REGION_OPTIONS.map(o => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </Select>
          {!region && <p className="text-xs text-warning/80 mt-1">Selecione a região (obrigatório).</p>}
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-border bg-surface hover:brightness-110 text-foreground">Cancelar</button>
          <button onClick={()=>onSave({ name, email, phone, cpf, region })} disabled={!canSave}
            className="px-4 py-2 rounded border border-border bg-surface hover:brightness-110 text-foreground disabled:opacity-50">
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ReassignModal({ open, onClose, client, onConfirm }:{
  open:boolean; onClose:()=>void; client?:Client; onConfirm:(newVendorId:string, adminEmail:string, adminPassword:string)=>Promise<void>
}) {
  const [newVendor,setNewVendor]=useState('')
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [err,setErr]=useState<string|null>(null)
  useEffect(()=>{ setNewVendor(''); setEmail(''); setPass(''); setErr(null) },[open])

  async function go(){
    try {
      setErr(null)
      await onConfirm(newVendor, email, pass)
      onClose()
    } catch(e:any){ setErr(e.message||'Erro') }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Mover cliente${client? `: ${client.name}`:''}`}>
      <div className="space-y-3">
        <div>
          <Label>Novo vendorId (UID do vendedor)</Label>
          <Input value={newVendor} onChange={e=>setNewVendor(e.target.value)} placeholder="Novo vendorId (UID do vendedor)" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Email do admin</Label>
            <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email do admin" />
          </div>
          <div>
            <Label>Senha do admin</Label>
            <Input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Senha do admin" />
          </div>
        </div>
        {err && <p className="text-warning text-sm">{err}</p>}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-border bg-surface hover:brightness-110 text-foreground">Cancelar</button>
          <button onClick={go} className="px-4 py-2 rounded border border-border bg-surface hover:brightness-110 text-foreground">Confirmar</button>
        </div>
      </div>
    </Modal>
  )
}
