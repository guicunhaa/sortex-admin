export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminApp, adminDb } from '@/lib/firebaseAdmin'

export async function GET() {
  const adminProjectId =
    (adminApp?.options as any)?.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    null

  try {
    const snap = await adminDb.collection('groups').orderBy('__name__').limit(3).get()
    const sample = snap.docs.map(d => ({
      id: d.id,
      vendorId: d.get('vendorId') ?? null,
      createdAt: d.get('createdAt')?.toDate?.()?.toISOString?.() ?? d.get('createdAt') ?? null,
      projectIdUsed: d.get('projectIdUsed') ?? null,
    }))
    return NextResponse.json({
      ok: true,
      adminProjectId,
      env: {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
        FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || null,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
      },
      count: snap.size,
      sample,
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      adminProjectId,
      env: {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
        FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || null,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
      },
      error: e?.message || String(e),
    }, { status: 500 })
  }
}