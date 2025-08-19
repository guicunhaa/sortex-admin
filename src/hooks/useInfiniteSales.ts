// src/hooks/useInfiniteSales.ts
'use client';

import { useState, useEffect } from 'react';
import { Sale, fetchSalesPage } from './useDashboardData';

export function useInfiniteSales(filter: {
  vendor?: string;
  region?: string;
  status?: string;
}) {
  const [sales, setSales]   = useState<Sale[]>([]);
  const [cursor, setCursor] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    // reset quando filtro muda
    setSales([]);
    setCursor(undefined);
    setDone(false);
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.vendor, filter.region, filter.status]);

  async function loadMore() {
    if (loading || done) return;
    setLoading(true);
    const { sales: chunk, nextCursor } = await fetchSalesPage(filter, 20, cursor);
    setSales((prev) => [...prev, ...chunk]);
    setCursor(nextCursor);
    setDone(!nextCursor);
    setLoading(false);
  }

  return { sales, loadMore, loading, done };
}