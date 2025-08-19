// src/components/Header.tsx
'use client';

import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
      <h1 className="text-lg font-semibold">Dashboard de Vendas</h1>
      <button
        onClick={() => signOut(auth)}
        className="text-sm bg-black text-white px-4 py-2 rounded hover:opacity-80 transition"
      >
        Sair
      </button>
    </header>
  );
}