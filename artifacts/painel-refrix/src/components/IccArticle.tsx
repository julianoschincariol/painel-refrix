import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ExternalLink, FileText, Newspaper } from 'lucide-react';

interface Article {
  title: string;
  publishedAt: string;
  paragraphs: string[];
  url: string;
  pdfUrl: string | null;
  source: string;
}

async function fetchArticle(): Promise<Article> {
  const resp = await fetch('/api/icc/article', { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Servidor respondeu HTTP ${resp.status}`);
  return resp.json();
}

/** Última matéria da FGV sobre o ICC, mostrada abaixo do gráfico. */
export function IccArticle() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['icc-article'],
    queryFn: fetchArticle,
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <div className="h-24 bg-muted rounded animate-pulse" />;
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a matéria da FGV agora.{' '}
        <a href="https://portalibre.fgv.br/ultima-divulgacao/86" target="_blank" rel="noreferrer" className="text-primary underline">
          Abrir no site da FGV
        </a>
      </p>
    );
  }

  return (
    <article className="border-t border-border pt-4 space-y-3" data-testid="icc-article">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
        <Newspaper className="w-3.5 h-3.5" /> Última divulgação · {data.source} · {format(parseISO(data.publishedAt), 'dd/MM/yyyy')}
      </div>
      <h4 className="text-base font-semibold text-foreground leading-snug">{data.title}</h4>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
        {data.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs pt-1">
        <a href={data.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> Ler no site da FGV
        </a>
        {data.pdfUrl && (
          <a href={data.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
            <FileText className="w-3.5 h-3.5" /> Press release (PDF)
          </a>
        )}
      </div>
    </article>
  );
}
