// src/app/api/admin/grant-role/route.ts
import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email, role } = await req.json()

    if (!email || !role) {
      return NextResponse.json({ ok: false, error: 'Email e role são obrigatórios.' }, { status: 400 })
    }

    const user = await adminAuth.getUserByEmail(email)

    await adminAuth.setCustomUserClaims(user.uid, { role })

    return NextResponse.json({ ok: true, message: `Permissão '${role}' atribuída ao usuário ${email}` })
  } catch (error) {
    console.error('Erro ao atribuir permissão:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
