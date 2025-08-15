'use client'

import * as React from 'react'

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean
}

const base =
  'w-full rounded bg-surface border px-3 py-2 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed'
const normal = 'border-border focus:ring-2 ring-brand'
const danger = 'border-danger/50 focus:ring-2 focus:ring-danger'

const Select = React.forwardRef<HTMLSelectElement, Props>(
  ({ className = '', error = false, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        {...props}
        className={[base, error ? danger : normal, className].join(' ')}
      >
        {children}
      </select>
    )
  }
)

Select.displayName = 'Select'
export default Select
