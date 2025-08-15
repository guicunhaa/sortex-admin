// src/app/api/sales/create/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { padNumber, MIN_NUMBER, MAX_NUMBER } from '@/lib/groups'

export async function POST(req: Request) {
  const authH = req.headers.get('authorization') ?? ''
  const token = authH.startsWith('Bearer ') ? authH.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  const requesterUid = decoded.uid
  const requesterRole = (decoded as any).role || 'vendor'

  const body = await req.json().catch(() => ({} as any))
  const {
    groupId,
    number,
    vendorId: bodyVendorId,
    vendorName,
    clientId,
    clientName,
    total,
    quantity,
    region,
    status,
  } = body ?? {}

  if (!groupId || (number === undefined || number === null) || !vendorName || typeof total !== 'number' || !status) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  // Determina o vendor efetivo: admin pode vender em nome de outro vendedor; vendedor comum só para si
  const effectiveVendorId = (requesterRole === 'admin' && bodyVendorId)
    ? String(bodyVendorId)
    : requesterUid

  if (requesterRole !== 'admin' && bodyVendorId && bodyVendorId !== requesterUid) {
    return NextResponse.json({ error: 'vendor_mismatch' }, { status: 403 })
  }

  // Normaliza e valida o número ("00".."70")
  const numIndex = typeof number === 'string' ? parseInt(number, 10) : Number(number)
  if (!Number.isFinite(numIndex) || numIndex < MIN_NUMBER || numIndex > MAX_NUMBER) {
    return NextResponse.json({ error: 'invalid_number' }, { status: 400 })
  }
  const nId = padNumber(numIndex)

  // vendedor precisa estar ativo
  const vSnap = await adminDb.collection('vendors').doc(effectiveVendorId).get()
  if (!vSnap.exists || vSnap.data()?.active === false) {
    return NextResponse.json({ error: 'vendor_inactive' }, { status: 403 })
  }

  const now = admin.firestore.Timestamp.now()
  const numRef = adminDb.collection('groups').doc(groupId).collection('numbers').doc(nId)
  const salesRef = adminDb.collection('sales').doc()

  try {
    const res = await adminDb.runTransaction(async (tx) => {
      const numSnap = await tx.get(numRef)
      if (!numSnap.exists) throw new Error('number_not_found')
      const num = numSnap.data() as any

      // Regras de consistência: número reservado por QUEM executou (requester) e não expirado
      const until = num?.lock?.until ? (num.lock.until as admin.firestore.Timestamp).toMillis() : 0
      const lockedByRequester = num?.lock?.by === requesterUid
      const notExpired = until > Date.now()

      if (!(num.status === 'reserved' && lockedByRequester && notExpired)) {
        throw new Error('number_not_reserved_by_you')
      }

      // Cria venda
      const saleDoc = {
        groupId,
        number: nId,
        vendorId: effectiveVendorId,
        vendorName,
        clientId: clientId ?? null,
        clientName: clientName ?? null,
        total,
        quantity: quantity ?? 1,
        region: region ?? '',
        status,
        date: now,
      }
      tx.set(salesRef, saleDoc, { merge: false })

      // Marca número como vendido
      tx.set(
        numRef,
        {
          status: 'sold',
          saleId: salesRef.id,
          vendorId: effectiveVendorId,
          clientId: clientId ?? null,
          updatedAt: now,
          lock: null,
        },
        { merge: true }
      )

      return { saleId: salesRef.id }
    })

    return NextResponse.json({ ok: true, ...res })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'tx_failed' }, { status: 400 })
  }
}
