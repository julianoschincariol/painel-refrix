import { fetchWithTimeout } from "./fetch";
import { logger } from "./logger";
import { type Point, getDailyReadings, saveDailyReadings } from "./store";

// Índice de Confiança do Consumidor (ICC) do FGV IBRE, lido da página pública
// "Última divulgação" (https://portalibre.fgv.br/ultima-divulgacao/86). A FGV
// divulga uma vez por mês; a página traz a matéria do mês com o valor
// dessazonalizado e a variação sobre o mês anterior.

const PAGE_URL = "https://portalibre.fgv.br/ultima-divulgacao/86";
const SITE = "https://portalibre.fgv.br";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Série dessazonalizada do press release de set/2026 (tabela da pág. 3), para
// o gráfico já nascer com 13 meses. Os meses seguintes são salvos no banco.
const BACKFILL: Point[] = [
  { d: "2025-09-01", v: 86.4 },
  { d: "2025-10-01", v: 87.0 },
  { d: "2025-11-01", v: 88.8 },
  { d: "2025-12-01", v: 89.1 },
  { d: "2026-01-01", v: 87.3 },
  { d: "2026-02-01", v: 86.1 },
  { d: "2026-03-01", v: 88.1 },
  { d: "2026-04-01", v: 89.1 },
  { d: "2026-05-01", v: 88.8 },
  { d: "2026-06-01", v: 88.7 },
  { d: "2026-07-01", v: 88.3 },
  { d: "2026-08-01", v: 84.7 },
  { d: "2026-09-01", v: 84.2 },
];

export interface IccArticle {
  title: string;
  /** yyyy-MM-dd da divulgação */
  publishedAt: string;
  paragraphs: string[];
  url: string;
  pdfUrl: string | null;
}

export interface IccData {
  value: number;
  previousValue: number | null;
  /** yyyy-MM-01 do mês de referência */
  refDate: string;
  article: IccArticle;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" };

function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** "84,2" -> 84.2 */
const brNumber = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Primeiro dia do mês anterior a yyyy-MM-01 */
function previousMonth(refDate: string): string {
  const d = new Date(`${refDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function parsePage(html: string): IccData {
  const start = html.indexOf('class="ultimas_divulgacoes');
  const articleHtml = html.slice(start, html.indexOf("</article>", start));
  if (start < 0 || !articleHtml) throw new Error("Matéria do ICC não encontrada na página da FGV");

  const link = articleHtml.match(/<h2>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const date = articleHtml.match(/<time datetime="(\d{4}-\d{2}-\d{2})/);
  const body = articleHtml.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/);
  const pdf = articleHtml.match(/href="([^"]+\.pdf)"/i);
  if (!link || !date || !body) throw new Error("Página da FGV mudou de formato");

  const paragraphs = [...body[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => cleanText(m[1])).filter(Boolean);
  const lead = paragraphs[0] ?? "";

  // "O ICC ... recuou 0,5 ponto em setembro, para 84,2 pontos"
  const valueMatch = lead.match(/para\s+(\d{2,3},\d)\s+pontos/i);
  if (!valueMatch) throw new Error("Valor do ICC não encontrado na matéria da FGV");
  const value = brNumber(valueMatch[1]);

  let previousValue: number | null = null;
  const deltaMatch = lead.match(/(recuou|caiu|diminuiu|cedeu|retrocedeu|subiu|avançou|cresceu|aumentou)\s+(\d+,\d)\s+ponto/i);
  if (deltaMatch) {
    const down = /recuou|caiu|diminuiu|cedeu|retrocedeu/i.test(deltaMatch[1]);
    previousValue = Math.round((value + (down ? 1 : -1) * brNumber(deltaMatch[2])) * 10) / 10;
  } else if (/est[áa]vel|manteve/i.test(lead)) {
    previousValue = value;
  }

  // A FGV divulga o ICC no fim do próprio mês de referência
  const refDate = `${date[1].slice(0, 7)}-01`;

  const abs = (href: string) => (href.startsWith("http") ? href : SITE + href);
  return {
    value,
    previousValue,
    refDate,
    article: {
      title: cleanText(link[2]),
      publishedAt: date[1],
      paragraphs,
      url: abs(link[1]),
      pdfUrl: pdf ? abs(pdf[1]) : null,
    },
  };
}

async function loadIcc(): Promise<IccData> {
  const html = await (
    await fetchWithTimeout(PAGE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    })
  ).text();
  const data = parsePage(html);

  const points: Point[] = [...BACKFILL, { d: data.refDate, v: data.value }];
  if (data.previousValue !== null) points.push({ d: previousMonth(data.refDate), v: data.previousValue });
  saveDailyReadings("icc", points).catch((err) => logger.warn({ err }, "Falha ao salvar histórico do ICC"));
  return data;
}

let cache: { at: number; data: IccData } | null = null;
let inFlight: Promise<IccData> | null = null;

/** ICC e matéria da FGV, com cache de 6 h. */
export async function getIcc(force = false): Promise<IccData> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!inFlight) {
    inFlight = loadIcc()
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

/** Histórico mensal: tabela inicial + o que foi salvo no banco + a leitura atual. */
export async function getIccHistory(since: string): Promise<Point[]> {
  const byMonth = new Map<string, number>();
  for (const p of BACKFILL) byMonth.set(p.d, p.v);
  for (const p of await getDailyReadings("icc", since)) byMonth.set(p.d, p.v);
  try {
    const cur = await getIcc();
    byMonth.set(cur.refDate, cur.value);
    if (cur.previousValue !== null) byMonth.set(previousMonth(cur.refDate), cur.previousValue);
  } catch (err) {
    logger.warn({ err }, "FGV indisponível para o histórico do ICC");
  }
  return [...byMonth]
    .filter(([d]) => d >= since)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, v }));
}
