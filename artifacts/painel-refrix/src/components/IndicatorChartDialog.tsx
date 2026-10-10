import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatIndicatorValue, type Indicator } from '@/hooks/useEconomicIndicators';
import { useHistory, type HistoryRange } from '@/hooks/useHistory';

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
  { value: '5y', label: '5 anos' },
];

const LINE = 'hsl(var(--primary))';
const GRID = 'hsl(var(--border))';
const TICK = 'hsl(var(--muted-foreground))';

interface Props {
  indicator: Indicator | null;
  onClose: () => void;
}

export function IndicatorChartDialog({ indicator, onClose }: Props) {
  const [range, setRange] = useState<HistoryRange>('12m');
  const { data, isLoading, isError } = useHistory(range, indicator?.id, Boolean(indicator));

  const points = indicator ? (data?.[indicator.id] ?? []) : [];
  const fmt = (v: number) => (indicator ? formatIndicatorValue(indicator.id, v) : String(v));
  const values = points.map(p => p.v);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const first = values[0];
  const last = values[values.length - 1];

  let change: string | null = null;
  if (indicator && values.length >= 2) {
    const diff = last - first;
    change =
      indicator.deltaMode === 'pp'
        ? `${diff > 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p.`
        : `${diff > 0 ? '+' : ''}${((diff / Math.abs(first)) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  const tickDate = (d: string) =>
    format(parseISO(d), range === '5y' ? 'yyyy' : 'MMM/yy', { locale: ptBR });
  // Em 5 anos, uma marca em cada virada de ano
  const yearTicks =
    range === '5y' ? points.filter((p, i) => i > 0 && p.d.slice(0, 4) !== points[i - 1].d.slice(0, 4)).map(p => p.d) : undefined;

  return (
    <Dialog open={Boolean(indicator)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {indicator?.name} · histórico
          </DialogTitle>
          <DialogDescription className="font-mono text-foreground text-2xl">{indicator?.label}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-xs font-mono text-muted-foreground">
            {min !== null && max !== null && (
              <>
                <span>Mín. <span className="text-foreground">{fmt(min)}</span></span>
                <span>Máx. <span className="text-foreground">{fmt(max)}</span></span>
              </>
            )}
            {change && (
              <span>
                No período{' '}
                <span className={last >= first ? 'text-success' : 'text-destructive'}>{change}</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {RANGES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                  range === r.value
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`chart-range-${r.value}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-72" data-testid="indicator-chart">
          {isLoading && <div className="h-full bg-muted rounded animate-pulse" />}
          {!isLoading && (isError || points.length < 2) && (
            <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground px-6">
              {isError
                ? 'Não foi possível carregar o histórico agora.'
                : indicator?.sourceType === 'Manual'
                  ? 'Ainda não há histórico. O gráfico vai se formando conforme os valores forem atualizados no painel.'
                  : 'Ainda não há histórico suficiente para este período.'}
            </div>
          )}
          {!isLoading && points.length >= 2 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="d"
                  ticks={yearTicks}
                  interval={yearTicks ? 0 : 'preserveEnd'}
                  tickFormatter={tickDate}
                  stroke={TICK}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={fmt}
                  stroke={TICK}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={84}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={d => format(parseISO(String(d)), 'dd/MM/yyyy')}
                  formatter={v => [fmt(Number(v)), indicator?.name ?? '']}
                />
                <Area
                  type={indicator?.id === 'selic' ? 'stepAfter' : 'monotone'}
                  dataKey="v"
                  stroke={LINE}
                  strokeWidth={2}
                  fill={LINE}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
