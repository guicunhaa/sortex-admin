export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  const ah = req.headers.get('authorization') ?? ''
  const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded || (decoded as any).role !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 })
  }

  const { vendorId, active } = await req.json()
  if (!vendorId || typeof active !== 'boolean') {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  await adminDb.collection('vendors').doc(vendorId).set(
    { userId: vendorId, active, updatedAt: new Date() },
    { merge: true }
  )
  return NextResponse.json({ ok: true })
}