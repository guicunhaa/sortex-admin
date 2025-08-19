import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const users: any[] = []
    let nextPageToken: string | undefined = undefined

    do {
      const res = await adminAuth.listUsers(1000, nextPageToken)
      res.users.forEach((u) => {
        const claims = (u.customClaims || {}) as any
        const role: 'admin' | 'vendor' =
          claims.role === 'admin' ? 'admin'
          : claims.role === 'vendor' ? 'vendor'
          : claims.admin === true ? 'admin'
          : claims.vendor === true ? 'vendor'
          : 'vendor'

        users.push({
          uid: u.uid,
          email: u.email ?? null,
          displayName: u.displayName ?? null,
          role,
          disabled: !!u.disabled,
          metadata: {
            creationTime: u.metadata.creationTime,
            lastSignInTime: u.metadata.lastSignInTime,
          },
        })
      })
      nextPageToken = res.pageToken || undefined
    } while (nextPageToken)

    return NextResponse.json({ ok: true, users })
  } catch (err: any) {
    console.error('GET /api/admin/users error:', err)
    const codeName = err?.code || err?.message || 'internal_error'
    const bad = ['missing_token', 'forbidden']
    const status = bad.includes(codeName) ? 400 : 500
    return NextResponse.json({ ok: false, error: codeName }, { status })
  }
}