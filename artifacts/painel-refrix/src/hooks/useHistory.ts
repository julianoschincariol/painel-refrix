import { useQuery } from '@tanstack/react-query';
import type { IndicatorId } from '@/hooks/useEconomicIndicators';

export type HistoryRange = '6m' | '12m' | '5y';

export interface HistoryPoint {
  /** yyyy-MM-dd */
  d: string;
  v: number;
}

export type HistorySeries = Partial<Record<IndicatorId, HistoryPoint[] | null>>;

async function fetchHistory(range: HistoryRange, id?: IndicatorId): Promise<HistorySeries> {
  const params = new URLSearchParams({ range });
  if (id) params.set('id', id);
  const resp = await fetch(`/api/history?${params}`, { signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  const json = await resp.json();
  return json?.series ?? {};
}

/** Histórico de todos os indicadores (sem `id`) ou de um só. */
export function useHistory(range: HistoryRange, id?: IndicatorId, enabled = true) {
  return useQuery({
    queryKey: ['history', range, id ?? 'all'],
    queryFn: () => fetchHistory(range, id),
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}
