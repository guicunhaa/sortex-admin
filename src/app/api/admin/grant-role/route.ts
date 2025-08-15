export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// src/app/api/admin/grant-role/route.ts
import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { email, role } = await req.json() as { email: string; role: 'admin'|'vendor' }
  if (!email || !role) return NextResponse.json({ error: 'missing email/role' }, { status: 400 })

  const user = await adminAuth.getUserByEmail(email)
  await adminAuth.setCustomUserClaims(user.uid, { role })
  // opcional: espelha um doc do vendedor
  await adminDb.collection('vendors').doc(user.uid).set({
    userId: user.uid,
    name: user.displayName ?? email.split('@')[0],
    active: true,
    createdAt: new Date(),
  }, { merge: true })

  return NextResponse.json({ ok: true, uid: user.uid, role })
}