// src/hooks/useDashboardData.ts
'use client';

import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
  type DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

/* ─────────── Tipos ─────────── */

export interface Sale {
  id: string;
  date: Date;
  vendorId: string;
  vendorName: string;
  region: string;
  product: string;
  quantity: number;
  total: number;
  status: string;
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalItems: number;
  ticket: number;
  byDay:    { day: string; value: number }[];
  byVendor: { name: string; value: number }[];
}

/* ─────────── Helpers ─────────── */

function transformSnap(docSnap: any): Sale {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    ...d,
    date: (d.date as Timestamp).toDate(),
  };
}

/* ─────────── Leitura com paginação ─────────── */

export async function fetchSalesPage(
  filter: { vendor?: string; region?: string; status?: string },
  pageSize = 20,
  cursor?: DocumentSnapshot
): Promise<{ sales: Sale[]; nextCursor?: DocumentSnapshot }> {
  const base = collection(db, 'sales');
  const constraints: QueryConstraint[] = [
    orderBy('date', 'desc'),
    limit(pageSize),
  ];

  if (filter.vendor) constraints.push(where('vendorId', '==', filter.vendor));
  if (filter.region) constraints.push(where('region',   '==', filter.region));
  if (filter.status) constraints.push(where('status',   '==', filter.status));
  if (cursor)        constraints.push(startAfter(cursor));

  const snap = await getDocs(query(base, ...constraints));
  return {
    sales: snap.docs.map(transformSnap),
    nextCursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : undefined,
  };
}

/* ─────────── Métricas ─────────── */

function computeMetrics(sales: Sale[]): DashboardMetrics {
  const totalRevenue = sales.reduce((s, r) => s + r.total, 0);
  const totalItems   = sales.reduce((s, r) => s + r.quantity, 0);
  const ticket       = totalItems ? totalRevenue / totalItems : 0;

  const mapDay = new Map<string, number>();
  sales.forEach((r) => {
    const key = r.date.toISOString().slice(0, 10);
    mapDay.set(key, (mapDay.get(key) ?? 0) + r.total);
  });
  const byDay = Array.from(mapDay, ([day, value]) => ({ day, value }))
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

  const mapVendor = new Map<string, number>();
  sales.forEach((r) => {
    mapVendor.set(r.vendorName, (mapVendor.get(r.vendorName) ?? 0) + r.total);
  });
  const byVendor = Array.from(mapVendor, ([name, value]) => ({ name, value }));

  return { totalRevenue, totalItems, ticket, byDay, byVendor };
}

/* ─────────── Hook com paginação ─────────── */

export function useDashboardData(filter: {
  vendor?: string;
  region?: string;
  status?: string;
}) {
  const [data, setData] = useState<{
    sales: Sale[];
    metrics: DashboardMetrics;
    nextCursor?: DocumentSnapshot;
  } | null>(null);

  useEffect(() => {
    setData(null); // mostra “Carregando…” a cada troca de filtro
    fetchSalesPage(filter)
      .then(({ sales, nextCursor }) => {
        setData({ sales, metrics: computeMetrics(sales), nextCursor });
      })
      .catch(console.error);
  }, [filter.vendor, filter.region, filter.status]);

  return data;
}