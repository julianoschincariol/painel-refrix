import { pgTable, text, doublePrecision, date, primaryKey } from "drizzle-orm/pg-core";

// Um valor por dia de indicadores cuja fonte não guarda histórico longo
// (ex.: a página do CEPEA mostra só ~30 dias).
export const dailyReadingsTable = pgTable(
  "daily_readings",
  {
    indicator: text("indicator").notNull(),
    refDate: date("ref_date").notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.indicator, t.refDate] })],
);

export type DailyReading = typeof dailyReadingsTable.$inferSelect;
