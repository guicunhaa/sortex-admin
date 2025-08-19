import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/groups/close-and-draw  { groupId }
export async function POST(req: Request) {
  try {
    // auth: admin por idToken OU secret por header/query
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    let isAdmin = false
    if (token) {
      const decoded = await adminAuth.verifyIdToken(token)
      isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    }
    const headerSecret = req.headers.get('x-admin-secret')
    const urlSecret = new URL(req.url).searchParams.get('secret')
    const envSecret = process.env.ADMIN_SECRET
    const authed = isAdmin || (!!envSecret && (headerSecret === envSecret || urlSecret === envSecret))
    if (!authed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const { groupId } = await req.json()
    if (!groupId) return NextResponse.json({ ok: false, error: 'missing_group' }, { status: 400 })

    // sorteio simples entre vendas 'pago'
    const paid = await adminDb
      .collection('sales')
      .where('groupId', '==', groupId)
      .where('status', '==', 'pago')
      .get()

    let drawnNumber: number | null = null
    if (!paid.empty) {
      const arr = paid.docs
        .map((d) => (d.data() as any).number)
        .filter((n) => typeof n === 'number')
      if (arr.length > 0) drawnNumber = arr[Math.floor(Math.random() * arr.length)]
    }

    await adminDb.collection('groups').doc(groupId)
      .set({ status: 'closed', drawnNumber, updatedAt: Field.serverTimestamp() }, { merge: true })

    return NextResponse.json({ ok: true, drawnNumber })
  } catch (e: any) {
    console.error('POST /api/groups/close-and-draw error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
