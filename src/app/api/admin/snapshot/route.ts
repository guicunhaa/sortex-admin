import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/admin/snapshot?vendorId=...&region=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const ah = req.headers.get('authorization') ?? ''
    const token = ah.startsWith('Bearer ') ? ah.slice(7) : ''
    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null)
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })
    }

    const claims = (decoded as any) || {}
    const isAdmin = claims.admin === true || claims.role === 'admin'
    const uid = (decoded as any).uid as string

    // Filtros da URL
    const qsVendor = url.searchParams.get('vendorId') || undefined
    const qsRegion = url.searchParams.get('region') || undefined

    // Admin pode mirar qualquer vendorId; vendor só enxerga o próprio
    const vendorId = isAdmin ? qsVendor : uid
    const region = qsRegion && qsRegion !== 'todas' ? qsRegion : undefined

    // -------- Groups count (por vendor quando definido) --------
    let groupsRef = adminDb.collection('groups') as FirebaseFirestore.Query
    if (vendorId) groupsRef = groupsRef.where('vendorId', '==', vendorId)
    const groupsSnap = await groupsRef.limit(2000).get().catch(() => null)
    const groupsCount = groupsSnap ? groupsSnap.size : 0

    // -------- Sales snapshot com filtros --------
    const salesRefBase = adminDb.collection('sales') as FirebaseFirestore.Query
    const build = (withRegion: boolean) => {
      let q = salesRefBase
      if (vendorId) q = q.where('vendorId', '==', vendorId)
      if (withRegion && region) q = q.where('region', '==', region)
      return q.limit(5000) // segurança: snapshot leve
    }

    let salesSnap: FirebaseFirestore.QuerySnapshot | null = null
    try {
      salesSnap = await build(true).get()
    } catch {
      // Fallback: se índice composto vendorId+region faltar, busca sem region e filtra em memória
      const tmp = await build(false).get()
      const arr = tmp.docs.filter(d => {
        if (!region) return true
        const r = (d.data() as any)?.region || null
        return r === region
      })
      // Simula um QuerySnapshot mínimo
      ;(arr as any).size = arr.length
      salesSnap = { docs: arr } as any
    }

    const salesDocs = salesSnap?.docs ?? []
    let total = 0
    let paid = 0
    let pending = 0
    let canceled = 0
    let revenuePaid = 0

    for (const d of salesDocs) {
      const s = d.data() as any
      total++
      switch (s?.status) {
        case 'pago':
          paid++
          revenuePaid += Number(s?.total || 0)
          break
        case 'pendente':
          pending++
          break
        case 'cancelada':
        case 'cancelado':
          canceled++
          break
        default:
          break
      }
    }

    return NextResponse.json({
      ok: true,
      filters: { vendorId: vendorId ?? null, region: region ?? null },
      groupsCount,
      sales: { total, paid, pending, canceled, revenuePaid },
    })
  } catch (e: any) {
    console.error('GET /api/admin/snapshot error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
