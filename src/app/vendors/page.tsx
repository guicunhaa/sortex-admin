'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import GlassCard from '@/components/ui/GlassCard'
import { useRole } from '@/hooks/useRole'
import { auth, db } from '@/lib/firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'

type Vendor = { id: string; name: string; active?: boolean; email?: string; canCreateGroups?: boolean }

export default function VendorsPage(){
  const role = useRole()
  const [items, setItems] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const snap = await getDocs(query(collection(db, 'vendors'), orderBy('__name__')))
      setItems(snap.docs.map(d => ({
        id: d.id,
        name: (d.data() as any).name ?? d.id,
        active: (d.data() as any).active ?? true,
        canCreateGroups: (d.data() as any).canCreateGroups ?? false,
      })))
      setLoading(false)
    })()
  }, [])

  async function toggleActive(v: Vendor) {
    const t = await auth.currentUser!.getIdToken()
    await fetch('/api/vendors/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ vendorId: v.id, active: !v.active })
    })
    setItems(s => s.map(x => x.id === v.id ? { ...x, active: !v.active } : x))
  }

  async function toggleCanCreateGroups(v: Vendor) {
    const t = await auth.currentUser!.getIdToken()
    await fetch('/api/vendors/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ vendorId: v.id, canCreateGroups: !v.canCreateGroups })
    })
    setItems(s => s.map(x => x.id === v.id ? { ...x, canCreateGroups: !v.canCreateGroups } : x))
  }

  if (role !== 'admin') return <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6 text-muted">Acesso restrito ao admin.</div>

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pt-14 md:pt-0 ml-0 md:ml-60 p-4 sm:p-6">
        <GlassCard className="p-4 mb-4">
          <h1 className="text-foreground text-lg font-semibold">Vendedores</h1>
          <p className="text-muted text-sm">Ative/desative usuários e defina quem pode criar grupos (0..70).</p>
        </GlassCard>

        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-w-full"><div className="inline-block min-w-full align-middle"><table className="min-w-[880px] w-full text-sm border-collapse">
            <thead className="bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/90 sticky top-0 z-10">
              <tr>
                <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">ID</th>
                <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Nome</th>
                <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Status</th>
                <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Pode criar grupos</th>
                <th className="text-left font-medium text-muted px-4 py-3 border-b border-border">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-muted">Carregando…</td></tr>
              ) : items.map(v => (
                <tr key={v.id} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-3">{v.id}</td>
                  <td className="px-4 py-3">{v.name}</td>
                  <td className="px-4 py-3">
                    {v.active ? (
                      <span className="px-2 py-1 rounded text-xs border bg-success/10 text-success border-success/30">Ativo</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs border bg-warning/10 text-warning border-warning/30">Inativo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.canCreateGroups ? (
                      <span className="px-2 py-1 rounded text-xs border bg-brand/10 text-brand border-brand/30">Sim</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs border bg-surface text-muted border-border">Não</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(v)} className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground">
                        {v.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button onClick={() => toggleCanCreateGroups(v)} className="px-3 py-1 rounded border border-border bg-surface hover:brightness-110 text-foreground">
                        {v.canCreateGroups ? 'Revogar grupos' : 'Permitir grupos'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </GlassCard>
      </div>
    </div>
  )
}
