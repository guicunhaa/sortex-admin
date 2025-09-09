// src/app/api/sales/create/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import admin, { adminAuth, adminDb, Field } from '@/lib/firebaseAdmin'
import { padNumber, MIN_NUMBER, MAX_NUMBER } from '@/lib/groups'

export async function POST(req: Request) {
  const authH = req.headers.get('authorization') ?? ''
  const token = authH.startsWith('Bearer ') ? authH.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 401 })

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
  if (!decoded) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  const requesterUid = decoded.uid

  try {
    const body = await req.json()
    const gidRaw = body.groupId ?? body.group ?? body.gid
    const numRaw = body.number
    const totalRaw = body.total
    const statusRaw = body.status
    const clientId = body.clientId ?? null
    const clientName = body.clientName ?? null
    const regionFromBody = body.region ?? null

    const gid = String(gidRaw || '').trim()
    const number = padNumber(numRaw)
    const numberInt = parseInt(number, 10)
    if (!gid) return NextResponse.json({ error: 'group_required' }, { status: 400 })
    if (Number(number) < MIN_NUMBER || Number(number) > MAX_NUMBER) {
      return NextResponse.json({ error: 'invalid_number' }, { status: 400 })
    }

    const now = admin.firestore.Timestamp.now()

    const res = await adminDb.runTransaction(async (tx) => {
      // 1) Carregar o grupo (para validar e obter o NOME)
      const groupRef = adminDb.collection('groups').doc(gid)
      const groupSnap = await tx.get(groupRef)
      if (!groupSnap.exists) throw new Error('group_not_found')

      // 👇 Nome do grupo com fallback seguro (prioriza `label` do Firestore)
      const groupName: string =
        groupSnap.get('label') ??
        groupSnap.get('name') ??
        groupSnap.get('nome') ??
        groupSnap.get('title') ??
        gid

      // 2) Atualiza documento do número conforme status
      const numberRef = groupRef.collection('numbers').doc(number)
      const numSnap = await tx.get(numberRef)
      const numData = numSnap.data() as any

      if (numData?.status === 'sold') throw new Error('number_sold')
      if (
        numData?.status === 'reserved' &&
        numData?.lock?.by &&
        numData.lock.by !== requesterUid
      ) {
        throw new Error('reserved_by_other')
      }

      // 3) Gerar venda
      const salesRef = adminDb.collection('sales').doc()
      const vendorName = decoded.name || decoded.email || '—'
      const total = Number(totalRaw ?? 0)
      const status: 'pago' | 'pendente' = statusRaw === 'pendente' ? 'pendente' : 'pago'

      tx.set(
        salesRef,
        {
          // Identificação do grupo
          groupId: gid,
          groupName, // <<<<<<<<<<<<<< grava o NOME do grupo

          // Número/Venda
          number, // string "00".."70" (padNumber)
          numberInt,
          vendorId: requesterUid,
          vendorName,
          clientId,
          clientName,
          region: regionFromBody ?? groupSnap.get('region') ?? null,
          total,
          status,

          // Datas
          date: now,
          createdAt: now,
          updatedAt: now,

          // Campos que você já tinha… (se houver)
          // product, lock, etc.
          lock: null,
        },
        { merge: true }
      )

      if (status === 'pago') {
        tx.set(
          numberRef,
          {
            status: 'sold',
            saleId: salesRef.id,
            saleStatus: 'pago',
            clientName,
            vendorId: requesterUid,
            vendorName,
            total,
            lock: Field.delete(),
            updatedAt: now,
          },
          { merge: true },
        )
      } else {
        tx.set(
          numberRef,
          {
            status: 'reserved',
            saleId: salesRef.id,
            saleStatus: 'pendente',
            clientName,
            vendorId: requesterUid,
            vendorName,
            total,
            updatedAt: now,
          },
          { merge: true },
        )
      }

      return { saleId: salesRef.id }
    })

    return NextResponse.json({ ok: true, ...res })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'tx_failed' }, { status: 400 })
  }
}
