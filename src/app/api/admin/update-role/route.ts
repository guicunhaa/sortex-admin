import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const { uid, role } = await req.json() as { uid?: string; role?: 'admin' | 'vendor' }
    if (!uid || !role) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }
    if (role !== 'admin' && role !== 'vendor') {
      return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 })
    }

    await adminAuth.setCustomUserClaims(uid, {
      role,
      admin: role === 'admin',
      vendor: role === 'vendor',
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Erro ao atualizar role:', err)
    const codeName = err?.code || err?.message || 'internal_error'
    const bad = ['missing_token', 'forbidden', 'missing_fields', 'invalid_role']
    const status = bad.includes(codeName) ? 400 : 500
    return NextResponse.json({ ok: false, error: codeName }, { status })
  }
}