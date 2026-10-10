import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';

// Calendário econômico do Investing.com, pelo widget oficial para sites
// (sslecal2.investing.com), que pode ser incorporado em iframe.

const COUNTRIES = [
  { id: 32, label: 'Brasil' },
  { id: 5, label: 'EUA' },
  { id: 72, label: 'Zona do Euro' },
  { id: 37, label: 'China' },
];

const IMPORTANCE_OPTIONS = [
  { value: '1,2,3', label: 'Todas' },
  { value: '2,3', label: 'Média e alta' },
  { value: '3', label: 'Só alta' },
];

const STORAGE_KEY = 'refrix_calendar_prefs';

interface CalendarPrefs {
  countries: number[];
  importance: string;
}

function loadPrefs(): CalendarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.countries) && typeof parsed.importance === 'string') return parsed;
    }
  } catch {}
  return { countries: [32, 5], importance: '2,3' };
}

function buildUrl({ countries, importance }: CalendarPrefs) {
  const params = new URLSearchParams({
    columns: 'exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous',
    features: 'datepicker,timezone,timeselector,filters',
    countries: countries.join(','),
    importance,
    calType: 'week',
    timeZone: '12', // Brasília (GMT -3)
    lang: '12', // Português (Brasil)
  });
  return `https://sslecal2.investing.com?${params.toString()}`;
}

export function EconomicCalendar() {
  const [prefs, setPrefs] = useState<CalendarPrefs>(loadPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  const toggleCountry = (id: number) => {
    setPrefs(p => {
      const has = p.countries.includes(id);
      // Mantém pelo menos um país selecionado
      if (has && p.countries.length === 1) return p;
      return {
        ...p,
        countries: has ? p.countries.filter(c => c !== id) : [...p.countries, id],
      };
    });
  };

  const chipClass = (active: boolean) =>
    `px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
      active
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'bg-muted border-border text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border pb-3">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Calendário Econômico
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {COUNTRIES.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCountry(c.id)}
              className={chipClass(prefs.countries.includes(c.id))}
              data-testid={`calendar-country-${c.id}`}
            >
              {c.label}
            </button>
          ))}

          <span className="w-px h-5 bg-border mx-1 hidden sm:block" />

          {IMPORTANCE_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPrefs(p => ({ ...p, importance: o.value }))}
              className={chipClass(prefs.importance === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md overflow-hidden border border-border bg-white">
        <iframe
          key={buildUrl(prefs)}
          src={buildUrl(prefs)}
          title="Calendário Econômico Investing.com"
          className="w-full block"
          style={{ height: 620, border: 0 }}
          loading="lazy"
        />
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <span>
          Calendário Econômico fornecido por{' '}
          <a
            href="https://br.investing.com/"
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Investing.com Brasil
          </a>
          . Horários de Brasília.
        </span>
        <a
          href="https://br.investing.com/economic-calendar/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground"
        >
          Abrir completo <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
