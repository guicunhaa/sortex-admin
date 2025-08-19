import { NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { firestore } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = getAuth()
    const { headers } = req
    const token = headers.get('Authorization')?.split('Bearer ')[1]
    if (!token) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
    
    const decoded = await auth.verifyIdToken(token)
    if (!decoded.admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })

    const snap = await firestore
      .collection('groups')
      .where('status', '==', 'closed')
      .orderBy('endsAt', 'desc')
      .limit(50)
      .get()

    const groups = snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        label: data.label ?? null,
        endsAt: data.endsAt ?? null,
        drawnNumber: data.drawnNumber ?? null,
        totalSold: data.totalSold ?? null,
        totalNumbers: data.totalNumbers ?? 71,
      }
    })

    return NextResponse.json({ ok: true, groups })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? 'erro' }, { status: 500 })
  }
}
