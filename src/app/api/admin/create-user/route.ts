import { NextResponse } from 'next/server'
import { adminAuth, auth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['admin', 'vendor'])
const DEFAULT_ROLE = 'vendor'

export async function POST(request: Request) {
  try {
    // Somente ADMIN pode criar usuários
    const ah = request.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { email, password, displayName, role } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ ok: false, error: 'invalid_password' }, { status: 400 })
    }
    const normalizedRole = String(role ?? DEFAULT_ROLE)
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 })
    }

    // Cria usuário no Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: String(email),
      password: String(password),
      displayName: displayName ? String(displayName) : undefined,
    })

    // Define custom claims
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: normalizedRole === 'admin',
      vendor: normalizedRole === 'vendor',
      role: normalizedRole,
    })

    return NextResponse.json({
      ok: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName ?? null,
        role: normalizedRole,
      },
    })
  } catch (err: any) {
    console.error('Erro ao criar usuário:', err)
    const codeName = err?.code || err?.message || 'internal_error'
    const bad = [
      'missing_token',
      'forbidden',
      'missing_fields',
      'invalid_password',
      'invalid_role',
      'auth/email-already-exists',
      'auth/invalid-email',
      'auth/invalid-password',
    ]
    const status = bad.includes(codeName) ? 400 : 500
    return NextResponse.json({ ok: false, error: codeName }, { status })
  }
}
