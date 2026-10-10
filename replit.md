# Painel Sensibilidade Econômica Refrix

Painel que acompanha indicadores econômicos que afetam os custos da Refrix (IPCA, Selic, Dólar, Brent, Diesel, Açúcar, PET, ICC) e mostra gatilhos gerenciais quando passam de limites.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Env: `DATABASE_URL` (Postgres do Replit; sem ele o painel funciona, mas valores manuais ficam só no navegador) e Secret `EDIT_PASSWORD` (senha da equipe para editar Diesel/PET/ICC)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/painel-refrix` — front-end React/Vite do painel (página em `src/pages/Dashboard.tsx`, dados em `src/hooks/useEconomicIndicators.ts`, alertas em `src/components/ManagementTriggers.tsx`)
- `artifacts/api-server/src/routes/indicators.ts` — `GET /api/indicators`: busca IPCA, Selic, Dólar (BCB/SGS) e Brent (Yahoo, reserva FRED) com cache de 5 min; `?force=1` ignora o cache
- `artifacts/api-server/src/routes/sugar.ts` — `GET /api/sugar-ny`: próximos 4 contratos do açúcar NY (ICE Sugar #11, SBH27.NYB etc.) via Yahoo, em ¢/lb, com variação do dia; contratos são escolhidos automaticamente pela data
- `artifacts/api-server/src/lib/fetch.ts` — fetch com timeout e leitura de preço/fechamento anterior do Yahoo
- `artifacts/api-server/src/lib/cepea.ts` — lê os indicadores do açúcar cristal do CEPEA (São Paulo e Santos FOB) direto da página do CEPEA, cache de 30 min; usado por `GET /api/sugar-cepea` e pelo card AÇÚCAR CRISTAL CEPEA (`/api/indicators`)
- `artifacts/api-server/src/routes/manual.ts` — `GET/POST /api/manual`: valores manuais compartilhados (Diesel, PET, ICC); POST exige `password` = Secret `EDIT_PASSWORD`
- `artifacts/api-server/src/routes/history.ts` — `GET /api/history?range=6m|12m|5y[&id=x]`: histórico para os mini-gráficos e o gráfico grande (BCB, Yahoo, CEPEA salvo no banco, manuais do banco)
- `artifacts/api-server/src/lib/store.ts` — acesso ao banco; cria as tabelas `manual_values` e `daily_readings` sozinho (`CREATE TABLE IF NOT EXISTS`), mesma estrutura de `lib/db/src/schema`

## Architecture decisions

- Os indicadores automáticos são buscados no servidor (não no navegador) para evitar CORS e proxies públicos como allorigins.win
- O navegador guarda o último valor real de cada indicador (localStorage `refrix_last_good_v1`) e usa esse valor quando a API falha
- Diesel, PET e ICC não têm API aberta confiável: são editados no card e salvos no banco (compartilhados entre pessoas e aparelhos); sem banco, caem para o localStorage `refrix_manual_v2`
- O CEPEA só mostra ~30 dias; o servidor grava um valor por dia em `daily_readings` para o gráfico de 12 meses ir se formando
- Variação de taxas (IPCA, Selic) é mostrada em pontos percentuais; preços, em %

## Product

- Cards com valor atual, variação contra o dado anterior da fonte e data de referência
- Edição manual dos insumos sem API
- Gatilhos gerenciais (alertas) por limite de cada indicador
- Atualização automática a cada 5 minutos
- Calendário econômico do Investing.com (widget oficial em iframe, `src/components/EconomicCalendar.tsx`), com filtro de países e importância salvo no navegador

## User preferences

- Interface e textos em português do Brasil
- Dados do CEPEA têm licença CC BY-NC 4.0: manter a citação da fonte na tela

## Gotchas

- O firewall de pacotes do Replit bloqueia versões com falha crítica (ex.: proxy-addr 2.0.7, orval < 8.22). Rode `pnpm audit` e mantenha 0 críticos; use `overrides` em pnpm-workspace.yaml quando preciso
- Cards e gráficos: mini-gráfico de 12 meses em cada card; clicar no card abre o gráfico grande (6m/12m/5a)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
