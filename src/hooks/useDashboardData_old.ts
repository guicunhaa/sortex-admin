// src/hooks/useDashboardData.ts
'use client';

import { db } from '@/lib/firebase';                // sua instância
import { collection, getDocs, query } from 'firebase/firestore';

export async function fetchSales() {
  // lê a coleção “sales”
  const q = query(collection(db, 'sales'));
  const snap = await getDocs(q);

  // transforma em array de objetos { id, …data }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Hook React que devolve os dados
 * (renderiza <Loading /> enquanto busca)
 */
import { useState, useEffect } from 'react';

export function useDashboardData() {
  const [data, setData] = useState<unknown[] | null>(null);

  useEffect(() => {
    fetchSales().then(setData).catch(console.error);
  }, []);

  return data;
}