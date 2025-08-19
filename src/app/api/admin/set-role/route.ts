import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { uid, role } = await req.json()

  if (!uid || !role) {
    return NextResponse.json({ ok: false, error: 'Parâmetros inválidos' }, { status: 400 })
  }

  await firestore.collection('users').doc(uid).set({ role }, { merge: true })

  return NextResponse.json({ ok: true, message: 'Papel atualizado com sucesso.' })
}
