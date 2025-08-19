'use server'

import { db } from '@/lib/firebaseAdmin'
import { getAuth } from 'firebase-admin/auth'
import { collection, getDocs } from 'firebase/firestore'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.split('Bearer ')[1]
    if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const decoded = await getAuth().verifyIdToken(token)
    if (decoded.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const [groupsSnap, salesSnap, vendorsSnap, clientsSnap] = await Promise.all([
      getDocs(collection(db, 'groups')),
      getDocs(collection(db, 'sales')),
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'clients')),
    ])

    const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const vendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    return NextResponse.json({
      ok: true,
      groups,
      sales,
      vendors,
      clients,
    })
  } catch (err: any) {
    console.error('admin_snapshot_error', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
