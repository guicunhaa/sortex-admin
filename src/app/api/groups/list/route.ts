import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok:false, error:'missing_token' }, { status:401 })

    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid
    const isAdmin = (decoded as any).role === 'admin' || (decoded as any).admin === true

    const url = new URL(req.url)
    const vendorFilter = isAdmin ? (url.searchParams.get('vendorId') || null) : uid

    let q: FirebaseFirestore.Query = adminDb.collection('groups')
    // grupos gravam `createdBy` (ou `vendorId`) no create; usar `createdBy`
    if (vendorFilter) q = q.where('createdBy', '==', vendorFilter)

    const snap = await q.get()
    const groups = snap.docs.map(d => ({
      id: d.id,
      label: (d.get('label') ?? null) as string | null,
    }))

    return NextResponse.json({ ok:true, groups })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'internal_error' }, { status:500 })
  }
}
