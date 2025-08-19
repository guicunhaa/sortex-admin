'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { auth as clientAuth } from '@/lib/firebase'

interface User {
  uid: string
  email: string
  role: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newRole, setNewRole] = useState('vendor')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const token = await clientAuth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const data = await res.json()
      if (!res.ok || !data?.users) throw new Error(data?.error || 'Erro ao carregar usuários.')
      setUsers(data.users)
      const initialRoles: Record<string, string> = {}
      data.users.forEach((u: User) => {
        const r = (u.role === 'admin' || u.role === 'vendor') ? u.role : 'vendor'
        initialRoles[u.uid] = r
      })
      setRoles(initialRoles)
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar usuários.')
    }
  }

  function handleRoleChange(uid: string, newRole: string) {
    setRoles(prev => ({ ...prev, [uid]: newRole }))
  }

  async function saveRole(uid: string) {
    try {
      const role = roles[uid]
      if (!role) return toast.error('Selecione uma role.')
      const token = await clientAuth.currentUser?.getIdToken()
      if (!token) return toast.error('Sessão expirada. Faça login novamente.')
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, role }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erro ao salvar permissão.')
      toast.success('Permissão atualizada.')
      await loadUsers()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar permissão.')
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)

    try {
      const token = await clientAuth.currentUser?.getIdToken()
      if (!token) { toast.error('Sessão expirada. Faça login novamente.'); setCreating(false); return }

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password, role: newRole }),
      })

      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erro ao criar usuário')

      toast.success('Usuário criado com sucesso!')
      setEmail('')
      setPassword('')
      setNewRole('vendor')
      await loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Erro desconhecido')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteUser(uid: string) {
    try {
      const token = await clientAuth.currentUser?.getIdToken()
      if (!token) return toast.error('Sessão expirada. Faça login novamente.')
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erro ao deletar usuário.')
      toast.success('Usuário removido.')
      await loadUsers()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao deletar usuário.')
    }
  }

  return (
    <main className="flex flex-col gap-8 p-6 md:p-10 max-w-6xl mx-auto">
      <section>
        <h1 className="text-3xl font-bold text-foreground">Administração</h1>
        <p className="text-muted-foreground">
          Gerencie permissões e cadastros de usuários.
        </p>
      </section>

      <form
        onSubmit={handleCreateUser}
        className="border rounded p-4 space-y-3 bg-background max-w-lg w-full"
      >
        <h2 className="font-semibold text-lg">Adicionar novo usuário</h2>

        <input
          type="email"
          placeholder="E-mail"
          className="w-full p-2 border rounded bg-background text-foreground"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Senha"
          className="w-full p-2 border rounded bg-background text-foreground"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        <select
          value={newRole}
          onChange={e => setNewRole(e.target.value)}
          className="w-full p-2 border rounded bg-background text-foreground"
        >
          <option value="vendor">vendor</option>
          <option value="admin">admin</option>
        </select>

        <Button type="submit" disabled={creating}>
          {creating ? 'Criando...' : 'Criar usuário'}
        </Button>
      </form>

      <section className="grid md:grid-cols-2 gap-4">
        {users.length === 0 ? (
          <p className="text-muted-foreground col-span-2">Nenhum usuário encontrado.</p>
        ) : (
          users.map((u) => (
            <Card key={u.uid}>
              <CardContent className="p-4 space-y-2">
                <div className="font-medium text-foreground">{u.email}</div>
                <div className="flex items-center gap-2">
                  <select
                    value={roles[u.uid]}
                    onChange={(e) => handleRoleChange(u.uid, e.target.value)}
                    className="border rounded px-2 py-1 bg-background text-sm text-foreground"
                  >
                    <option value="admin">admin</option>
                    <option value="vendor">vendor</option>
                  </select>
                  <Button onClick={() => saveRole(u.uid)} size="sm">
                    Salvar
                  </Button>
                  <Button variant="destructive" onClick={() => handleDeleteUser(u.uid)} size="sm">
                    Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  )
}
