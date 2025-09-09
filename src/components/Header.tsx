// src/components/Header.tsx
'use client';

import LogoutButton from './LogoutButton'

export default function Header() {
  return (
    <header className="px-6 py-4 flex justify-between items-center">
      <h1 className="text-lg font-semibold">Dashboard de Vendas</h1>
      <div className="flex items-center gap-2">
        <LogoutButton className="text-foreground/80 hover:text-foreground" />
      </div>
    </header>
  )
}