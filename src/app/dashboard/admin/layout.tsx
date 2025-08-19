import { ReactNode } from 'react'
import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:pl-60">
      {/* Sidebar fixa (oculta em telas pequenas) */}
      <Sidebar />

      {/* Conteúdo com espaço lateral em telas médias+ */}
      <main className="p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
