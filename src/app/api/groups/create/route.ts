export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb } from '@/lib/firebaseAdmin'

const MIN_NUMBER = 0
const MAX_NUMBER = 70

export async function POST(req: Request) {
  try {
    // --- Auth ---
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
    }
    const requesterUid = decoded.uid
    const role = (decoded as any).role || 'vendor'

    // --- Input ---
    const body = await req.json().catch(() => ({}))
    const { vendorId, label } = body || {}

    const effectiveVendorId = role === 'admin' ? (vendorId || requesterUid) : requesterUid

    // --- Permissão (vendor) ---
    if (role !== 'admin') {
      const vSnap = await adminDb.collection('vendors').doc(requesterUid).get()
      const can = vSnap.exists && !!(vSnap.data() as any)?.canCreateGroups
      if (!can) {
        return NextResponse.json({ error: 'forbidden_create_group' }, { status: 403 })
      }
    }

    // --- Cria grupo ---
    const groupRef = adminDb.collection('groups').doc()
    const now = admin.firestore.FieldValue.serverTimestamp()

    await groupRef.set({
      vendorId: effectiveVendorId,
      createdBy: requesterUid,
      createdAt: now,
      closed: false,
      label: label ?? null,
    })

    // --- Semeia números 0..70 ---
    const batch = adminDb.batch()
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
      const numRef = groupRef.collection('numbers').doc(String(n))
      batch.set(numRef, {
        status: 'available',
        canceled: false,
        lock: null,
        updatedAt: now,
      })
    }
    await batch.commit()

    return NextResponse.json({ ok: true, groupId: groupRef.id }, { status: 200 })
  } catch (e: any) {
    console.error('[groups/create] failed:', e)
    // **sempre** devolve JSON
    return NextResponse.json({ error: e?.message || 'create_failed' }, { status: 500 })
  }
}
