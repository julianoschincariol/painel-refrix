import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Wheat } from 'lucide-react';

interface SugarContract {
  symbol: string;
  label: string;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  time: string;
}

interface SugarResponse {
  fetchedAt: string;
  unit: string;
  source: string;
  contracts: SugarContract[];
}

async function fetchSugar(): Promise<SugarResponse> {
  const resp = await fetch('/api/sugar-ny', { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  return resp.json();
}

const num = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SugarNyTable() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sugar-ny'],
    queryFn: fetchSugar,
    refetchInterval: 5 * 60 * 1000,
  });

  const lastTime = (data?.contracts ?? []).reduce((max, c) => (c.time > max ? c.time : max), '');

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 flex items-center gap-2">
        <Wheat className="w-4 h-4" /> Açúcar New York (NYBOT / ICE #11)
      </h3>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      )}

      {isError && !data && (
        <p className="text-sm text-destructive">
          Não foi possível buscar as cotações do açúcar agora. Tente atualizar em alguns minutos.
        </p>
      )}

      {data && (
        <>
          <table className="w-full text-sm font-mono" data-testid="sugar-ny-table">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-semibold pb-2">Contrato</th>
                <th className="text-right font-semibold pb-2">{data.unit}</th>
                <th className="text-right font-semibold pb-2">Var.</th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.map(c => {
                const up = (c.changePct ?? 0) > 0;
                const down = (c.changePct ?? 0) < 0;
                return (
                  <tr key={c.symbol} className="border-t border-border/50" title={c.symbol}>
                    <td className="py-2 font-sans font-medium">{c.label}</td>
                    <td className="py-2 text-right text-base">{num(c.price)}</td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        up ? 'text-success' : down ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {c.changePct === null ? '--' : `${up ? '+' : ''}${num(c.changePct)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {lastTime ? `Último negócio: ${format(parseISO(lastTime), 'dd/MM HH:mm')}` : ''}
            </span>
            <span title={data.source}>Centavos de US$ por libra-peso · com atraso</span>
          </div>
        </>
      )}
    </div>
  );
}
