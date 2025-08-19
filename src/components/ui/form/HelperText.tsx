'use client'

import * as React from 'react'

type Props = {
  children: React.ReactNode
  className?: string
  variant?: 'muted' | 'error'
}

export default function HelperText({
  children,
  className = '',
  variant = 'muted',
}: Props) {
  return (
    <p
      className={[
        'mt-1 text-xs',
        variant === 'error' ? 'text-danger' : 'text-muted',
        className,
      ].join(' ')}
    >
      {children}
    </p>
  )
}
