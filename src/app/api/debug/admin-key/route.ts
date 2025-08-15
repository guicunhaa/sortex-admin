export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

function sanitizeKey(k: string) {
  let s = k.trim().replace(/^['"`]|['"`]$/g, '')
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  s = s.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
  s = s.replace(/\\\\n/g, '\n')
  if (!s.endsWith('\n')) s += '\n'
  return s
}

export async function GET() {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64 || ''
  const raw1 = process.env.FIREBASE_PRIVATE_KEY || ''
  const raw2 = process.env.FIREBASE_ADMIN_PRIVATE_KEY || ''

  let decoded = ''
  let used = 'none'
  if (b64.trim()) {
    try {
      decoded = Buffer.from(b64.trim(), 'base64').toString('utf8')
      used = 'FIREBASE_PRIVATE_KEY_BASE64'
    } catch {}
  } else if (raw2) {
    decoded = raw2
    used = 'FIREBASE_ADMIN_PRIVATE_KEY'
  } else if (raw1) {
    decoded = raw1
    used = 'FIREBASE_PRIVATE_KEY'
  }

  const final = decoded ? sanitizeKey(decoded) : ''

  return NextResponse.json({
    ok: true,
    used,
    sources: {
      FIREBASE_PRIVATE_KEY: !!raw1,
      FIREBASE_ADMIN_PRIVATE_KEY: !!raw2,
      FIREBASE_PRIVATE_KEY_BASE64: !!b64,
    },
    lengths: {
      decoded: decoded.length,
      final: final.length,
    },
    hasHeader: final.includes('BEGIN PRIVATE KEY'),
    hasFooter: final.includes('END PRIVATE KEY'),
  })
}