// src/app/api/groups/create/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb } from '@/lib/firebaseAdmin'

const MIN_NUMBER = 0
const MAX_NUMBER = 70

// POST /api/groups/create  { vendorId?: string, label?: string }
export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })
    const claims = (decoded as any) || {}
    const isAdmin = claims.admin === true || claims.role === 'admin'
    const uid = (decoded as any).uid as string

    const { vendorId, label } = (await req.json().catch(() => ({}))) as {
      vendorId?: string
      label?: string | null
    }

    // Admin cria para qualquer vendor; vendedor só para si
    let effectiveVendorId: string
    if (isAdmin) {
      effectiveVendorId = vendorId || uid
    } else {
      if (vendorId && vendorId !== uid) {
        return NextResponse.json({ ok: false, error: 'forbidden_vendor_mismatch' }, { status: 403 })
      }
      effectiveVendorId = uid
    }

    const now = admin.firestore.FieldValue.serverTimestamp()
    const groupRef = adminDb.collection('groups').doc()
    await groupRef.set({
      vendorId: effectiveVendorId,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      status: 'open',
      label: label ?? null,
    })

    const batch = adminDb.batch()
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
      const id = String(n).padStart(2, '0')
      batch.set(groupRef.collection('numbers').doc(id), {
        groupId: groupRef.id,
        status: 'available',
        canceled: false,
        lock: null,
        updatedAt: now,
      })
    }
    await batch.commit()

    return NextResponse.json({ ok: true, groupId: groupRef.id, vendorId: effectiveVendorId })
  } catch (e: any) {
    console.error('[groups/create] failed:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'create_failed' }, { status: 500 })
  }
}