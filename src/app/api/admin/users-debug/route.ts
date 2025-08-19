import { firestore } from '@/lib/firebaseAdmin'
import { NextResponse } from 'next/server'

export const GET = async () => {
  try {
    const snapshot = await firestore.collection('users').get()
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json({ ok: true, users })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
