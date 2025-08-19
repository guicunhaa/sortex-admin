// src/app/api/admin/seed-user/route.ts
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const users = [
      {
        uid: 'admin001',
        email: 'admin@teste.com',
        role: 'admin',
      },
      {
        uid: 'vendor001',
        email: 'vendedor@teste.com',
        role: 'vendor',
      },
    ]

    const batch = firestore.batch()
    users.forEach((user) => {
      const ref = firestore.collection('users').doc(user.uid)
      batch.set(ref, user)
    })

    await batch.commit()

    return NextResponse.json({ ok: true, message: 'Usuários criados com sucesso.' })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: false, error: 'Erro ao criar usuários.' }, { status: 500 })
  }
}
