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

  const { vendorId, active, canCreateGroups } = await req.json().catch(() => ({}))
  if (!vendorId || typeof active !== 'boolean' && typeof canCreateGroups !== 'boolean') {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  const payload: any = { userId: vendorId, updatedAt: new Date() }
  if (typeof active === 'boolean') payload.active = active
  if (typeof canCreateGroups === 'boolean') payload.canCreateGroups = canCreateGroups

  await adminDb.collection('vendors').doc(vendorId).set(payload, { merge: true })
  return NextResponse.json({ ok: true })
}