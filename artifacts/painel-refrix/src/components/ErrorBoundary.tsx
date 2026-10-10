import { Component, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="text-4xl">⚡</div>
          <h2 className="text-lg font-bold text-foreground">Painel encontrou um erro</h2>
          <p className="text-sm text-muted-foreground max-w-md">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mt-2 px-4 py-2 bg-muted text-foreground text-sm rounded border border-border hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Recarregar painel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
