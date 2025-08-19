'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = (resolvedTheme ?? theme) === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-surface transition"
      aria-label="Alternar tema claro/escuro"
      title="Tema"
      type="button"
    >
      <span className="text-sm text-muted">{isDark ? 'Dark' : 'Light'}</span>
      <span className="text-lg" aria-hidden>{isDark ? '🌙' : '☀️'}</span>
    </button>
  )
}