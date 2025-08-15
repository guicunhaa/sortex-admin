export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebaseAdmin'

export async function GET() {
  return NextResponse.json({
    ok: !!adminApp,
    projectId: (adminApp?.options as any)?.projectId || null,
  })
}