import { fetchWithTimeout } from "./fetch";
import { logger } from "./logger";
import { getDailyReadings, saveDailyReadings } from "./store";

// Preço médio do diesel ao consumidor (Brasil e São Paulo), com dados públicos
// da Petrobras (https://precos.petrobras.com.br/) lidos pela API gratuita
// https://combustivelapi.com.br/. A Petrobras atualiza mais ou menos uma vez
// por semana. O site bloqueia pedidos sem cabeçalhos de navegador.

const DIESEL_URL = "https://combustivelapi.com.br/api/precos/";
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface DieselQuote {
  /** R$/litro */
  value: number;
  /** Último preço diferente já registrado, se houver */
  previousValue: number | null;
}

export interface DieselPrices {
  /** yyyy-MM-dd da coleta */
  refDate: string;
  br: DieselQuote;
  sp: DieselQuote;
}

/** "7,35" -> 7.35 */
function parsePrice(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Preço do diesel inválido");
  return n;
}

/** Valor anterior: o último registro de um dia antes da coleta atual. */
async function previousFrom(indicator: string, refDate: string): Promise<number | null> {
  const since = new Date(refDate);
  since.setUTCMonth(since.getUTCMonth() - 6);
  const rows = (await getDailyReadings(indicator, since.toISOString().slice(0, 10))).filter((p) => p.d < refDate);
  return rows.length > 0 ? rows[rows.length - 1].v : null;
}

async function loadDiesel(): Promise<DieselPrices> {
  const json = (await (
    await fetchWithTimeout(DIESEL_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "application/json",
      },
    })
  ).json()) as { error?: boolean; data_coleta?: string; precos?: { diesel?: Record<string, string> } };

  const diesel = json.precos?.diesel;
  if (json.error || !diesel) throw new Error("API de combustível sem preço do diesel");
  const refDate = (json.data_coleta ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refDate)) throw new Error("API de combustível sem data de coleta");

  const br = parsePrice(diesel["br"]);
  const sp = parsePrice(diesel["sp"]);

  const [prevBr, prevSp] = await Promise.all([
    previousFrom("diesel", refDate).catch(() => null),
    previousFrom("diesel_sp", refDate).catch(() => null),
  ]);

  // Guarda um valor por dia para o gráfico e para comparar com a próxima coleta
  Promise.all([
    saveDailyReadings("diesel", [{ d: refDate, v: br }]),
    saveDailyReadings("diesel_sp", [{ d: refDate, v: sp }]),
  ]).catch((err) => logger.warn({ err }, "Falha ao salvar histórico do diesel"));

  return {
    refDate,
    br: { value: br, previousValue: prevBr },
    sp: { value: sp, previousValue: prevSp },
  };
}

let cache: { at: number; data: DieselPrices } | null = null;
let inFlight: Promise<DieselPrices> | null = null;

/** Preços do diesel com cache de 1 h. */
export async function getDieselPrices(force = false): Promise<DieselPrices> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!inFlight) {
    inFlight = loadDiesel()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .catch((err) => {
        // Se o site cair, segue mostrando o último dado lido
        if (cache) return cache.data;
        throw err;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
