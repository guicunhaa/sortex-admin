// src/app/api/sales/cancel/route.ts
'use server'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { saleId, groupId, number, reason } = await req.json()
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

      // validações cruzadas
      if (sale.groupId && String(sale.groupId) !== String(groupId)) {
        throw new Error('group_mismatch')
      }
      if (sale.number !== undefined && String(sale.number).padStart(2, '0') !== numId) {
        throw new Error('number_mismatch')
      }
      // se já está disponível e a venda não está 'pago', evita operações inúteis
      if (num.status === 'available' && sale.status !== 'pago') {
        throw new Error('already_available')
      }

      const isOwner = sale.vendorId === uid

      if (sale.status === 'pendente') {
        if (!(isOwner || isAdmin)) throw new Error('forbidden')

        // precisa estar reservado pelo mesmo vendedor
        if (num.status !== 'reserved' || !num.lock || num.lock.by !== sale.vendorId) {
          throw new Error('number_not_reserved_by_vendor')
        }
        // libera o número
        tx.update(numberRef, {
          status: 'available',
          lock: null,
          canceled: true,
          groupId: String(groupId),
          saleId: null,
          vendorId: null,
          clientId: null,
          clientName: null,
          updatedAt: Field.serverTimestamp(),
        })
        // marca venda como cancelada
        tx.update(saleRef, {
          status: 'cancelada',
          canceledAt: Field.serverTimestamp(),
          cancelReason: reason || null,
          updatedAt: Field.serverTimestamp(),
        })
      } else if (sale.status === 'pago') {
        // contestação: somente admin
        if (!isAdmin) throw new Error('forbidden')
        // precisa estar vendido e atrelado a esta sale
        if (num.status !== 'sold' || String(num.saleId) !== String(saleSnap.id)) {
          throw new Error('number_not_sold_for_sale')
        }
        tx.update(numberRef, {
          status: 'available',
          lock: null,
          canceled: true,
          groupId: String(groupId),
          saleId: null,
          vendorId: null,
          clientId: null,
          clientName: null,
          updatedAt: Field.serverTimestamp(),
        })
        tx.update(saleRef, {
          status: 'cancelada',
          canceledAt: Field.serverTimestamp(),
          cancelReason: reason || 'contestacao_admin',
          updatedAt: Field.serverTimestamp(),
        })
      } else {
        throw new Error('invalid_state')
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('cancel_sale_error', err)
    const msg = err?.message ?? 'internal_error'
    const code = [
      'sale_not_found',
      'number_not_found',
      'forbidden',
      'invalid_state',
      'missing_fields',
      'group_mismatch',
      'number_mismatch',
      'already_available',
      'number_not_reserved_by_vendor',
      'number_not_sold_for_sale'
    ].includes(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
