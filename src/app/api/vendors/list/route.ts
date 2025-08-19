// src/app/api/vendors/list/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

function toMs(t: any) {
  return t?.toMillis?.() ?? (typeof t?.seconds === 'number' ? t.seconds * 1000 : null)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })

    const claims = (decoded as any) || {}
    const isAdmin = claims.admin === true || claims.role === 'admin'
    const uid = (decoded as any).uid as string

    // Admin: opcional ?vendorId=... (senão lista todos). Vendor: só ele.
    const vendorIdQS = url.searchParams.get('vendorId')
    const vendorId = isAdmin ? vendorIdQS : uid

    let q = adminDb.collection('vendors') as FirebaseFirestore.Query
    if (vendorId) q = q.where('userId', '==', vendorId)

    // Ordena por nome; fallback por __name__ se faltar índice
    let snap: FirebaseFirestore.QuerySnapshot
    try {
      snap = await q.orderBy('name', 'asc').limit(500).get()
    } catch {
      snap = await (vendorId ? q : adminDb.collection('vendors')).orderBy('__name__').limit(500).get()
    }

    const vendors = snap.docs.map(d => {
      const v = d.data() as any
      return {
        id: d.id,
        userId: v.userId ?? d.id,
        name: v.name ?? d.id,
        active: v.active !== false,
        createdAt: toMs(v.createdAt),
        updatedAt: toMs(v.updatedAt),
      }
    })

    return NextResponse.json({ ok: true, vendors })
  } catch (e: any) {
    console.error('GET /api/vendors/list error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'list_failed' }, { status: 500 })
  }
}