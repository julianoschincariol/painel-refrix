import { fetchWithTimeout } from "./fetch";
import { logger } from "./logger";
import { saveDailyReadings } from "./store";

// Indicadores do açúcar cristal do CEPEA/Esalq-USP, lidos da página pública
// https://www.cepea.org.br/br/indicador/acucar.aspx (licença CC BY-NC 4.0,
// exige citar a fonte). O CEPEA publica uma vez por dia.

const CEPEA_URL = "https://www.cepea.org.br/br/indicador/acucar.aspx";
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface CepeaRow {
  /** yyyy-MM-dd */
  date: string;
  /** R$ por saca de 50 kg */
  brl: number;
  varDayPct: number | null;
  varMonthPct: number | null;
  /** US$ por saca de 50 kg */
  usd: number | null;
}

export interface CepeaSeries {
  id: "sp" | "santos";
  name: string;
  rows: CepeaRow[];
}

export interface CepeaSugar {
  fetchedAt: string;
  unit: string;
  source: string;
  url: string;
  series: CepeaSeries[];
}

const TABLES: Array<{ tableId: string; id: CepeaSeries["id"]; name: string }> = [
  { tableId: "imagenet-indicador1", id: "sp", name: "Cristal Branco – São Paulo" },
  { tableId: "imagenet-indicador2", id: "santos", name: "Cristal – Santos (FOB)" },
];

/** "1.234,56" / "0,46%" -> número */
function parseBrNumber(text: string): number | null {
  const clean = text.replace(/[%\s]|&nbsp;/g, "").replace(/\./g, "").replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "").trim();

function parseTable(html: string, tableId: string): CepeaRow[] {
  const start = html.indexOf(`id="${tableId}"`);
  if (start < 0) throw new Error(`Tabela ${tableId} não encontrada na página do CEPEA`);
  const end = html.indexOf("</table>", start);
  const tbody = html.slice(html.indexOf("<tbody", start), end);

  const rows: CepeaRow[] = [];
  for (const tr of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
    const dateMatch = cells[0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const brl = cells[1] !== undefined ? parseBrNumber(cells[1]) : null;
    if (!dateMatch || brl === null) continue;
    rows.push({
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      brl,
      varDayPct: cells[2] !== undefined ? parseBrNumber(cells[2]) : null,
      varMonthPct: cells[3] !== undefined ? parseBrNumber(cells[3]) : null,
      usd: cells[4] !== undefined ? parseBrNumber(cells[4]) : null,
    });
  }
  if (rows.length === 0) throw new Error(`Tabela ${tableId} do CEPEA veio vazia`);
  return rows;
}

async function loadCepea(): Promise<CepeaSugar> {
  const html = await (
    await fetchWithTimeout(CEPEA_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    })
  ).text();

  return {
    fetchedAt: new Date().toISOString(),
    unit: "R$/saca 50 kg",
    source: "CEPEA/Esalq-USP",
    url: CEPEA_URL,
    series: TABLES.map((t) => ({ id: t.id, name: t.name, rows: parseTable(html, t.tableId) })),
  };
}

let cache: { at: number; data: CepeaSugar } | null = null;
let inFlight: Promise<CepeaSugar> | null = null;

/** Indicadores do CEPEA com cache de 30 min, compartilhado entre as rotas. */
export async function getCepeaSugar(force = false): Promise<CepeaSugar> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!inFlight) {
    inFlight = loadCepea()
      .then((data) => {
        cache = { at: Date.now(), data };
        // Guarda um valor por dia: a página só mostra ~30 dias de histórico
        for (const s of data.series) {
          const indicator = s.id === "sp" ? "acucar" : "acucar_santos";
          saveDailyReadings(indicator, s.rows.map((r) => ({ d: r.date, v: r.brl }))).catch((err) =>
            logger.warn({ err }, "Falha ao salvar histórico do CEPEA"),
          );
        }
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
