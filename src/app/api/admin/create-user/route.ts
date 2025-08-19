// src/app/api/admin/create-user/route.ts
import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/admin/create-user
// Body: { email, password, role: 'admin'|'vendor', displayName? }
export async function POST(req: Request) {
  try {
    // --- Auth (apenas ADMIN por idToken) ---
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    // --- Input ---
    const { email, password, role, displayName } = (await req.json()) as {
      email?: string
      password?: string
      role?: 'admin' | 'vendor'
      displayName?: string
    }
    if (!email || !password || !role) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }
    if (role !== 'admin' && role !== 'vendor') {
      return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 })
    }

    // --- Cria usuário no Auth ---
    const user = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || undefined,
      disabled: false,
    })

    // --- Define claims estáveis ---
    await adminAuth.setCustomUserClaims(user.uid, {
      role,
      admin: role === 'admin',
      vendor: role === 'vendor',
    })

    // Opcional: garantir que novos logins puxem claims atualizadas
    await adminAuth.revokeRefreshTokens(user.uid)

    const name = displayName || email

    // --- vendors/{uid} ---
    const now = Field.serverTimestamp()
    await adminDb.collection('vendors').doc(user.uid).set(
      {
        userId: user.uid,
        name,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    )

    // --- users/{uid} espelho (útil para consultas rápidas no client) ---
    await adminDb.collection('users').doc(user.uid).set(
      {
        email,
        displayName: name,
        role,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    )

    // --- Resposta detalhada para a UI atualizar imediatamente ---
    return NextResponse.json({
      ok: true,
      uid: user.uid,
      role,
      user: {
        uid: user.uid,
        email,
        displayName: name,
        role,
      },
      vendor: {
        id: user.uid,
        name,
        active: true,
      },
    })
  } catch (err: any) {
    console.error('POST /api/admin/create-user error:', err)
    const code = err?.code || ''
    const msg = err?.message || 'internal_error'
    // E-mails duplicados: responder com 409
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ ok: false, error: code }, { status: 409 })
    }
    const bad = new Set(['missing_token', 'forbidden', 'missing_fields', 'invalid_role'])
    return NextResponse.json({ ok: false, error: code || msg }, { status: bad.has(code) ? 400 : 500 })
  }
}
