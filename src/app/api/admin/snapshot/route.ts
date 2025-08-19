import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/admin/snapshot
export async function GET() {
  try {
    const groupsSnap = await adminDb.collection('groups').get()
    return NextResponse.json({ ok: true, groupsCount: groupsSnap.size })
  } catch (e: any) {
    console.error('GET /api/admin/snapshot error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
