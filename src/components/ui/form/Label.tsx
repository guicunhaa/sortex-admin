'use client'

import * as React from 'react'

type Props = React.ComponentProps<'label'>

export default function Label({ className = '', ...props }: Props) {
  return (
    <label
      {...props}
      className={['block text-xs text-muted mb-1', className].join(' ')}
    />
  )
}
