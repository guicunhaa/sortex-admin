'use server'

import { getAuth } from 'firebase-admin/auth'
import { db } from '@/lib/firebaseAdmin'
import { doc, collection, getDocs, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { groupId } = await req.json()
    if (!groupId) return NextResponse.json({ error: 'missing_groupId' }, { status: 400 })

    const authHeader = req.headers.get('authorization')
    const token = authHeader?.split('Bearer ')[1]
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const decoded = await getAuth().verifyIdToken(token)
    if (decoded.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const groupRef = doc(db, 'groups', groupId)
    const numbersRef = collection(db, `groups/${groupId}/numbers`)

    let drawnNumber: number | null = null

    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef)
      if (!groupSnap.exists()) throw new Error('group_not_found')

      const group = groupSnap.data()
      if (group.status === 'closed') throw new Error('already_closed')

      const numSnap = await getDocs(numbersRef)
      const paidNumbers = numSnap.docs
        .filter(doc => doc.data().status === 'sold')
        .map(doc => Number(doc.id))

      if (paidNumbers.length > 0) {
        const index = Math.floor(Math.random() * paidNumbers.length)
        drawnNumber = paidNumbers[index]
      }

      tx.update(groupRef, {
        status: 'closed',
        endsAt: group.endsAt || serverTimestamp(),
        drawnNumber: drawnNumber ?? null,
        updatedAt: serverTimestamp(),
      })
    })

    return NextResponse.json({ ok: true, drawnNumber })
  } catch (err: any) {
    console.error('close_and_draw_error', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

