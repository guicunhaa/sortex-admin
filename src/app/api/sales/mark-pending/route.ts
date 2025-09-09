import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { groupId, number, saleId? }
export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok:false, error:'missing_token' }, { status:401 })
    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid
    const isAdmin = (decoded as any).role === 'admin' || (decoded as any).admin === true

    const { groupId, number, saleId } = await req.json()
    if (!groupId || typeof number !== 'number') {
      return NextResponse.json({ ok:false, error:'missing_fields' }, { status:400 })
    }
    const numId = String(number).padStart(2,'0')
    const gref = adminDb.collection('groups').doc(groupId)
    const nref = gref.collection('numbers').doc(numId)

    await adminDb.runTransaction(async tx => {
      const ns = await tx.get(nref)
      const ndata = ns.data() as any
      if (!ndata) throw new Error('number_not_found')

      // Admin ou o mesmo vendor que vendeu
      if (!isAdmin && ndata?.vendorId && ndata.vendorId !== uid) throw new Error('forbidden')
      const sid = saleId || ndata?.saleId
      if (!sid) throw new Error('sale_not_found')

      tx.update(nref, {
        status: 'sold',         // continua ocupado
        saleStatus: 'pendente', // “Em aberto” (azul)
        updatedAt: Field.serverTimestamp(),
      })

      tx.update(adminDb.collection('sales').doc(sid), {
        status: 'pendente',
        updatedAt: Field.serverTimestamp(),
      })
    })

    return NextResponse.json({ ok:true })
  } catch (e:any) {
    const msg = e?.message || 'internal_error'
    const bad = ['missing_token','missing_fields','forbidden','number_not_found','sale_not_found']
    return NextResponse.json({ ok:false, error: msg }, { status: bad.includes(msg) ? 400 : 500 })
  }
}
