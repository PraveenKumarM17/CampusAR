import { AlertTriangle, Copy, RefreshCw, RotateCcw } from 'lucide-react';

type Props = {
  open: boolean;
  featureLabel: string;
  message: string;
  busy?: boolean;
  onReloadRemote: () => void;
  onRetryLocal: () => void;
  onDuplicate: () => void;
};

/** Explicit 409 conflict resolution — never auto-resolves. */
export function MapBuilderConflictDialog({
  open,
  featureLabel,
  message,
  busy = false,
  onReloadRemote,
  onRetryLocal,
  onDuplicate,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="rounded-md border-2 border-accent-danger/60 bg-paper-raised p-3 shadow-md"
      data-conflict-dialog
      role="alertdialog"
      aria-labelledby="mapbuilder-conflict-title"
      aria-describedby="mapbuilder-conflict-desc"
    >
      <p
        id="mapbuilder-conflict-title"
        className="flex items-center gap-2 text-sm font-semibold text-accent-danger"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Edit conflict · {featureLabel}
      </p>
      <p id="mapbuilder-conflict-desc" className="mt-1 text-xs text-muted">
        {message ||
          'This feature was changed elsewhere. Choose how to resolve — nothing is applied until you pick.'}
      </p>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          className="btn-secondary inline-flex w-full items-center justify-center gap-2 !py-2 text-xs"
          disabled={busy}
          data-conflict-action="reload"
          onClick={onReloadRemote}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload remote
        </button>
        <button
          type="button"
          className="btn-secondary inline-flex w-full items-center justify-center gap-2 !py-2 text-xs"
          disabled={busy}
          data-conflict-action="retry"
          onClick={onRetryLocal}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry local
        </button>
        <button
          type="button"
          className="btn-primary inline-flex w-full items-center justify-center gap-2 !py-2 text-xs"
          disabled={busy}
          data-conflict-action="duplicate"
          onClick={onDuplicate}
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate as new feature
        </button>
      </div>
    </div>
  );
}
