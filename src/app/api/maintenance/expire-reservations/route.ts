export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminDb } from '@/lib/firebaseAdmin'

function isAuthorized(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('secret') || undefined
  const x = req.headers.get('x-admin-secret') || undefined
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : undefined

  const allowed = [process.env.ADMIN_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[]
  const provided = [q, x, bearer].filter(Boolean) as string[]
  return allowed.length > 0 && provided.some(v => allowed.includes(v))
}

async function expireNow() {
  const now = Date.now()
  const q = adminDb.collectionGroup('numbers').where('status', '==', 'reserved')
  const snap = await q.get()

  let count = 0
  let batch = adminDb.batch()
  const MAX = 450

  for (const d of snap.docs) {
    const data = d.data() as any
    const until = data?.lock?.until ? (data.lock.until as admin.firestore.Timestamp).toMillis() : 0
    if (until <= now) {
      batch.update(d.ref, {
        status: 'available',
        lock: null,
        updatedAt: new Date(),
        saleId: null,
        vendorId: null,
        clientId: null,
      })
      count++
      if (count % MAX === 0) {
        await batch.commit()
        batch = adminDb.batch()
      }
    }
  }
  if (count % MAX !== 0) await batch.commit()
  return { ok: true, released: count }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const res = await expireNow()
  return NextResponse.json(res)
}
export async function GET(req: Request) { return POST(req) }