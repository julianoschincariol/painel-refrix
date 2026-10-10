import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type IndicatorStatus = 'ok' | 'fallback' | 'manual' | 'error';
export type ManualId = 'pet';
type AutoId = 'ipca' | 'selic' | 'dolar' | 'brent' | 'acucar' | 'diesel' | 'icc';
/** Como mostrar a variação: % (preços), p.p. (taxas) ou pontos (índices) */
export type DeltaMode = 'pct' | 'pp' | 'pts';
export type IndicatorId = AutoId | ManualId;

export interface Indicator {
  id: IndicatorId;
  name: string;
  value: number;
  previousValue?: number;
  previousLabel?: string;
  unit: string;
  label: string;
  status: IndicatorStatus;
  /** Texto curto sobre a data do dado, ex.: "ref. 09/10/2026" */
  refLabel: string;
  sourceType: 'Automático' | 'Manual';
  source?: string;
  /** Taxas (%) variam em pontos percentuais; preços variam em %; índices, em pontos */
  deltaMode: DeltaMode;
  /** Legenda do valor principal, quando o card tem duas cotações */
  primaryLabel?: string;
  /** Segunda cotação do card (ex.: diesel em São Paulo) */
  secondary?: { label: string; value: number; previousValue?: number };
}

interface EconomicData {
  indicators: Indicator[];
  isLoading: boolean;
  lastRefresh: Date | null;
  refresh: (force?: boolean) => Promise<void>;
  statusGeral: { ok: number; partial: number; error: number; totalAuto: number };
  isOffline: boolean;
  /** Onde os valores manuais ficam: no servidor (compartilhado) ou só neste navegador */
  manualStorage: 'server' | 'local';
  setManualValue: (id: ManualId, value: number, password?: string) => Promise<void>;
}

const num = (v: number, digits: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

interface IndicatorDef {
  name: string;
  unit: string;
  format: (v: number) => string;
  deltaMode: DeltaMode;
  /** Valor usado só se nunca houve leitura real nem valor salvo */
  fallback: number;
  /** Indicadores mensais mostram "set/2026" em vez do dia */
  monthly?: boolean;
  primaryLabel?: string;
}

const DEFS: Record<IndicatorId, IndicatorDef> = {
  ipca: { name: 'IPCA 12M', unit: '%', format: v => num(v, 2) + '%', deltaMode: 'pp', fallback: 4.39, monthly: true },
  selic: { name: 'SELIC META', unit: '%', format: v => num(v, 2) + '%', deltaMode: 'pp', fallback: 14.5 },
  dolar: { name: 'DÓLAR PTAX', unit: 'R$', format: v => 'R$ ' + num(v, 4), deltaMode: 'pct', fallback: 5.02 },
  brent: { name: 'PETRÓLEO BRENT', unit: 'US$/bbl', format: v => 'US$ ' + num(v, 2), deltaMode: 'pct', fallback: 96 },
  diesel: { name: 'DIESEL S10', unit: 'R$/L', format: v => 'R$ ' + num(v, 2), deltaMode: 'pct', fallback: 7.35, primaryLabel: 'Média Brasil' },
  acucar: { name: 'AÇÚCAR CRISTAL CEPEA', unit: 'R$/sc', format: v => 'R$ ' + num(v, 2), deltaMode: 'pct', fallback: 141 },
  pet: { name: 'PET VIRGEM', unit: 'US$/t', format: v => 'US$ ' + num(v, 2), deltaMode: 'pct', fallback: 916 },
  icc: { name: 'ICC FGV', unit: 'pts', format: v => num(v, 1) + ' pts', deltaMode: 'pts', fallback: 84.2, monthly: true },
};

const AUTO_IDS: AutoId[] = ['ipca', 'selic', 'dolar', 'brent', 'acucar', 'diesel', 'icc'];
const MANUAL_IDS: ManualId[] = ['pet'];
/** Ordem dos cards na tela */
const ORDER: IndicatorId[] = ['ipca', 'selic', 'dolar', 'brent', 'acucar', 'diesel', 'pet', 'icc'];

const API_URL = '/api/indicators';

// ---------- Armazenamento local ----------

interface StoredReading {
  value: number;
  previousValue?: number;
  /** yyyy-MM-dd (automático) ou ISO completo (manual) */
  date: string;
  source?: string;
  secondary?: { label: string; value: number; previousValue?: number };
}

const LAST_GOOD_KEY = 'refrix_last_good_v1';
const MANUAL_KEY = 'refrix_manual_v2';
const LEGACY_MANUAL_KEY = 'refrix_manual_values';

function readStore(key: string): Record<string, StoredReading> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function writeStore(key: string, data: Record<string, StoredReading>) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function loadManualValues(): Record<string, StoredReading> {
  const stored = readStore(MANUAL_KEY);
  // Migra valores da versão anterior ({ pet: 916, icc: 88.8 })
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_MANUAL_KEY) ?? 'null');
    if (legacy && typeof legacy === 'object') {
      for (const id of ['pet'] as const) {
        if (!stored[id] && typeof legacy[id] === 'number') {
          stored[id] = { value: legacy[id], date: '' };
        }
      }
    }
  } catch {}
  return stored;
}

// ---------- Montagem dos indicadores ----------

function formatDate(iso: string, monthly?: boolean): string {
  const d = parseISO(iso);
  if (!isValid(d)) return '--';
  return monthly ? format(d, 'MMM/yyyy', { locale: ptBR }) : format(d, 'dd/MM/yyyy');
}

function buildIndicator(
  id: IndicatorId,
  reading: StoredReading | undefined,
  status: IndicatorStatus,
): Indicator {
  const def = DEFS[id];
  const value = reading?.value ?? def.fallback;
  const previousValue = reading?.previousValue;
  const isManual = MANUAL_IDS.includes(id as ManualId);

  let refLabel: string;
  if (!reading) {
    refLabel = 'valor de reserva';
  } else if (isManual) {
    const d = parseISO(reading.date);
    refLabel = isValid(d) ? 'editado ' + format(d, 'dd/MM HH:mm') : 'manual';
  } else if (status === 'fallback') {
    refLabel = 'último: ' + formatDate(reading.date, def.monthly);
  } else if (id === 'selic') {
    refLabel = 'desde ' + formatDate(reading.date);
  } else {
    refLabel = 'ref. ' + formatDate(reading.date, def.monthly);
  }

  return {
    id,
    name: def.name,
    value,
    previousValue,
    previousLabel: previousValue !== undefined ? def.format(previousValue) : undefined,
    unit: def.unit,
    label: def.format(value),
    status,
    refLabel,
    sourceType: isManual ? 'Manual' : 'Automático',
    source: reading?.source,
    deltaMode: def.deltaMode,
    primaryLabel: reading?.secondary ? def.primaryLabel : undefined,
    secondary: reading?.secondary,
  };
}

function buildIndicators(
  autoReadings: Record<string, StoredReading>,
  autoStatus: Partial<Record<AutoId, IndicatorStatus>>,
  manualReadings: Record<string, StoredReading>,
): Indicator[] {
  return ORDER.map(id =>
    MANUAL_IDS.includes(id as ManualId)
      ? buildIndicator(id, manualReadings[id], 'manual')
      : buildIndicator(id, autoReadings[id], autoStatus[id as AutoId] ?? 'fallback'),
  );
}

interface ApiResult {
  id: string;
  ok: boolean;
  value?: number;
  previousValue?: number | null;
  refDate?: string;
  source?: string;
  secondary?: { label: string; value: number; previousValue: number | null };
  error?: string;
}

async function fetchAutoIndicators(force: boolean): Promise<ApiResult[]> {
  const resp = await fetch(force ? API_URL + '?force=1' : API_URL, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json?.results)) throw new Error('Resposta inesperada do servidor');
  return json.results;
}

// ---------- Valores manuais no servidor ----------

const MANUAL_API_URL = '/api/manual';

interface ServerManualState {
  value: number;
  previousValue: number | null;
  updatedAt: string;
}

type ServerManualValues = Partial<Record<ManualId, ServerManualState | null>>;

/** Erro ao salvar valor manual; `kind` diz se o problema foi a senha. */
export class ManualSaveError extends Error {
  constructor(
    message: string,
    public kind: 'password' | 'not_configured' | 'failed',
  ) {
    super(message);
  }
}

function toReadings(values: ServerManualValues): Record<string, StoredReading> {
  const out: Record<string, StoredReading> = {};
  for (const id of MANUAL_IDS) {
    const v = values[id];
    if (v) out[id] = { value: v.value, previousValue: v.previousValue ?? undefined, date: v.updatedAt };
  }
  return out;
}

/** Valores manuais do servidor, ou null se o servidor não tiver banco. */
async function fetchManualValues(): Promise<ServerManualValues | null> {
  const resp = await fetch(MANUAL_API_URL, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  const json = await resp.json();
  return json?.storage === 'server' && json.values ? json.values : null;
}

/** Formata um valor no padrão do indicador (ex.: "R$ 4,9892", "4,58%"). */
export function formatIndicatorValue(id: IndicatorId, value: number): string {
  return DEFS[id].format(value);
}

// ---------- Hook ----------

export function useEconomicIndicators(): EconomicData {
  const [indicators, setIndicators] = useState<Indicator[]>(() =>
    buildIndicators(readStore(LAST_GOOD_KEY), {}, loadManualValues()),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [manualStorage, setManualStorage] = useState<'server' | 'local'>('local');

  const refresh = useCallback(async (force = false) => {
    setIsLoading(true);
    const lastGood = readStore(LAST_GOOD_KEY);
    const autoStatus: Partial<Record<AutoId, IndicatorStatus>> = {};

    const [autoResult, manualResult] = await Promise.allSettled([
      fetchAutoIndicators(force),
      fetchManualValues(),
    ]);

    if (autoResult.status === 'fulfilled') {
      for (const r of autoResult.value) {
        const id = r.id as AutoId;
        if (!AUTO_IDS.includes(id)) continue;
        if (r.ok && typeof r.value === 'number' && r.refDate) {
          lastGood[id] = {
            value: r.value,
            previousValue: r.previousValue ?? undefined,
            date: r.refDate,
            source: r.source,
            secondary: r.secondary
              ? {
                  label: r.secondary.label,
                  value: r.secondary.value,
                  previousValue: r.secondary.previousValue ?? undefined,
                }
              : undefined,
          };
          autoStatus[id] = 'ok';
        } else {
          console.warn(`[painel] ${id}: ${r.error ?? 'sem dados'}`);
        }
      }
      writeStore(LAST_GOOD_KEY, lastGood);
    } else {
      console.warn('[painel] Falha ao consultar /api/indicators:', autoResult.reason);
    }

    // Com banco no servidor, os valores manuais são compartilhados; a cópia
    // local serve só de reserva se o servidor não responder.
    let manualReadings = loadManualValues();
    if (manualResult.status === 'fulfilled' && manualResult.value) {
      manualReadings = toReadings(manualResult.value);
      writeStore(MANUAL_KEY, manualReadings);
      setManualStorage('server');
    } else if (manualResult.status === 'fulfilled') {
      setManualStorage('local');
    } else {
      console.warn('[painel] Falha ao consultar /api/manual:', manualResult.reason);
    }

    setIndicators(buildIndicators(lastGood, autoStatus, manualReadings));
    setLastRefresh(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const applyManualReadings = useCallback((readings: Record<string, StoredReading>) => {
    setIndicators(current =>
      current.map(ind =>
        MANUAL_IDS.includes(ind.id as ManualId) ? buildIndicator(ind.id, readings[ind.id], 'manual') : ind,
      ),
    );
  }, []);

  const setManualValue = useCallback(
    async (id: ManualId, value: number, password?: string) => {
      if (manualStorage === 'local') {
        const stored = loadManualValues();
        const previous = stored[id]?.value ?? DEFS[id].fallback;
        stored[id] = {
          value,
          previousValue: previous !== value ? previous : stored[id]?.previousValue,
          date: new Date().toISOString(),
        };
        writeStore(MANUAL_KEY, stored);
        applyManualReadings(stored);
        return;
      }

      const resp = await fetch(MANUAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value, password }),
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);

      if (!resp) throw new ManualSaveError('Sem conexão com o servidor. Tente de novo.', 'failed');
      const json = await resp.json().catch(() => ({}));
      if (resp.status === 401) throw new ManualSaveError('Senha incorreta.', 'password');
      if (resp.status === 503) {
        throw new ManualSaveError('A senha de edição ainda não foi configurada no servidor.', 'not_configured');
      }
      if (!resp.ok || !json?.values) {
        throw new ManualSaveError(json?.error ?? 'Não foi possível salvar o valor.', 'failed');
      }

      const readings = toReadings(json.values);
      writeStore(MANUAL_KEY, readings);
      applyManualReadings(readings);
    },
    [manualStorage, applyManualReadings],
  );

  const autoIndicators = indicators.filter(i => i.sourceType === 'Automático');
  const statusGeral = {
    ok: autoIndicators.filter(i => i.status === 'ok').length,
    partial: autoIndicators.filter(i => i.status === 'fallback').length,
    error: autoIndicators.filter(i => i.status === 'error').length,
    totalAuto: autoIndicators.length,
  };

  const isOffline = autoIndicators.length > 0 && statusGeral.ok === 0 && !isLoading;

  return { indicators, isLoading, lastRefresh, refresh, statusGeral, isOffline, manualStorage, setManualValue };
}
