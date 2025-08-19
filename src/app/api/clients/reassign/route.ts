export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  // Bearer token obrigatório
  const ah = req.headers.get('authorization') ?? ''
  const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded || (decoded as any).role !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 })
  }

  const { clientId, newVendorId } = await req.json()
  if (!clientId || !newVendorId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  // Atualiza vendorId do cliente
  await adminDb.collection('clients').doc(clientId).update({
    vendorId: newVendorId,
    updatedAt: new Date(),
  })

  return NextResponse.json({ ok: true })
}