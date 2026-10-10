import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { HistoryPoint } from '@/hooks/useHistory';

interface SparklineProps {
  points: HistoryPoint[];
  /** Taxas mostram a mudança em p.p.; preços, em % */
  deltaMode: 'pct' | 'pp';
  stepped?: boolean;
}

const UP = 'hsl(var(--success))';
const DOWN = 'hsl(var(--destructive))';
const DAY_MS = 24 * 60 * 60 * 1000;

/** "12m", "4m" ou "19d", conforme o período que os dados realmente cobrem. */
function periodOf(points: HistoryPoint[]): string {
  const days = Math.round((Date.parse(points[points.length - 1].d) - Date.parse(points[0].d)) / DAY_MS);
  if (days >= 330) return '12m';
  if (days >= 60) return `${Math.round(days / 30)}m`;
  return `${days}d`;
}

/** Mini-gráfico de tendência com a variação do período ao lado. */
export function Sparkline({ points, deltaMode, stepped }: SparklineProps) {
  if (points.length < 2) return null;
  const periodLabel = periodOf(points);

  const first = points[0].v;
  const last = points[points.length - 1].v;
  const diff = last - first;
  const delta = deltaMode === 'pp' ? diff : first !== 0 ? (diff / Math.abs(first)) * 100 : 0;
  const color = diff >= 0 ? UP : DOWN;
  const deltaText =
    (delta > 0 ? '+' : '') +
    delta.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: deltaMode === 'pp' ? 2 : 1 }) +
    (deltaMode === 'pp' ? ' p.p.' : '%');

  return (
    <div className="flex items-end gap-2" data-testid="sparkline">
      <div className="h-9 flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Area
              type={stepped ? 'stepAfter' : 'monotone'}
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={color}
              fillOpacity={0.1}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <span className="text-[10px] font-mono font-semibold whitespace-nowrap" style={{ color }}>
        {deltaText}
        <span className="text-muted-foreground font-normal"> {periodLabel}</span>
      </span>
    </div>
  );
}
