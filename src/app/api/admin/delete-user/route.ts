// src/app/api/admin/delete-user/route.ts
import { NextResponse } from 'next/server'
import { adminAuth, auth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Aceita uid OU email
type Body = { uid?: string; email?: string }

export async function POST(req: Request) {
  try {
    // Somente ADMIN pode deletar
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { uid, email }: Body = await req.json()
    if (!uid && !email) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }

    // Resolve UID por email, se preciso
    let targetUid = uid?.trim() || ''
    if (!targetUid && email) {
      const userRecord = await auth.getUserByEmail(String(email))
      targetUid = userRecord.uid
    }

    await adminAuth.deleteUser(targetUid)

    return NextResponse.json({ ok: true, uid: targetUid })
  } catch (err: any) {
    console.error('Erro ao deletar usuário:', err)
    const codeName = err?.code || err?.message || 'internal_error'
    const bad = [
      'missing_token',
      'forbidden',
      'missing_fields',
      'auth/user-not-found',
      'auth/invalid-email',
    ]
    const status = bad.includes(codeName) ? 400 : 500
    return NextResponse.json({ ok: false, error: codeName }, { status })
  }
}