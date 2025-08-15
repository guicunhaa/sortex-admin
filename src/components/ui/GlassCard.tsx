'use client'

import * as React from 'react'

type Props = React.PropsWithChildren<{
  className?: string
  as?: keyof JSX.IntrinsicElements
}>

export default function GlassCard({
  className = '',
  as: Tag = 'div',
  children,
}: Props) {
  return (
    <Tag
      className={
        'glass rounded-xl2 border border-border ring-1 ring-brand shadow-glass ' +
        className
      }
    >
      {children}
    </Tag>
  )
}