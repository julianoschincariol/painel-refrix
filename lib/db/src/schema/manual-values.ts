import { pgTable, serial, text, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";

// Valores digitados à mão no painel (Diesel, PET, ICC). Cada edição vira uma
// linha nova, o que dá o histórico para os gráficos.
export const manualValuesTable = pgTable(
  "manual_values",
  {
    id: serial("id").primaryKey(),
    indicator: text("indicator").notNull(),
    value: doublePrecision("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("manual_values_ind_idx").on(t.indicator, t.createdAt)],
);

export type ManualValue = typeof manualValuesTable.$inferSelect;
