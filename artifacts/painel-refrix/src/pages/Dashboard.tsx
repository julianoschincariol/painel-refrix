import React, { useEffect, useState } from 'react';
import {
  useEconomicIndicators,
  ManualSaveError,
  type Indicator,
  type ManualId,
} from '@/hooks/useEconomicIndicators';
import { useHistory } from '@/hooks/useHistory';
import { IndicatorCard } from '@/components/IndicatorCard';
import { IndicatorChartDialog } from '@/components/IndicatorChartDialog';
import { EditPasswordDialog } from '@/components/EditPasswordDialog';
import { ManagementTriggers } from '@/components/ManagementTriggers';
import { EconomicCalendar } from '@/components/EconomicCalendar';
import { SugarNyTable } from '@/components/SugarNyTable';
import { SugarCepeaTable } from '@/components/SugarCepeaTable';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, Database, Clock } from 'lucide-react';
import { toast } from 'sonner';

const PASSWORD_KEY = 'refrix_edit_password';

export default function Dashboard() {
  const { indicators, isLoading, lastRefresh, refresh, statusGeral, isOffline, manualStorage, setManualValue } =
    useEconomicIndicators();
  const [blink, setBlink] = useState(false);
  const queryClient = useQueryClient();
  const { data: history } = useHistory('12m');
  const [chartIndicator, setChartIndicator] = useState<Indicator | null>(null);

  // Edição de valores manuais compartilhados: a senha fica guardada neste
  // aparelho depois do primeiro acerto e é apagada se deixar de valer.
  const [pendingEdit, setPendingEdit] = useState<{ id: ManualId; value: number } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const readSavedPassword = () => {
    try {
      return localStorage.getItem(PASSWORD_KEY);
    } catch {
      return null;
    }
  };

  const saveManual = async (id: ManualId, value: number, password?: string) => {
    await setManualValue(id, value, password);
    queryClient.invalidateQueries({ queryKey: ['history'] });
    const name = indicators.find(i => i.id === id)?.name ?? id;
    toast.success(`${name} atualizado para todos.`);
  };

  const handleManualEdit = async (id: ManualId, value: number) => {
    if (manualStorage === 'local') {
      await setManualValue(id, value);
      return;
    }
    const saved = readSavedPassword();
    if (!saved) {
      setPasswordError(null);
      setPendingEdit({ id, value });
      return;
    }
    try {
      await saveManual(id, value, saved);
    } catch (err) {
      if (err instanceof ManualSaveError && err.kind === 'password') {
        try {
          localStorage.removeItem(PASSWORD_KEY);
        } catch {}
        setPasswordError('A senha salva neste aparelho não vale mais. Digite a senha atual.');
        setPendingEdit({ id, value });
      } else {
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o valor.');
      }
    }
  };

  const submitPassword = async (password: string) => {
    if (!pendingEdit) return;
    setSavingEdit(true);
    try {
      await saveManual(pendingEdit.id, pendingEdit.value, password);
      try {
        localStorage.setItem(PASSWORD_KEY, password);
      } catch {}
      setPendingEdit(null);
    } catch (err) {
      if (err instanceof ManualSaveError && err.kind === 'password') {
        setPasswordError('Senha incorreta.');
      } else {
        setPendingEdit(null);
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o valor.');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    if (isOffline) {
      toast.error('Modo Offline: não foi possível buscar os indicadores. Mostrando os últimos valores salvos.', {
        id: 'offline-toast'
      });
    }
  }, [isOffline]);

  useEffect(() => {
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 1000);
    return () => clearTimeout(t);
  }, [lastRefresh]);

  const handleRefresh = async () => {
    queryClient.invalidateQueries({ queryKey: ['sugar-ny'] });
    queryClient.invalidateQueries({ queryKey: ['sugar-cepea'] });
    queryClient.invalidateQueries({ queryKey: ['history'] });
    toast.promise(refresh(true), {
      loading: 'Atualizando dados...',
      success: 'Painel atualizado com sucesso.',
      error: 'Erro ao atualizar dados.',
    });
  };

  const firstLoad = isLoading && !lastRefresh;

  const getStatusColor = () => {
    if (firstLoad) return 'bg-muted-foreground animate-pulse';
    if (isOffline) return 'bg-destructive';
    if (statusGeral.partial > 0 || statusGeral.error > 0) return 'bg-warning';
    return 'bg-success';
  };

  const tickerIpca = indicators.find(i => i.id === 'ipca')?.label || '--';
  const tickerSelic = indicators.find(i => i.id === 'selic')?.label || '--';
  const tickerDolar = indicators.find(i => i.id === 'dolar')?.label || '--';

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary selection:text-primary-foreground">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
              <span className="text-primary">⚡</span> Painel Sensibilidade Econômica
            </h1>
            <div className="hidden md:flex items-center gap-1.5 ml-4 px-3 py-1 bg-muted rounded-full border border-border">
              <div className={`w-2 h-2 rounded-full ${statusGeral.ok > 0 ? 'bg-success' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${statusGeral.partial > 0 ? 'bg-warning' : 'bg-muted-foreground'}`} />
              <div className={`w-2 h-2 rounded-full ${statusGeral.error > 0 || isOffline ? 'bg-destructive' : 'bg-muted-foreground'}`} />
              <span className="text-xs font-mono font-medium text-muted-foreground ml-1">APIs</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded border border-border font-mono text-sm transition-colors duration-500 ${blink ? 'text-primary' : 'text-muted-foreground'}`}>
              <Activity className="w-3.5 h-3.5" />
              <span>IPCA {tickerIpca} | Selic {tickerSelic} | Dólar {tickerDolar}</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh} 
              disabled={isLoading}
              className="font-mono text-xs uppercase tracking-wider"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </header>

        {/* Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {indicators.map((indicator, idx) => (
            <IndicatorCard
              key={indicator.id}
              indicator={indicator}
              index={idx}
              onManualEdit={indicator.status === 'manual' ? handleManualEdit : undefined}
              history={history?.[indicator.id]}
              onOpenChart={() => setChartIndicator(indicator)}
            />
          ))}
          {indicators.length === 0 && (
            // Skeleton state
            Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="h-32 bg-card rounded-lg border border-border animate-pulse" />
            ))
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Detailed Reading */}
          <div className="lg:col-span-1 bg-card rounded-lg border border-border p-5">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2 flex items-center gap-2">
              <Database className="w-4 h-4" /> Leitura Detalhada
            </h3>
            
            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status Geral</span>
                <span className="font-medium">
                  <span className="text-success">{statusGeral.ok}</span>/{statusGeral.totalAuto} OK
                  {statusGeral.partial > 0 && <span className="text-warning ml-1">({statusGeral.partial} parcial)</span>}
                  {statusGeral.error > 0 && <span className="text-destructive ml-1">({statusGeral.error} erro)</span>}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Última Atualização</span>
                <span>{lastRefresh ? lastRefresh.toLocaleTimeString('pt-BR') : '--:--:--'}</span>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Modo</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                  <span className="font-bold">
                    {firstLoad ? 'Carregando…' : isOffline ? 'Offline (reserva)' : 'Online (real)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Management Triggers */}
          <div className="lg:col-span-2 bg-card rounded-lg border border-border p-5">
            <ManagementTriggers indicators={indicators} />
          </div>
        </div>

        {/* Sugar market */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border border-border p-5">
            <SugarNyTable />
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <SugarCepeaTable />
          </div>
        </div>

        {/* Economic Calendar */}
        <div className="bg-card rounded-lg border border-border p-5">
          <EconomicCalendar />
        </div>

      </div>

      <IndicatorChartDialog
        indicator={indicators.find(i => i.id === chartIndicator?.id) ?? null}
        onClose={() => setChartIndicator(null)}
      />
      <EditPasswordDialog
        open={pendingEdit !== null}
        error={passwordError}
        saving={savingEdit}
        onSubmit={submitPassword}
        onCancel={() => setPendingEdit(null)}
      />
    </div>
  );
}
