'use client'

import { useEffect, useRef } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** Se quiser focar um input específico ao abrir, passe o ref aqui */
  initialFocusRef?: React.RefObject<HTMLElement>
}

export default function Modal({
  open,
  onClose,
  title = 'Modal',
  children,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = 'modal-title'
  const descId = 'modal-desc'

  // Fecha com ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      // Trap de TAB básico
      if (e.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll<HTMLElement>(
          'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null

        if (e.shiftKey) {
          // shift+tab
          if (active === first || !root.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // tab
          if (active === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', onKey)
      // guarda foco anterior e foca o modal (ou ref inicial)
      previouslyFocused.current = document.activeElement as HTMLElement | null
      setTimeout(() => {
        const el = initialFocusRef?.current || dialogRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        el?.focus()
      }, 0)
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      // restaura foco anterior
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose, initialFocusRef])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-3xl"
        onClick={onClose}
        aria-hidden
      />
      {/* DIALOG */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="glass w-full max-w-lg rounded-xl2 border border-border ring-1 ring-brand shadow-glass outline-none"
          tabIndex={-1}
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 id={titleId} className="text-foreground font-medium">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground"
              aria-label="Fechar modal"
              type="button"
            >
              ✕
            </button>
          </div>
          <div id={descId} className="p-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}