// src/components/Header.tsx
'use client';

import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Header() {
  return (
    <header className="px-6 py-4 flex justify-between items-center">
      <h1 className="text-lg font-semibold">Dashboard de Vendas</h1>
      <button
        onClick={() => signOut(auth)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:brightness-110 text-foreground"
      >
        Sair
      </button>
    </header>
  )
}