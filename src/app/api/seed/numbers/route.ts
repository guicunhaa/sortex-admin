export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// src/app/api/seed/numbers/route.ts
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const max = Number(url.searchParams.get('max') ?? '1000')
  if (secret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (max <= 0 || max > 100000) return NextResponse.json({ error: 'invalid max' }, { status: 400 })

  const batchSize = 500
  const tasks: Promise<any>[] = []

  for (let start = 0; start < max; start += batchSize) {
    const batch = adminDb.batch()
    const end = Math.min(start + batchSize, max)
    for (let i = start; i < end; i++) {
      const id = String(i).padStart(4, '0') // 0000..0999
      const ref = adminDb.collection('numbers').doc(id)
      batch.set(ref, {
        status: 'available',
        updatedAt: new Date(),
        lock: null,
        saleId: null,
        vendorId: null,
        clientId: null,
      }, { merge: false })
    }
    tasks.push(batch.commit())
  }

  await Promise.all(tasks)
  return NextResponse.json({ ok: true, created: max })
}
