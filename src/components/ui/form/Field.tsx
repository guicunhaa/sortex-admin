'use client'

import * as React from 'react'
import Label from './Label'
import HelperText from './HelperText'

type Props = {
  label?: string
  htmlFor?: string
  helperText?: string
  errorText?: string
  className?: string
  children: React.ReactNode
}

export default function Field({
  label,
  htmlFor,
  helperText,
  errorText,
  className = '',
  children,
}: Props) {
  return (
    <div className={['space-y-1.5', className].join(' ')}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {errorText ? (
        <HelperText variant="error">{errorText}</HelperText>
      ) : helperText ? (
        <HelperText>{helperText}</HelperText>
      ) : null}
    </div>
  )
}
