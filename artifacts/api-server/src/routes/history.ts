import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { fetchYahooChart } from "../lib/fetch";
import { fetchSgs, toBrDate, toIsoDate } from "../lib/bcb";
import { getCepeaSugar } from "../lib/cepea";
import { getIccHistory } from "../lib/fgv-icc";
import {
  MANUAL_IDS,
  type ManualId,
  type Point,
  getDailyReadings,
  getManualHistory,
} from "../lib/store";

// Histórico dos indicadores para os gráficos do painel.
// GET /api/history?range=12m            -> todos os indicadores
// GET /api/history?range=5y&id=dolar    -> só um

const RANGES = {
  "6m": { months: 6, yahoo: "6mo", interval: "1d" },
  "12m": { months: 12, yahoo: "1y", interval: "1d" },
  "5y": { months: 60, yahoo: "5y", interval: "1wk" },
} as const;
type Range = keyof typeof RANGES;

const IDS = ["ipca", "selic", "dolar", "brent", "acucar", "diesel", "icc", ...MANUAL_IDS] as const;
type HistoryId = (typeof IDS)[number];

/** Máximo de pontos por série (gráfico não precisa de mais que isso) */
const MAX_POINTS = 260;
const CACHE_TTL_MS = 60 * 60 * 1000;

function startDate(range: Range): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - RANGES[range].months);
  return d;
}

/** Reduz a série a no máximo `max` pontos, mantendo sempre o último. */
function downsample(points: Point[], max = MAX_POINTS): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

async function sgsHistory(serie: number, range: Range): Promise<Point[]> {
  const today = toIsoDate(new Date());
  const points = await fetchSgs(
    serie,
    `?formato=json&dataInicial=${toBrDate(startDate(range))}&dataFinal=${toBrDate(new Date())}`,
  );
  // A Selic meta traz datas futuras (até a próxima reunião do Copom)
  return points.filter((p) => p.date <= today).map((p) => ({ d: p.date, v: p.value }));
}

async function yahooHistory(symbol: string, range: Range): Promise<Point[]> {
  const chart = await fetchYahooChart(symbol, RANGES[range].yahoo, RANGES[range].interval);
  const closes = chart.indicators?.quote?.[0]?.close ?? [];
  return (chart.timestamp ?? [])
    .map((t, i) => ({ d: toIsoDate(new Date(t * 1000)), v: closes[i] }))
    .filter((p): p is Point => typeof p.v === "number");
}

async function cepeaHistory(range: Range): Promise<Point[]> {
  const since = toIsoDate(startDate(range));
  // Junta o que já foi salvo no banco com o que a página mostra hoje
  const byDay = new Map<string, number>();
  for (const p of await getDailyReadings("acucar", since)) byDay.set(p.d, p.v);
  try {
    const sp = (await getCepeaSugar()).series.find((s) => s.id === "sp");
    for (const r of sp?.rows ?? []) if (r.date >= since) byDay.set(r.date, r.brl);
  } catch (err) {
    logger.warn({ err }, "CEPEA indisponível para o histórico");
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ d, v }));
}

async function dieselHistory(range: Range): Promise<Point[]> {
  // Antes de ser automático o diesel era digitado à mão: junta as duas fontes
  const byDay = new Map<string, number>();
  for (const p of await getManualHistory("diesel", startDate(range))) byDay.set(p.d, p.v);
  for (const p of await getDailyReadings("diesel", toIsoDate(startDate(range)))) byDay.set(p.d, p.v);
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ d, v }));
}

async function loadSeries(id: HistoryId, range: Range): Promise<Point[]> {
  switch (id) {
    case "ipca":
      return sgsHistory(13522, range);
    case "selic":
      return sgsHistory(432, range);
    case "dolar":
      return sgsHistory(1, range);
    case "brent":
      return yahooHistory("BZ=F", range);
    case "acucar":
      return cepeaHistory(range);
    case "diesel":
      return dieselHistory(range);
    case "icc":
      return getIccHistory(toIsoDate(startDate(range)));
    default:
      return getManualHistory(id, startDate(range));
  }
}

const cache = new Map<string, { at: number; points: Point[] }>();

/** Chamado quando um valor manual muda, para o gráfico refletir na hora. */
export function clearHistoryCache(): void {
  for (const key of cache.keys()) {
    if (MANUAL_IDS.some((m) => key.startsWith(`${m}:`))) cache.delete(key);
  }
}

async function getSeries(id: HistoryId, range: Range): Promise<Point[] | null> {
  const key = `${id}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.points;
  try {
    const points = downsample(await loadSeries(id, range));
    cache.set(key, { at: Date.now(), points });
    return points;
  } catch (err) {
    logger.warn({ err, id, range }, "Falha ao montar histórico");
    return hit?.points ?? null;
  }
}

const router: IRouter = Router();

router.get("/history", async (req, res) => {
  const range = String(req.query["range"] ?? "12m") as Range;
  if (!(range in RANGES)) {
    res.status(400).json({ error: "Período inválido (use 6m, 12m ou 5y)" });
    return;
  }
  const idParam = req.query["id"];
  const ids: readonly HistoryId[] =
    typeof idParam === "string" ? (IDS.includes(idParam as HistoryId) ? [idParam as HistoryId] : []) : IDS;
  if (ids.length === 0) {
    res.status(400).json({ error: "Indicador inválido" });
    return;
  }

  const results = await Promise.all(ids.map((id) => getSeries(id, range)));
  const series: Partial<Record<HistoryId, Point[] | null>> = {};
  ids.forEach((id, i) => {
    series[id] = results[i];
  });
  res.json({ range, series });
});

export default router;
