'use client'

import * as React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean
}

const base =
  'w-full rounded bg-surface border px-3 py-2 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed'
const normal = 'border-border focus:ring-2 ring-brand'
const danger = 'border-danger/50 focus:ring-2 focus:ring-danger'

const Input = React.forwardRef<HTMLInputElement, Props>(
  ({ className = '', error = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        {...props}
        className={[base, error ? danger : normal, className].join(' ')}
      />
    )
  }
)

Input.displayName = 'Input'
export default Input
