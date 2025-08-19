import { NextResponse } from 'next/server'
import { adminDb, adminAuth, Field } from '@/lib/firebaseAdmin'
import * as admin from 'firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = Number(process.env.NEXT_PUBLIC_RESERVATION_TTL_MS ?? '300000') // 5min

// GET /api/groups/[id]/numbers
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const groupId = String(params.id)

    // exige usuário autenticado (qualquer papel)
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    await adminAuth.verifyIdToken(token)

    const groupRef = adminDb.collection('groups').doc(groupId)
    const g = await groupRef.get()
    if (!g.exists) {
      return NextResponse.json({ ok: false, error: 'group_not_found' }, { status: 404 })
    }

    const snap = await groupRef.collection('numbers').get()
    const numbers = snap.docs
      .map((d) => {
        const data = d.data() as any
        let untilMs: number | null = null
        const u = data?.lock?.until
        if (u && typeof u.toMillis === 'function') untilMs = u.toMillis()
        else if (typeof data?.lock?.untilMs === 'number') untilMs = data.lock.untilMs

        return {
          id: d.id,
          status: data.status,
          canceled: !!data.canceled,
          lock: data.lock ? { by: data.lock.by ?? null, untilMs } : null,
          saleId: data.saleId ?? null,
          saleStatus: data.saleStatus ?? null,
          clientName: data.clientName ?? null,
          vendorId: data.vendorId ?? null,
        }
      })
      .sort((a, b) => Number(a.id) - Number(b.id))

    return NextResponse.json({ ok: true, numbers })
  } catch (e: any) {
    console.error('GET /api/groups/[id]/numbers', e)
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}

// POST /api/groups/[id]/numbers  { n: number }  -> alterna reserva/liberação
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const groupId = String(params.id)

    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid
    const isAdmin = (decoded as any).admin === true || (decoded as any).role === 'admin'

    const { n } = await req.json()
    if (n === undefined || n === null) {
      return NextResponse.json({ ok: false, error: 'missing_number' }, { status: 400 })
    }
    const numId = String(n).padStart(2, '0')

    const groupRef = adminDb.collection('groups').doc(groupId)
    const g = await groupRef.get()
    if (!g.exists) {
      return NextResponse.json({ ok: false, error: 'group_not_found' }, { status: 404 })
    }

    const nref = groupRef.collection('numbers').doc(numId)
    const until = admin.firestore.Timestamp.fromMillis(Date.now() + TTL)

    const result = await adminDb.runTransaction(async (tx) => {
      const ns = await tx.get(nref)
      const data = ns.exists ? (ns.data() as any) : { status: 'available' }

      if (data.status === 'sold') throw new Error('sold_cannot_toggle')

      if (data.status === 'available') {
        // reservar
        tx.set(
          nref,
          {
            status: 'reserved',
            groupId,
            lock: { by: uid, until, untilMs: until.toMillis() },
            updatedAt: Field.serverTimestamp(),
          },
          { merge: true },
        )
        return { status: 'reserved', lock: { untilMs: until.toMillis() } }
      }

      if (data.status === 'reserved') {
        // liberar (dono do lock ou admin)
        if ((data?.lock?.by && data.lock.by !== uid) && !isAdmin) {
          throw new Error('reserved_by_other')
        }
        tx.update(nref, {
          status: 'available',
          groupId,
          lock: Field.delete(),
          updatedAt: Field.serverTimestamp(),
        })
        return { status: 'available' }
      }

      // fallback -> tratar como available
      tx.set(
        nref,
        {
          status: 'reserved',
          groupId,
          lock: { by: uid, until, untilMs: until.toMillis() },
          updatedAt: Field.serverTimestamp(),
        },
        { merge: true },
      )
      return { status: 'reserved', lock: { untilMs: until.toMillis() } }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('POST /api/groups/[id]/numbers', e)
    const msg = e?.message || 'internal_error'
    const bad = ['missing_token', 'missing_number', 'group_not_found', 'reserved_by_other', 'sold_cannot_toggle']
    const code = bad.includes(msg) ? 400 : 500
    return NextResponse.json({ ok: false, error: msg }, { status: code })
  }
}
