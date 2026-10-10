import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { fetchWithTimeout, fetchYahooChart, quoteFromChart } from "../lib/fetch";
import { getCepeaSugar } from "../lib/cepea";
import { getDieselPrices } from "../lib/diesel";
import { getIcc } from "../lib/fgv-icc";
import { fetchSgs, toBrDate, toIsoDate } from "../lib/bcb";

// Busca os indicadores automáticos no servidor (sem proxy de terceiros e sem
// problema de CORS) e guarda o resultado em cache por alguns minutos.

export interface IndicatorReading {
  id: string;
  ok: true;
  value: number;
  previousValue: number | null;
  /** Data de referência do dado, no formato yyyy-MM-dd */
  refDate: string;
  source: string;
  /** Segunda cotação mostrada no card (ex.: diesel em São Paulo) */
  secondary?: { label: string; value: number; previousValue: number | null };
}

export interface IndicatorFailure {
  id: string;
  ok: false;
  error: string;
}

export interface IndicatorsResponse {
  fetchedAt: string;
  results: Array<IndicatorReading | IndicatorFailure>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchIpca(): Promise<IndicatorReading> {
  // 13522 = IPCA acumulado em 12 meses
  const points = await fetchSgs(13522, "/ultimos/2?formato=json");
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  return {
    id: "ipca",
    ok: true,
    value: last.value,
    previousValue: prev?.value ?? null,
    refDate: last.date,
    source: "BCB/SGS 13522",
  };
}

async function fetchSelic(): Promise<IndicatorReading> {
  // 432 = Selic meta. A série repete o valor todo dia (e traz datas futuras até
  // a próxima reunião do Copom), então o "anterior" é o último valor diferente.
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 2);
  const today = toIsoDate(new Date());
  const points = (await fetchSgs(432, `?formato=json&dataInicial=${toBrDate(start)}`)).filter(
    (p) => p.date <= today,
  );
  if (points.length === 0) throw new Error("Selic sem dados até hoje");

  const last = points[points.length - 1];
  let previousValue: number | null = null;
  let since = points[0].date;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].value !== last.value) {
      previousValue = points[i].value;
      since = points[i + 1].date;
      break;
    }
  }
  return {
    id: "selic",
    ok: true,
    value: last.value,
    previousValue,
    // Data em que a meta atual passou a valer
    refDate: since,
    source: "BCB/SGS 432",
  };
}

async function fetchDolar(): Promise<IndicatorReading> {
  // 1 = Dólar PTAX venda (diário). Pegar os 2 últimos evita falhar em fim de
  // semana, feriado ou antes da divulgação do dia.
  const points = await fetchSgs(1, "/ultimos/2?formato=json");
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  return {
    id: "dolar",
    ok: true,
    value: last.value,
    previousValue: prev?.value ?? null,
    refDate: last.date,
    source: "BCB/PTAX",
  };
}

async function fetchBrentYahoo(): Promise<IndicatorReading> {
  const quote = quoteFromChart(await fetchYahooChart("BZ=F"));
  return {
    id: "brent",
    ok: true,
    value: quote.price,
    previousValue: quote.previousClose,
    refDate: toIsoDate(new Date(quote.time)),
    source: "Yahoo Finance (BZ=F)",
  };
}

async function fetchBrentFred(): Promise<IndicatorReading> {
  // Reserva: preço spot do Brent no FRED (sem chave, mas com alguns dias de atraso)
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd=${toIsoDate(start)}`;
  const text = await (await fetchWithTimeout(url)).text();

  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, raw] = line.split(",");
      return { date, value: Number(raw) };
    })
    .filter((r) => r.date && Number.isFinite(r.value));

  if (rows.length === 0) throw new Error("FRED sem dados do Brent");
  const last = rows[rows.length - 1];
  return {
    id: "brent",
    ok: true,
    value: last.value,
    previousValue: rows.length > 1 ? rows[rows.length - 2].value : null,
    refDate: last.date,
    source: "FRED (spot)",
  };
}

async function fetchBrent(): Promise<IndicatorReading> {
  try {
    return await fetchBrentYahoo();
  } catch (err) {
    logger.warn({ err }, "Brent via Yahoo falhou, tentando FRED");
    return fetchBrentFred();
  }
}

async function fetchAcucar(): Promise<IndicatorReading> {
  // Indicador do açúcar cristal branco CEPEA/Esalq - São Paulo (R$/saca 50 kg)
  const sp = (await getCepeaSugar()).series.find((s) => s.id === "sp");
  if (!sp || sp.rows.length === 0) throw new Error("CEPEA sem indicador de São Paulo");
  const last = sp.rows[0];
  return {
    id: "acucar",
    ok: true,
    value: last.brl,
    previousValue: sp.rows[1]?.brl ?? null,
    refDate: last.date,
    source: "CEPEA/Esalq-USP",
  };
}

async function fetchDiesel(): Promise<IndicatorReading> {
  // Preço médio Brasil no valor principal; São Paulo como segunda cotação
  const d = await getDieselPrices();
  return {
    id: "diesel",
    ok: true,
    value: d.br.value,
    previousValue: d.br.previousValue,
    refDate: d.refDate,
    source: "Petrobras (via combustivelapi.com.br)",
    secondary: { label: "São Paulo", value: d.sp.value, previousValue: d.sp.previousValue },
  };
}

async function fetchIcc(): Promise<IndicatorReading> {
  // Índice de Confiança do Consumidor da FGV (mensal, dessazonalizado)
  const icc = await getIcc();
  return {
    id: "icc",
    ok: true,
    value: icc.value,
    previousValue: icc.previousValue,
    refDate: icc.refDate,
    source: "FGV IBRE",
  };
}

const FETCHERS: Record<string, () => Promise<IndicatorReading>> = {
  ipca: fetchIpca,
  selic: fetchSelic,
  dolar: fetchDolar,
  brent: fetchBrent,
  acucar: fetchAcucar,
  diesel: fetchDiesel,
  icc: fetchIcc,
};

async function loadAll(): Promise<IndicatorsResponse> {
  const ids = Object.keys(FETCHERS);
  const settled = await Promise.allSettled(ids.map((id) => FETCHERS[id]()));

  const results = settled.map((r, i): IndicatorReading | IndicatorFailure => {
    if (r.status === "fulfilled") return r.value;
    const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
    logger.warn({ id: ids[i], error }, "Falha ao buscar indicador");
    return { id: ids[i], ok: false, error };
  });

  return { fetchedAt: new Date().toISOString(), results };
}

let cache: { at: number; body: IndicatorsResponse } | null = null;
let inFlight: Promise<IndicatorsResponse> | null = null;

async function getIndicators(force: boolean): Promise<IndicatorsResponse> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.body;
  if (!inFlight) {
    inFlight = loadAll()
      .then((body) => {
        // Só guarda em cache se ao menos um indicador veio certo
        if (body.results.some((r) => r.ok)) cache = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

const router: IRouter = Router();

router.get("/indicators", async (req, res) => {
  const body = await getIndicators(req.query["force"] === "1");
  res.json(body);
});

export default router;
