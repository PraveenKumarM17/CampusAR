import { AlertTriangle, Eye, Loader2, Upload } from 'lucide-react';
import type { MapValidationIssue } from '@campusar/shared';

export type StatusAutosave = 'idle' | 'unsaved' | 'pending' | 'saving' | 'saved' | 'error';

type Props = {
  autosave: StatusAutosave;
  onRetrySave?: () => void;
  errorCount: number;
  warningCount: number;
  onOpenIssues: () => void;
  publishDisabled: boolean;
  publishBusy: boolean;
  publishBlockers: MapValidationIssue[];
  onPublish: () => void;
};

export function MapBuilderStatusBar({
  autosave,
  onRetrySave,
  errorCount,
  warningCount,
  onOpenIssues,
  publishDisabled,
  publishBusy,
  publishBlockers,
  onPublish,
}: Props) {
  const autosaveLabel =
    autosave === 'saving' || autosave === 'pending'
      ? 'Saving…'
      : autosave === 'saved'
        ? 'Saved'
        : autosave === 'error'
          ? 'Save failed — Retry'
          : autosave === 'unsaved'
            ? 'Unsaved'
            : 'Ready';

  const publishTitle =
    publishDisabled && publishBlockers.length > 0
      ? `Fix before publishing:\n${publishBlockers
          .filter((i) => i.level === 'error')
          .slice(0, 8)
          .map((i) => `• ${i.code}: ${i.message}`)
          .join('\n')}`
      : publishDisabled
        ? 'Publish unavailable'
        : 'Publish this draft map version';

  return (
    <footer
      className="flex flex-wrap items-center gap-2 border-t border-line bg-paper-raised px-3 py-2"
      data-status-bar="mapbuilder"
    >
      <button
        type="button"
        data-autosave-pill={autosave}
        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
          autosave === 'error'
            ? 'border-accent-danger/50 bg-accent-danger/10 text-accent-danger'
            : autosave === 'saving' || autosave === 'pending'
              ? 'border-line bg-paper text-ink-mute'
              : autosave === 'saved'
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-line bg-paper text-ink-mute'
        }`}
        disabled={autosave !== 'error'}
        onClick={() => {
          if (autosave === 'error') onRetrySave?.();
        }}
      >
        {autosave === 'saving' || autosave === 'pending' ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> {autosaveLabel}
          </span>
        ) : (
          autosaveLabel
        )}
      </button>

      <button
        type="button"
        data-issue-counts
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-paper-soft"
        onClick={onOpenIssues}
        title="Open Issues panel"
      >
        <AlertTriangle className="h-3 w-3 text-amber-600" />
        <span className={errorCount > 0 ? 'text-danger' : ''}>{errorCount} errors</span>
        <span className="text-ink-faint">·</span>
        <span>{warningCount} warnings</span>
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-1.5 !py-1.5 text-xs opacity-60"
          disabled
          title="Preview coming in a later update"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5 !py-1.5 text-xs"
          disabled={publishDisabled || publishBusy}
          title={publishTitle}
          onClick={onPublish}
        >
          {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {publishBusy ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </footer>
  );
}
