import { fetchWithTimeout } from "./fetch";

// Séries temporais do Banco Central (SGS) e utilitários de data.

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toBrDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** "09/10/2026" -> "2026-10-09" */
export function brDateToIso(br: string): string {
  const [dd, mm, yyyy] = br.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export interface SgsPoint {
  date: string;
  value: number;
}

/** Séries temporais do Banco Central (SGS). */
export async function fetchSgs(serie: number, query: string): Promise<SgsPoint[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados${query}`;
  const data = (await (await fetchWithTimeout(url)).json()) as unknown;
  if (!Array.isArray(data)) throw new Error(`Série SGS ${serie}: resposta inesperada`);

  const points = (data as Array<{ data: string; valor: string }>)
    .map((p) => ({
      date: brDateToIso(p.data),
      value: Number(String(p.valor).replace(",", ".")),
    }))
    .filter((p) => Number.isFinite(p.value));

  if (points.length === 0) throw new Error(`Série SGS ${serie} sem dados`);
  return points;
}

