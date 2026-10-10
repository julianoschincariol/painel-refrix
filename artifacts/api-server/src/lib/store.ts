import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

// Acesso ao banco (Postgres do Replit). O pacote @workspace/db exige
// DATABASE_URL ao ser importado, então ele só é carregado quando a variável
// existe; sem banco, o painel funciona e apenas o salvamento compartilhado
// fica desligado.

type DbModule = typeof import("@workspace/db");

let dbPromise: Promise<DbModule | null> | null = null;

async function connect(): Promise<DbModule | null> {
  if (!process.env["DATABASE_URL"]) {
    logger.warn("DATABASE_URL não configurada: valores manuais e histórico do CEPEA não serão salvos");
    return null;
  }
  const mod = await import("@workspace/db");
  // Cria as tabelas se ainda não existirem (mesma estrutura de lib/db/src/schema)
  await mod.db.execute(sql`
    CREATE TABLE IF NOT EXISTS manual_values (
      id serial PRIMARY KEY,
      indicator text NOT NULL,
      value double precision NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )`);
  await mod.db.execute(
    sql`CREATE INDEX IF NOT EXISTS manual_values_ind_idx ON manual_values (indicator, created_at)`,
  );
  await mod.db.execute(sql`
    CREATE TABLE IF NOT EXISTS daily_readings (
      indicator text NOT NULL,
      ref_date date NOT NULL,
      value double precision NOT NULL,
      PRIMARY KEY (indicator, ref_date)
    )`);
  return mod;
}

/** Módulo do banco, ou null se não houver banco configurado. */
export function getDb(): Promise<DbModule | null> {
  if (!dbPromise) {
    dbPromise = connect().catch((err) => {
      logger.error({ err }, "Falha ao conectar no banco");
      dbPromise = null; // tenta de novo na próxima chamada
      return null;
    });
  }
  return dbPromise;
}

export interface Point {
  /** yyyy-MM-dd */
  d: string;
  v: number;
}

export const MANUAL_IDS = ["diesel", "pet", "icc"] as const;
export type ManualId = (typeof MANUAL_IDS)[number];

export interface ManualState {
  value: number;
  previousValue: number | null;
  updatedAt: string;
}

export async function getManualStates(): Promise<Record<ManualId, ManualState | null> | null> {
  const mod = await getDb();
  if (!mod) return null;
  const { db, manualValuesTable: t } = mod;

  const result = {} as Record<ManualId, ManualState | null>;
  for (const id of MANUAL_IDS) {
    const rows = await db
      .select()
      .from(t)
      .where(eq(t.indicator, id))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(2);
    result[id] = rows[0]
      ? {
          value: rows[0].value,
          previousValue: rows[1]?.value ?? null,
          updatedAt: rows[0].createdAt.toISOString(),
        }
      : null;
  }
  return result;
}

export async function addManualValue(id: ManualId, value: number): Promise<void> {
  const mod = await getDb();
  if (!mod) throw new Error("Banco de dados não configurado");
  await mod.db.insert(mod.manualValuesTable).values({ indicator: id, value });
}

export async function getManualHistory(id: ManualId, since: Date): Promise<Point[]> {
  const mod = await getDb();
  if (!mod) return [];
  const { db, manualValuesTable: t } = mod;
  const rows = await db
    .select()
    .from(t)
    .where(and(eq(t.indicator, id), gte(t.createdAt, since)))
    .orderBy(asc(t.createdAt), asc(t.id));
  // Uma edição por dia (a última do dia vale)
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.createdAt.toISOString().slice(0, 10), r.value);
  return [...byDay].map(([d, v]) => ({ d, v }));
}

export async function saveDailyReadings(indicator: string, points: Point[]): Promise<void> {
  if (points.length === 0) return;
  const mod = await getDb();
  if (!mod) return;
  const t = mod.dailyReadingsTable;
  await mod.db
    .insert(t)
    .values(points.map((p) => ({ indicator, refDate: p.d, value: p.v })))
    .onConflictDoUpdate({ target: [t.indicator, t.refDate], set: { value: sql`excluded.value` } });
}

export async function getDailyReadings(indicator: string, since: string): Promise<Point[]> {
  const mod = await getDb();
  if (!mod) return [];
  const t = mod.dailyReadingsTable;
  const rows = await mod.db
    .select()
    .from(t)
    .where(and(eq(t.indicator, indicator), gte(t.refDate, since)))
    .orderBy(asc(t.refDate));
  return rows.map((r) => ({ d: r.refDate, v: r.value }));
}
