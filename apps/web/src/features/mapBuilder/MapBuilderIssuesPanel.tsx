import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { MapValidationIssue, UnifiedMapValidationResult } from '@campusar/shared';

type Props = {
  validation: UnifiedMapValidationResult | null;
  clientIssues: MapValidationIssue[];
  pending: boolean;
  validateBusy: boolean;
  onReCheck: () => void;
  onSelectIssue: (issue: MapValidationIssue, opts?: { openInspector?: boolean }) => void;
};

export function MapBuilderIssuesPanel({
  validation,
  clientIssues,
  pending,
  validateBusy,
  onReCheck,
  onSelectIssue,
}: Props) {
  const serverIssues = validation?.issues ?? [];
  const displayIssues = pending
    ? mergeIssues(clientIssues, serverIssues)
    : serverIssues.length > 0
      ? serverIssues
      : clientIssues;

  const errors = displayIssues.filter((i) => i.level === 'error');
  const warnings = displayIssues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-3" data-panel="issues">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Issues</p>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-1 !px-2 !py-1 text-xs"
          disabled={validateBusy}
          onClick={onReCheck}
        >
          {validateBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-check now
        </button>
      </div>

      {pending ? (
        <p className="rounded border border-line bg-paper-raised px-2 py-1 text-[11px] text-ink-mute">
          Client checks shown — server re-check pending…
        </p>
      ) : null}

      <p className="text-xs text-muted">
        {errors.length} errors · {warnings.length} warnings
        {validation && !pending ? (validation.valid ? ' · server: valid' : ' · server: invalid') : null}
      </p>

      {displayIssues.length === 0 ? (
        <p className="text-sm text-muted">No validation issues.</p>
      ) : (
        <div className="space-y-4">
          {errors.length > 0 ? (
            <IssueGroup
              title="Errors"
              issues={errors}
              onSelectIssue={onSelectIssue}
            />
          ) : null}
          {warnings.length > 0 ? (
            <IssueGroup
              title="Warnings"
              issues={warnings}
              onSelectIssue={onSelectIssue}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  onSelectIssue,
}: {
  title: string;
  issues: MapValidationIssue[];
  onSelectIssue: (issue: MapValidationIssue, opts?: { openInspector?: boolean }) => void;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <AlertTriangle className="h-3 w-3" /> {title}
      </p>
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.resourceId ?? i}-${i}`}>
            <button
              type="button"
              data-issue-code={issue.code}
              data-issue-resource={issue.resourceId ?? ''}
              className={`w-full rounded border border-line px-2 py-1.5 text-left text-xs hover:bg-paper-raised ${
                issue.level === 'error' ? 'text-danger' : 'text-amber-800 dark:text-amber-300'
              }`}
              disabled={!issue.resourceId}
              onClick={() => onSelectIssue(issue, { openInspector: true })}
            >
              <span className="font-mono text-[10px] uppercase opacity-80">{issue.code}</span>
              <span className="mt-0.5 block">{issue.message}</span>
              {issue.resourceType && issue.resourceId ? (
                <span className="mt-0.5 block text-[10px] text-ink-faint">
                  {issue.resourceType} · {issue.resourceId.slice(0, 8)}…
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function mergeIssues(
  client: MapValidationIssue[],
  server: MapValidationIssue[],
): MapValidationIssue[] {
  const key = (i: MapValidationIssue) =>
    `${i.resourceType ?? ''}:${i.resourceId ?? ''}:${i.code.replace(/^CLIENT_/, '')}`;
  const map = new Map<string, MapValidationIssue>();
  for (const i of server) map.set(key(i), i);
  for (const i of client) {
    const k = key(i);
    if (!map.has(k)) map.set(k, i);
  }
  return [...map.values()];
}
