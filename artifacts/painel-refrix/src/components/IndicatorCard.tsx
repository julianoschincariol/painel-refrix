import { useState, useRef, useEffect } from 'react';
import { Indicator, ManualId, formatIndicatorValue } from '@/hooks/useEconomicIndicators';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from '@/components/Sparkline';
import type { HistoryPoint } from '@/hooks/useHistory';

interface IndicatorCardProps {
  indicator: Indicator;
  index: number;
  onManualEdit?: (id: ManualId, value: number) => void;
  /** Histórico de 12 meses para o mini-gráfico */
  history?: HistoryPoint[] | null;
  /** Abre o gráfico grande do indicador */
  onOpenChart?: () => void;
}

function DeltaBadge({ indicator }: { indicator: Indicator }) {
  const { value: current, previousValue: previous, previousLabel, deltaMode } = indicator;
  if (previous === undefined || previous === 0) return null;

  const diff = current - previous;
  // Taxas (IPCA, Selic) variam em pontos percentuais; preços, em %
  const delta = deltaMode === 'pp' ? diff : (diff / Math.abs(previous)) * 100;
  const suffix = deltaMode === 'pp' ? ' p.p.' : '%';

  // Only show if change is meaningful
  if (Math.abs(delta) < 0.001) return null;

  const isUp = diff > 0;
  const isDown = diff < 0;
  const absFormatted = Math.abs(delta) < 10
    ? Math.abs(delta).toFixed(2).replace('.', ',')
    : Math.abs(delta).toFixed(1).replace('.', ',');

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-0.5 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
        isUp
          ? 'text-[#27c93f] bg-[#27c93f]/10'
          : isDown
          ? 'text-[#e63946] bg-[#e63946]/10'
          : 'text-muted-foreground bg-muted'
      }`}
      data-testid="delta-badge"
      title={`Anterior: ${previousLabel ?? previous}`}
    >
      {isUp && <TrendingUp className="w-2.5 h-2.5" />}
      {isDown && <TrendingDown className="w-2.5 h-2.5" />}
      {!isUp && !isDown && <Minus className="w-2.5 h-2.5" />}
      {isUp ? '+' : isDown ? '-' : ''}{absFormatted}{suffix}
    </motion.div>
  );
}

export function IndicatorCard({ indicator, index, onManualEdit, history, onOpenChart }: IndicatorCardProps) {
  const isOk = indicator.status === 'ok';
  const isManual = indicator.status === 'manual';
  const isFallback = indicator.status === 'fallback';
  const isError = indicator.status === 'error';

  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const openEdit = () => {
    setInputVal(String(indicator.value));
    setEditing(true);
  };

  const confirmEdit = () => {
    const parsed = parseFloat(inputVal.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0 && onManualEdit) {
      onManualEdit(indicator.id as ManualId, parsed);
    }
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  let borderColorClass = 'border-l-4 border-l-slate-700';
  let badgeText = '';
  let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
  let badgeIcon = '';

  if (isOk) {
    borderColorClass = 'border-l-4 border-l-success';
    badgeText = 'OK';
    badgeVariant = 'outline';
    badgeIcon = '✅';
  } else if (isFallback) {
    borderColorClass = 'border-l-4 border-l-warning';
    badgeText = 'Reserva';
    badgeVariant = 'secondary';
    badgeIcon = '⚠️';
  } else if (isManual) {
    borderColorClass = 'border-l-4 border-l-warning';
    badgeText = 'Manual';
    badgeVariant = 'secondary';
    badgeIcon = '⚙️';
  } else if (isError) {
    borderColorClass = 'border-l-4 border-l-destructive';
    badgeText = 'Erro';
    badgeVariant = 'destructive';
    badgeIcon = '❌';
  }


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card
        className={`bg-card ${borderColorClass} rounded-r-lg overflow-hidden h-full flex flex-col border-y border-r border-t-card-border border-r-card-border border-b-card-border ${
          onOpenChart ? 'cursor-pointer transition-colors hover:border-r-primary/40 hover:border-y-primary/40' : ''
        }`}
        data-testid={`card-${indicator.id}`}
        onClick={() => !editing && onOpenChart?.()}
        onKeyDown={e => {
          if (!editing && onOpenChart && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenChart();
          }
        }}
        role={onOpenChart ? 'button' : undefined}
        tabIndex={onOpenChart ? 0 : undefined}
        title={onOpenChart && !editing ? 'Ver histórico' : undefined}
      >
        <CardContent className="p-5 flex-1 flex flex-col justify-between">
          {/* Header row */}
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
              {indicator.name}
            </h3>
            <div className="flex items-center gap-1.5">
              {isManual && onManualEdit && !editing && (
                <button
                  data-testid={`btn-edit-${indicator.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    openEdit();
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                  title="Editar valor"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              <Badge variant={badgeVariant} className="text-[10px] py-0 px-1.5 flex items-center gap-1 font-mono">
                <span className="text-[10px]">{badgeIcon}</span> {badgeText}
              </Badge>
            </div>
          </div>

          {/* Value area */}
          <div className="mb-3 min-h-[44px] flex items-center gap-2">
            <AnimatePresence mode="wait">
              {editing ? (
                <motion.div
                  key="editing"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2 w-full"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <input
                    ref={inputRef}
                    data-testid={`input-manual-${indicator.id}`}
                    type="text"
                    inputMode="decimal"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-lg font-mono text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    data-testid={`btn-confirm-${indicator.id}`}
                    onClick={confirmEdit}
                    className="text-success hover:text-success/80 transition-colors shrink-0"
                    title="Confirmar"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    data-testid={`btn-cancel-${indicator.id}`}
                    onClick={cancelEdit}
                    className="text-destructive hover:text-destructive/80 transition-colors shrink-0"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="display"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-baseline gap-2 flex-wrap"
                >
                  <span
                    className="text-3xl font-mono font-medium text-foreground tracking-tight"
                    data-testid={`value-${indicator.id}`}
                  >
                    {indicator.label}
                  </span>
                  <DeltaBadge indicator={indicator} />
                  {indicator.secondary && (
                    <div className="w-full flex items-center gap-2 text-xs text-muted-foreground" data-testid={`secondary-${indicator.id}`}>
                      {indicator.primaryLabel && <span>{indicator.primaryLabel}</span>}
                      <span className="text-muted-foreground/50">·</span>
                      <span>{indicator.secondary.label}:</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatIndicatorValue(indicator.id, indicator.secondary.value)}
                      </span>
                      <DeltaBadge
                        indicator={{
                          ...indicator,
                          value: indicator.secondary.value,
                          previousValue: indicator.secondary.previousValue,
                          previousLabel:
                            indicator.secondary.previousValue !== undefined
                              ? formatIndicatorValue(indicator.id, indicator.secondary.previousValue)
                              : undefined,
                        }}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 12-month trend */}
          {history && history.length >= 2 && (
            <div className="mb-3">
              <Sparkline points={history} deltaMode={indicator.deltaMode} stepped={indicator.id === 'selic'} />
            </div>
          )}

          {/* Footer row */}
          <div className="flex justify-between items-end mt-auto">
            <div className="text-xs text-muted-foreground" title={indicator.source ? `Fonte: ${indicator.source}` : undefined}>{indicator.refLabel}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-sm">
              {indicator.sourceType}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
