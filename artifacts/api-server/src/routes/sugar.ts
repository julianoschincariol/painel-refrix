import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { fetchYahooChart, quoteFromChart } from "../lib/fetch";
import { getCepeaSugar } from "../lib/cepea";

// Açúcar demerara na bolsa de Nova York (ICE Sugar #11, antigo NYBOT), em
// centavos de dólar por libra-peso. Mesmos contratos e preços que o
// Investing.com / Notícias Agrícolas mostram.

export interface SugarContract {
  symbol: string;
  /** Ex.: "Mar/27" */
  label: string;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  /** ISO do último negócio */
  time: string;
}

export interface SugarResponse {
  fetchedAt: string;
  unit: string;
  source: string;
  contracts: SugarContract[];
}

// Vencimentos do Sugar #11: março, maio, julho e outubro
const MONTHS: Array<{ month: number; code: string; label: string }> = [
  { month: 3, code: "H", label: "Mar" },
  { month: 5, code: "K", label: "Mai" },
  { month: 7, code: "N", label: "Jul" },
  { month: 10, code: "V", label: "Out" },
];

const CONTRACTS_SHOWN = 4;
const CANDIDATES = 6;
/** Contrato sem negócio há mais que isso é considerado vencido */
const MAX_STALE_MS = 10 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Próximos vencimentos cujo mês de entrega ainda não começou. */
function upcomingContracts(now: Date): Array<{ symbol: string; label: string }> {
  const list: Array<{ symbol: string; label: string }> = [];
  for (let year = now.getUTCFullYear(); list.length < CANDIDATES; year++) {
    for (const m of MONTHS) {
      if (Date.UTC(year, m.month - 1, 1) <= now.getTime()) continue;
      const yy = String(year % 100).padStart(2, "0");
      list.push({ symbol: `SB${m.code}${yy}.NYB`, label: `${m.label}/${yy}` });
      if (list.length === CANDIDATES) break;
    }
  }
  return list;
}

async function loadSugar(): Promise<SugarResponse> {
  const now = new Date();
  const candidates = upcomingContracts(now);
  const settled = await Promise.allSettled(candidates.map((c) => fetchYahooChart(c.symbol)));

  const contracts: SugarContract[] = [];
  settled.forEach((r, i) => {
    const { symbol, label } = candidates[i];
    if (r.status === "rejected") {
      logger.warn({ symbol, err: r.reason }, "Falha ao buscar contrato de açúcar");
      return;
    }
    try {
      const q = quoteFromChart(r.value);
      if (now.getTime() - q.time > MAX_STALE_MS) return; // vencido
      contracts.push({
        symbol,
        label,
        price: q.price,
        previousClose: q.previousClose,
        changePct: q.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : null,
        time: new Date(q.time).toISOString(),
      });
    } catch (err) {
      logger.warn({ symbol, err }, "Contrato de açúcar sem preço");
    }
  });

  if (contracts.length === 0) throw new Error("Nenhum contrato de açúcar disponível");

  return {
    fetchedAt: now.toISOString(),
    unit: "¢/lb",
    source: "ICE Sugar #11 via Yahoo Finance",
    contracts: contracts.slice(0, CONTRACTS_SHOWN),
  };
}

let cache: { at: number; body: SugarResponse } | null = null;

const router: IRouter = Router();

router.get("/sugar-ny", async (req, res) => {
  const force = req.query["force"] === "1";
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    res.json(cache.body);
    return;
  }
  try {
    const body = await loadSugar();
    cache = { at: Date.now(), body };
    res.json(body);
  } catch (err) {
    logger.error({ err }, "Falha ao montar cotações do açúcar NY");
    // Melhor mostrar o último dado do que nada
    if (cache) {
      res.json(cache.body);
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Indicadores do açúcar cristal no mercado brasileiro (CEPEA/Esalq)
router.get("/sugar-cepea", async (req, res) => {
  try {
    res.json(await getCepeaSugar(req.query["force"] === "1"));
  } catch (err) {
    logger.error({ err }, "Falha ao ler indicadores do CEPEA");
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
