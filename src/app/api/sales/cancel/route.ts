import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/sales/cancel  { groupId, number, saleId? }
export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'

    const { groupId, number, saleId } = await req.json()
    if (!groupId || typeof number !== 'number') {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }
    const numId = String(number).padStart(2, '0')
    const gref = adminDb.collection('groups').doc(groupId)
    const nref = gref.collection('numbers').doc(numId)

    await adminDb.runTransaction(async (tx) => {
      const ns = await tx.get(nref)
      const data = ns.data() as any
      if (!isAdmin && data?.lock?.by && data.lock.by !== uid) throw new Error('forbidden')
      tx.update(nref, { status: 'available', lock: Field.delete(), updatedAt: Field.serverTimestamp() })
      if (saleId) {
        tx.update(adminDb.collection('sales').doc(saleId), { status: 'cancelada', updatedAt: Field.serverTimestamp() })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('POST /api/sales/cancel error:', e)
    const msg = e?.message || 'internal_error'
    const bad = ['missing_token', 'missing_fields', 'forbidden']
    return NextResponse.json({ ok: false, error: msg }, { status: bad.includes(msg) ? 400 : 500 })
  }
}
