export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  const authH = req.headers.get('authorization') ?? ''
  const token = authH.startsWith('Bearer ') ? authH.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded || decoded.admin !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { vendorId, canCreateGroups } = await req.json()
  if (!vendorId || typeof canCreateGroups !== 'boolean') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  await adminDb.collection('vendors').doc(vendorId).set({ canCreateGroups }, { merge: true })
  return NextResponse.json({ ok: true })
}