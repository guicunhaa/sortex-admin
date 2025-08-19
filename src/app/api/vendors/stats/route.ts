// src/app/api/vendors/stats/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

function toLabel(d: FirebaseFirestore.DocumentSnapshot): { id: string; label: string | null } | null {
  if (!d.exists) return null
  const v = d.data() as any
  return { id: d.id, label: v?.label ?? null }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })

    const dec = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!dec) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })

    const claims = dec as any
    const isAdmin = claims.admin === true || claims.role === 'admin'
    const reqVendor = url.searchParams.get('vendorId') || ''
    const vendorId = isAdmin ? (reqVendor || (dec as any).uid) : (dec as any).uid
    const email = (dec as any).email || null

    // --- Grupos criados (robusto: vendorId OU createdBy) ---
    let createdSnap: FirebaseFirestore.QuerySnapshot | null = null
    try {
      createdSnap = await adminDb
        .collection('groups')
        .where('vendorId', '==', vendorId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()
    } catch {
      createdSnap = null
    }

    if (!createdSnap || createdSnap.empty) {
      // fallback para bases antigas
      try {
        createdSnap = await adminDb
          .collection('groups')
          .where('createdBy', '==', vendorId)
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get()
      } catch {
        createdSnap = null
      }
    }

    const createdGroups = (createdSnap?.docs ?? []).map((d) => ({ id: d.id, label: (d.data() as any)?.label ?? null }))

    // --- Grupos com venda (a partir de sales) ---
    let salesSnap: FirebaseFirestore.QuerySnapshot | null = null
    try {
      salesSnap = await adminDb
        .collection('sales')
        .where('vendorId', '==', vendorId)
        .limit(2000)
        .get()
    } catch {
      salesSnap = null
    }

    if ((!salesSnap || salesSnap.empty) && email) {
      // fallback opcional por e-mail, caso a coleção salve email em vez de uid
      try {
        salesSnap = await adminDb
          .collection('sales')
          .where('vendorEmail', '==', email)
          .limit(2000)
          .get()
      } catch {
        // ignore
      }
    }

    const soldGroupIds = Array.from(
      new Set((salesSnap?.docs ?? []).map((d) => (d.data() as any)?.groupId).filter(Boolean))
    ) as string[]

    // Resolve labels de forma robusta doc-a-doc (evita where('__name__','in',...))
    let soldGroups: { id: string; label: string | null }[] = []
    if (soldGroupIds.length) {
      const ids = soldGroupIds.slice(0, 80) // limite de segurança
      const docs = await Promise.all(ids.map((id) => adminDb.collection('groups').doc(id).get()))
      soldGroups = docs.map(toLabel).filter(Boolean) as { id: string; label: string | null }[]
    }

    // Participa = união de criados ∪ vendidos
    const pMap = new Map<string, { id: string; label: string | null }>()
    for (const g of createdGroups) pMap.set(g.id, g)
    for (const g of soldGroups) pMap.set(g.id, g)
    const participating = Array.from(pMap.values())

    return NextResponse.json({ ok: true, createdGroups, soldGroups, participating })
  } catch (e: any) {
    console.error('vendors/stats', e)
    return NextResponse.json({ ok: false, error: e?.message || 'stats_failed' }, { status: 500 })
  }
}
