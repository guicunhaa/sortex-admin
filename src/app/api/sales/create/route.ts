// src/app/api/sales/create/route.ts
import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  // Verifica ID token do usuário (Authorization: Bearer <token>)
  const authH = req.headers.get('authorization') ?? ''
  const token = authH.startsWith('Bearer ') ? authH.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  const uid = decoded.uid
  // Valida vendedor ativo
  const vSnap = await adminDb.collection('vendors').doc(uid).get()
  if (!vSnap.exists || vSnap.data()?.active === false) {
    return NextResponse.json({ error: 'vendor_inactive' }, { status: 403 })
  }

  const body = await req.json() as {
    number: string
    vendorName: string
    clientId?: string
    clientName?: string
    total: number
    status: 'pago'|'pendente'
    quantity?: number
    region?: string
    product?: string
  }
  if (!body.number || !body.vendorName || typeof body.total !== 'number' || !body.status) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const now = admin.firestore.Timestamp.now()
  const numRef = adminDb.collection('numbers').doc(body.number)
  const salesRef = adminDb.collection('sales').doc()

  try {
    const res = await adminDb.runTransaction(async (tx) => {
      const numSnap = await tx.get(numRef)
      if (!numSnap.exists) throw new Error('number_not_found')
      const num = numSnap.data() as any

      // Regras de consistência
      const until = num?.lock?.until ? (num.lock.until as admin.firestore.Timestamp).toMillis() : 0
      const lockedByMe = num?.lock?.by === uid
      const notExpired = until > Date.now()

      if (!(num.status === 'reserved' && lockedByMe && notExpired)) {
        throw new Error('number_not_reserved_by_you')
      }

      // Cria venda
      const saleDoc = {
        number: body.number,
        vendorId: uid,
        vendorName: body.vendorName,
        clientId: body.clientId ?? null,
        clientName: body.clientName ?? null,
        total: body.total,
        quantity: body.quantity ?? 1,
        region: body.region ?? '',
        product: body.product ?? `Número ${body.number}`,
        status: body.status,
        date: now,
      }
      tx.set(salesRef, saleDoc)

      // Atualiza número
      tx.update(numRef, {
        status: 'sold',
        saleId: salesRef.id,
        vendorId: uid,
        clientId: body.clientId ?? null,
        updatedAt: now,
        lock: null,
      })

      return { saleId: salesRef.id }
    })

    return NextResponse.json({ ok: true, ...res })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'tx_failed' }, { status: 400 })
  }
}
