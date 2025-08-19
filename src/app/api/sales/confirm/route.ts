// src/app/api/sales/confirm/route.ts
'use server'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { saleId, groupId, number } = await req.json()
    const numId = String(number).padStart(2, '0')
    if (!saleId || !groupId || (number === undefined || number === null)) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(token)
    const isAdmin = (decoded as any).role === 'admin'
    const uid = decoded.uid

    const saleRef = adminDb.collection('sales').doc(String(saleId))
    const numberRef = adminDb.collection('groups').doc(String(groupId))
      .collection('numbers').doc(numId)

    await adminDb.runTransaction(async (tx) => {
      const saleSnap = await tx.get(saleRef)
      if (!saleSnap.exists) throw new Error('sale_not_found')
      const sale = saleSnap.data() as any

      const numSnap = await tx.get(numberRef)
      if (!numSnap.exists) throw new Error('number_not_found')
      const num = numSnap.data() as any

      // validações extras para garantir consistência cruzada
      if (sale.groupId && String(sale.groupId) !== String(groupId)) {
        throw new Error('group_mismatch')
      }
      if (sale.number !== undefined && String(sale.number).padStart(2, '0') !== numId) {
        throw new Error('number_mismatch')
      }
      if (num.status === 'sold') {
        throw new Error('already_sold')
      }
      if (num.saleId && String(num.saleId) !== String(saleId)) {
        throw new Error('sale_bind_mismatch')
      }

      if (!isAdmin && sale.vendorId !== uid) throw new Error('forbidden')
      if (sale.status !== 'pendente') throw new Error('not_pending')

      // precisa estar reservado pelo mesmo vendedor
      if (num.status !== 'reserved' || !num.lock || num.lock.by !== sale.vendorId) {
        throw new Error('number_not_reserved_by_vendor')
      }

      tx.update(saleRef, {
        status: 'pago',
        confirmedAt: Field.serverTimestamp(),
        updatedAt: Field.serverTimestamp(),
        groupId: sale.groupId ?? String(groupId),
        number: sale.number ?? Number(numId),
      })

      tx.update(numberRef, {
        status: 'sold',
        lock: null,
        groupId: String(groupId),
        saleId: saleSnap.id,
        vendorId: sale.vendorId ?? null,
        clientId: sale.clientId ?? null,
        clientName: sale.clientName ?? num.clientName ?? null,
        updatedAt: Field.serverTimestamp(),
      })
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('confirm_sale_error', err)
    const msg = err?.message ?? 'internal_error'
    const code = [
      'sale_not_found',
      'number_not_found',
      'forbidden',
      'not_pending',
      'number_not_reserved_by_vendor',
      'group_mismatch',
      'number_mismatch',
      'already_sold',
      'sale_bind_mismatch',
      'missing_fields'
    ].includes(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
