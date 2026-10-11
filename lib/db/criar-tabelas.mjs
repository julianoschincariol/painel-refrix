// Cria no banco de DESENVOLVIMENTO as mesmas tabelas que o api-server cria
// sozinho no banco publicado (veja artifacts/api-server/src/lib/store.ts).
//
// Por quê: ao republicar, o Replit compara o banco publicado com o de
// desenvolvimento e propõe apagar ("DROP TABLE") o que só existe no publicado.
// Com as tabelas iguais nos dois, a publicação não pede para apagar nada.
//
// Uso, no Shell do Replit:  node lib/db/criar-tabelas.mjs

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não encontrada. Rode este comando no Shell do Replit.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS manual_values (
      id serial PRIMARY KEY,
      indicator text NOT NULL,
      value double precision NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS manual_values_ind_idx ON manual_values (indicator, created_at)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS daily_readings (
      indicator text NOT NULL,
      ref_date date NOT NULL,
      value double precision NOT NULL,
      PRIMARY KEY (indicator, ref_date)
    )`);
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log("Pronto! Tabelas no banco de desenvolvimento:", rows.map((r) => r.table_name).join(", "));
} finally {
  await client.end();
}
