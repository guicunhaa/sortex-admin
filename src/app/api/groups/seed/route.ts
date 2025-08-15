export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { GROUP_SIZE, padNumber } from '@/lib/groups'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret') ?? ''
  const groupId = url.searchParams.get('groupId') ?? ''

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!groupId) {
    return NextResponse.json({ error: 'groupId_required' }, { status: 400 })
  }

  // Tamanho fixo do grupo: 0..70 (71 números) — alinhado a src/lib/groups.ts
  const size = GROUP_SIZE

  const batch = adminDb.batch()
  const col = adminDb.collection('groups').doc(groupId).collection('numbers')
  const now = new Date()

  for (let n = 0; n < size; n++) {
    const id = padNumber(n) // "00".."70"
    const ref = col.doc(id)
    batch.set(
      ref,
      {
        status: 'available',
        updatedAt: now,
        lock: null,
        saleId: null,
        vendorId: null,
        clientId: null,
      },
      { merge: false }
    )
  }

  await batch.commit()
  return NextResponse.json({ ok: true, created: size })
}
