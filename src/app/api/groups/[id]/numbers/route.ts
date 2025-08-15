export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const groupId = params.id
    if (!groupId) {
      return NextResponse.json({ ok: false, error: 'missing_group_id' }, { status: 400 })
    }

    // Autentica usuário (usa o mesmo token do client)
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })

    const role = (decoded as any).role || 'vendor'
    const uid = decoded.uid

    // Confirma grupo e valida acesso
    const gref = adminDb.collection('groups').doc(groupId)
    const gdoc = await gref.get()
    if (!gdoc.exists) {
      return NextResponse.json({ ok: false, error: 'group_not_found' }, { status: 404 })
    }
    const gdata = gdoc.data() as any
    const ownerVendorId = gdata?.vendorId
    if (role !== 'admin' && ownerVendorId && ownerVendorId !== uid) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Busca números
    const snap = await gref.collection('numbers').get()
    const numbers = snap.docs
      .map((d) => {
        const data = d.data() as any
        const untilMs =
          data?.lock?.until?.toMillis?.() ? data.lock.until.toMillis() : null
        return {
          id: d.id,
          status: data.status,
          canceled: !!data.canceled,
          lock: data.lock ? { by: data.lock.by ?? null, untilMs } : null,
        }
      })
      .sort((a, b) => Number(a.id) - Number(b.id))

    return NextResponse.json({ ok: true, numbers })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'list_numbers_failed' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const groupId = params.id
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : null
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const n = body?.n
    if (n === undefined || n === null) {
      return NextResponse.json({ ok: false, error: 'missing_number' }, { status: 400 })
    }
    const numId = String(n)

    const role = (decoded as any).role || 'vendor'
    const uid = decoded.uid

    // valida acesso ao grupo
    const gref = adminDb.collection('groups').doc(groupId)
    const gdoc = await gref.get()
    if (!gdoc.exists) return NextResponse.json({ ok: false, error: 'group_not_found' }, { status: 404 })
    const vendorId = (gdoc.data() as any)?.vendorId
    if (role !== 'admin' && vendorId && vendorId !== uid) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const RESERVE_MIN = Number(process.env.NUMBER_RESERVE_MIN || 15)
    const nref = gref.collection('numbers').doc(numId)

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(nref)
      if (!snap.exists) throw new Error('number_not_found')
      const data = snap.data() as any
      const status = data?.status ?? 'available'

      if (status === 'sold') {
        return { unchanged: true, status, canceled: !!data?.canceled, lock: null }
      }

      if (status === 'available') {
        const until = admin.firestore.Timestamp.fromMillis(Date.now() + RESERVE_MIN * 60 * 1000)
        tx.update(nref, {
          status: 'reserved',
          lock: { by: uid, until },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return { status: 'reserved', canceled: false, lock: { by: uid, untilMs: until.toMillis() } }
      }

      // status === 'reserved' -> libera
      tx.update(nref, {
        status: 'available',
        lock: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return { status: 'available', canceled: !!data?.canceled, lock: null }
    })

    return NextResponse.json({ ok: true, id: numId, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'toggle_failed' }, { status: 500 })
  }
}
