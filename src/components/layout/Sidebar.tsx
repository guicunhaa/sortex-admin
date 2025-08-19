'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { useAuth } from '@/contexts/AuthContext' // ✅ adicionado

export default function Sidebar() {
  const { user } = useAuth() // ✅ obtém role do usuário
  const path = usePathname()
  const [open, setOpen] = useState(false)

  // ✅ define itens com base na role
  const items = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/numbers',   label: 'Números' },
    { href: '/vendors',   label: 'Vendedores' },
    { href: '/clients',   label: 'Clientes' },
    { href: '/sales',     label: 'Vendas' },
    ...(user?.role === 'admin'
      ? [{ href: '/dashboard/admin/users', label: 'Administração' }]
      : []),
  ]

  function NavItems({ onClick }:{ onClick?: () => void }) {
    return (
      <nav className="space-y-1">
        {items.map((it) => {
          const active = path === it.href
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => onClick?.()}
              className={[
                'block px-3 py-2 rounded-lg transition',
                active
                  ? 'bg-surface text-foreground font-medium'
                  : 'text-muted hover:bg-surface',
              ].join(' ')}
            >
              {it.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <>
      {/* Topbar (Mobile) */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 z-40 glass border-b border-border flex items-center justify-between px-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          type="button"
          className="h-10 w-10 p-0 flex items-center justify-center rounded-lg border border-border hover:brightness-110"
        >
          ☰
        </button>
        <div className="font-medium">SorteX Admin</div>
        <ThemeToggle />
      </div>

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:block fixed inset-y-0 left-0 w-60 px-4 py-5 glass border-r border-border">
        <div className="mb-6 text-foreground font-semibold tracking-wide">
          SorteX Admin
        </div>
        <NavItems />
        <div className="mt-6 pt-3 border-t border-border">
          <ThemeToggle />
        </div>
      </aside>

      {/* Drawer (Mobile) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 p-4 glass border-r border-border shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-semibold">Menu</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                type="button"
                className="h-10 w-10 p-0 flex items-center justify-center rounded-lg border border-border hover:brightness-110"
              >
                ✕
              </button>
            </div>
            <NavItems onClick={() => setOpen(false)} />
            <div className="mt-6">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
