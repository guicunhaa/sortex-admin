// src/app/api/groups/list/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

function isAdminSecretOk(req: Request) {
  const secret = process.env.ADMIN_SECRET?.trim()
  if (!secret) return false

  const hdr = req.headers.get('x-admin-secret')?.trim()
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const q = new URL(req.url).searchParams.get('secret')?.trim()

  return hdr === secret || auth === secret || q === secret
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    let role: 'admin' | 'vendor' = 'vendor'
    let uid: string | null = null

    if (isAdminSecretOk(req)) {
      // Acesso administrativo via SECRET (para GPT/Ações ou automações)
      role = 'admin'
    } else {
      // Fluxo normal: exige Firebase ID Token
      const ah = req.headers.get('authorization') ?? ''
      const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
      if (!token) {
        return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
      }

      const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
      if (!decoded) {
        return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })
      }

      role = ((decoded as any).role as 'admin' | 'vendor') || 'vendor'
      uid = decoded.uid
    }

    // Admin pode consultar qualquer vendorId (ou todos); vendor só o próprio
    const vendorIdQS = url.searchParams.get('vendorId')
    const vendorId = role === 'admin' ? (vendorIdQS || null) : uid

    let ref = adminDb.collection('groups') as FirebaseFirestore.Query

    if (vendorId) {
      ref = ref.where('vendorId', '==', vendorId)
    }

    try {
      const snap = await ref.orderBy('createdAt', 'desc').limit(200).get()
      const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      return NextResponse.json({ ok: true, groups })
    } catch {
      // Fallback se o índice de createdAt não existir
      const snap = await (vendorId
        ? adminDb.collection('groups').where('vendorId', '==', vendorId).orderBy('__name__').limit(200).get()
        : adminDb.collection('groups').orderBy('__name__').limit(200).get())
      const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      return NextResponse.json({ ok: true, fallback: true, groups })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'list_failed' }, { status: 500 })
  }
}
