import React from 'react';
import { Indicator } from '@/hooks/useEconomicIndicators';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { motion } from 'framer-motion';

interface ManagementTriggersProps {
  indicators: Indicator[];
}

export function ManagementTriggers({ indicators }: ManagementTriggersProps) {
  const triggers = [];

  const ipca = indicators.find(i => i.id === 'ipca');
  if (ipca) {
    if (ipca.value > 5) triggers.push({ level: 'alert', text: `IPCA (${ipca.label}) > 5% – impacto inflacionário alto` });
    else triggers.push({ level: 'ok', text: `IPCA (${ipca.label}) controlado` });
  }

  const selic = indicators.find(i => i.id === 'selic');
  if (selic && selic.value > 12) {
    triggers.push({ level: 'alert', text: `Selic (${selic.label}) acima de 12% – crédito restrito` });
  }

  const dolar = indicators.find(i => i.id === 'dolar');
  if (dolar && dolar.value > 5.50) {
    triggers.push({ level: 'alert', text: `Dólar (${dolar.label}) > R$5,50 – pressão em insumos` });
  }

  const brent = indicators.find(i => i.id === 'brent');
  if (brent && brent.value > 100) {
    triggers.push({ level: 'alert', text: `Brent (${brent.label}) > US$100 – custo energético elevado` });
  }

  const diesel = indicators.find(i => i.id === 'diesel');
  if (diesel && diesel.value > 7.50) {
    triggers.push({ level: 'alert', text: `Diesel (${diesel.label}) > R$7,50 – logística mais cara` });
  }

  const acucar = indicators.find(i => i.id === 'acucar');
  if (acucar && acucar.value > 150) {
    triggers.push({ level: 'alert', text: `Açúcar (${acucar.label}) > R$150/sc – matéria-prima cara` });
  }

  const pet = indicators.find(i => i.id === 'pet');
  if (pet && pet.value < 800) {
    triggers.push({ level: 'warn', text: `PET (${pet.label}) abaixo de 800 – ponto de atenção` });
  }

  const icc = indicators.find(i => i.id === 'icc');
  if (icc && icc.value < 80) {
    triggers.push({ level: 'warn', text: `ICC (${icc.label}) < 80 pts – confiança baixa` });
  }

  if (triggers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">
        Gatilhos Gerenciais
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {triggers.map((t, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + idx * 0.05 }}
            className={`flex items-start gap-3 p-3 rounded-md border ${
              t.level === 'alert' 
                ? 'bg-destructive/10 border-destructive/20 text-destructive-foreground' 
                : t.level === 'warn'
                ? 'bg-warning/10 border-warning/20 text-warning'
                : 'bg-success/10 border-success/20 text-success'
            }`}
          >
            {t.level === 'alert' && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />}
            {t.level === 'warn' && <Info className="w-4 h-4 mt-0.5 shrink-0 text-warning" />}
            {t.level === 'ok' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />}
            <span className="text-sm font-medium leading-tight">{t.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
