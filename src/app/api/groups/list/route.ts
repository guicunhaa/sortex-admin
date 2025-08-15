export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function GET(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })

    const role = (decoded as any).role || 'vendor'
    const uid = decoded.uid
    const url = new URL(req.url)
    const vendorIdQS = url.searchParams.get('vendorId')
    const vendorId = role === 'admin' ? (vendorIdQS || null) : uid

    let ref = adminDb.collection('groups') as FirebaseFirestore.Query
    if (vendorId) ref = ref.where('vendorId', '==', vendorId)

    try {
      const snap = await ref.orderBy('createdAt', 'desc').get()
      const groups = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
      return NextResponse.json({ ok: true, groups })
    } catch {
      const snap = await (vendorId
        ? adminDb.collection('groups').where('vendorId', '==', vendorId).orderBy('__name__').get()
        : adminDb.collection('groups').orderBy('__name__').get())
      const groups = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
      return NextResponse.json({ ok: true, fallback: true, groups })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'list_failed' }, { status: 500 })
  }
}