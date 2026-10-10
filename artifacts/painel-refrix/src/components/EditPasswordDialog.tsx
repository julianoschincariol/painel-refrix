import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  /** Mensagem de erro da última tentativa (ex.: senha incorreta) */
  error: string | null;
  saving: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/** Pede a senha de edição antes de salvar um valor manual compartilhado. */
export function EditPasswordDialog({ open, error, saving, onSubmit, onCancel }: Props) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Senha de edição
          </DialogTitle>
          <DialogDescription>
            O valor vai aparecer para todos que usam o painel. Digite a senha da equipe para salvar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            if (password.trim()) onSubmit(password);
          }}
        >
          <input
            type="password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            data-testid="input-edit-password"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !password.trim()} data-testid="btn-save-password">
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
