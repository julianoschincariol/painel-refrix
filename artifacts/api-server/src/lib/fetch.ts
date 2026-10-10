const REQUEST_TIMEOUT_MS = 10_000;

/** fetch com tempo limite e erro claro quando a resposta não é 2xx. */
export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} em ${new URL(url).hostname}`);
  }
  return resp;
}

export interface YahooChart {
  meta?: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    shortName?: string;
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}

/** Gráfico de um ativo no Yahoo Finance (padrão: últimos 5 dias, diário). */
export async function fetchYahooChart(symbol: string, range = "5d", interval = "1d"): Promise<YahooChart> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const json = (await (
    await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  ).json()) as { chart?: { result?: YahooChart[] } };

  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo sem dados para ${symbol}`);
  return result;
}

export interface Quote {
  price: number;
  /** Fechamento do pregão anterior ao do preço atual */
  previousClose: number | null;
  /** Momento do último negócio (ms) */
  time: number;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Preço atual e fechamento do dia anterior a partir do gráfico diário. */
export function quoteFromChart(chart: YahooChart): Quote {
  const raw = chart.indicators?.quote?.[0]?.close ?? [];
  const stamps = chart.timestamp ?? [];
  const bars = stamps
    .map((t, i) => ({ time: t * 1000, close: raw[i] }))
    .filter((b): b is { time: number; close: number } => typeof b.close === "number");

  const lastBar = bars[bars.length - 1];
  const price = chart.meta?.regularMarketPrice ?? lastBar?.close;
  if (typeof price !== "number") throw new Error("Yahoo sem preço");

  const time = chart.meta?.regularMarketTime ? chart.meta.regularMarketTime * 1000 : (lastBar?.time ?? Date.now());

  // Se a última barra é do mesmo dia do preço atual, o "anterior" é a penúltima
  const prevIndex = lastBar && dayKey(lastBar.time) === dayKey(time) ? bars.length - 2 : bars.length - 1;
  const previousClose = prevIndex >= 0 ? bars[prevIndex].close : null;

  return { price, previousClose, time };
}
