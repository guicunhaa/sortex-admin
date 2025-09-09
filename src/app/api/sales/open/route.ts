import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/sales/open  { groupId, number }
export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok:false, error:'missing_token' }, { status:401 })
    await adminAuth.verifyIdToken(token)

    const { groupId, number } = await req.json()
    if (!groupId || typeof number !== 'number') {
      return NextResponse.json({ ok:false, error:'missing_fields' }, { status:400 })
    }

    const numId = String(number).padStart(2,'0')
    const nref = adminDb.collection('groups').doc(groupId).collection('numbers').doc(numId)

    await adminDb.runTransaction(async (tx) => {
      tx.set(nref, {
        status: 'reserved',         // azul / em aberto
        saleStatus: 'pendente',
        updatedAt: Field.serverTimestamp(),
      }, { merge: true })
    })

    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'internal_error' }, { status:500 })
  }
}
