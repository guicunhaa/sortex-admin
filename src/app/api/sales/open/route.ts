import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/sales/open { groupId, number, saleId }
export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok:false, error:'missing_token' }, { status:401 })
    await adminAuth.verifyIdToken(token)

    const { groupId, number, saleId } = await req.json()
    if (!groupId || typeof number !== 'number' || !saleId) {
      return NextResponse.json({ ok:false, error:'missing_fields' }, { status:400 })
    }
    const numId = String(number).padStart(2, '0')

    const gref = adminDb.collection('groups').doc(groupId)
    const nref = gref.collection('numbers').doc(numId)
    const sref = adminDb.collection('sales').doc(saleId)

    await adminDb.runTransaction(async (tx) => {
      // número volta a "reserved" (em aberto), venda fica pendente
      tx.set(nref, { status:'reserved', saleStatus:'pendente', updatedAt: Field.serverTimestamp() }, { merge:true })
      tx.update(sref, { status:'pendente', updatedAt: Field.serverTimestamp() })
    })

    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e?.message || 'internal_error' }, { status:500 })
  }
}
