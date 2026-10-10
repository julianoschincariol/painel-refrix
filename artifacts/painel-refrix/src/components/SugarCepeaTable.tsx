import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Wheat } from 'lucide-react';

interface CepeaRow {
  date: string;
  brl: number;
  varDayPct: number | null;
  varMonthPct: number | null;
  usd: number | null;
}

interface CepeaSeries {
  id: 'sp' | 'santos';
  name: string;
  rows: CepeaRow[];
}

interface CepeaSugar {
  fetchedAt: string;
  unit: string;
  source: string;
  url: string;
  series: CepeaSeries[];
}

async function fetchCepea(): Promise<CepeaSugar> {
  const resp = await fetch('/api/sugar-cepea', { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  return resp.json();
}

const num = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROWS_SHOWN = 5;

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">--</span>;
  const cls = value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground';
  return <span className={cls}>{`${value > 0 ? '+' : ''}${num(value)}%`}</span>;
}

export function SugarCepeaTable() {
  const [seriesId, setSeriesId] = useState<CepeaSeries['id']>('sp');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sugar-cepea'],
    queryFn: fetchCepea,
    refetchInterval: 30 * 60 * 1000,
  });

  const series = data?.series.find(s => s.id === seriesId) ?? data?.series[0];

  const tabClass = (active: boolean) =>
    `px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
      active
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'bg-muted border-border text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Wheat className="w-4 h-4" /> Açúcar Cristal CEPEA/Esalq
        </h3>
        {data && (
          <div className="flex gap-2">
            {data.series.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeriesId(s.id)}
                className={tabClass(s.id === series?.id)}
                data-testid={`cepea-tab-${s.id}`}
              >
                {s.id === 'sp' ? 'São Paulo' : 'Santos FOB'}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: ROWS_SHOWN }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      )}

      {isError && !data && (
        <p className="text-sm text-destructive">
          Não foi possível ler o indicador do CEPEA agora. Tente atualizar em alguns minutos.
        </p>
      )}

      {series && data && (
        <>
          <p className="text-xs text-muted-foreground">{series.name}</p>
          <table className="w-full text-sm font-mono" data-testid="sugar-cepea-table">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-semibold pb-2">Data</th>
                <th className="text-right font-semibold pb-2">R$/sc</th>
                <th className="text-right font-semibold pb-2">Var. dia</th>
                <th className="text-right font-semibold pb-2 hidden sm:table-cell">Var. mês</th>
                <th className="text-right font-semibold pb-2 hidden sm:table-cell">US$/sc</th>
              </tr>
            </thead>
            <tbody>
              {series.rows.slice(0, ROWS_SHOWN).map((r, i) => (
                <tr key={r.date} className="border-t border-border/50">
                  <td className="py-2 font-sans font-medium">{format(parseISO(r.date), 'dd/MM')}</td>
                  <td className={`py-2 text-right ${i === 0 ? 'text-base font-semibold' : ''}`}>{num(r.brl)}</td>
                  <td className="py-2 text-right font-semibold"><Pct value={r.varDayPct} /></td>
                  <td className="py-2 text-right hidden sm:table-cell"><Pct value={r.varMonthPct} /></td>
                  <td className="py-2 text-right text-muted-foreground hidden sm:table-cell">
                    {r.usd === null ? '--' : num(r.usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center gap-2 text-xs text-muted-foreground">
            <span>Saca de 50 kg, com ICMS · Fonte: CEPEA/Esalq-USP (CC BY-NC 4.0)</span>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground shrink-0"
            >
              CEPEA <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
