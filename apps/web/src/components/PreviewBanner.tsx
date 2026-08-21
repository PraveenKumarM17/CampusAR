import { Link } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { usePreviewStore } from '../stores/previewStore';
import { clearBuildingContextCache } from '../lib/buildingNavigation';
import { useNavStore } from '../stores/themeStore';

export function PreviewBanner() {
  const active = usePreviewStore((s) => s.active);
  const versionNumber = usePreviewStore((s) => s.versionNumber);
  const validation = usePreviewStore((s) => s.validation);
  const exitPreview = usePreviewStore((s) => s.exitPreview);
  const resetNav = useNavStore((s) => s.resetForSiteChange);

  if (!active || versionNumber == null) return null;

  const errors = validation?.summary.errors ?? 0;
  const warnings = validation?.summary.warnings ?? 0;

  function handleExit() {
    clearBuildingContextCache();
    resetNav();
    exitPreview();
  }

  return (
    <div
      className="border-b border-amber-400/60 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            PREVIEWING DRAFT V{versionNumber} — Changes are not visible to users
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-amber-900/80 dark:text-amber-200/80">
            Validation: {errors} errors · {warnings} warnings
          </span>
          <Link
            to="/admin/map-builder"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Return to Map Builder
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-amber-600/40 px-2 py-1 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
            onClick={handleExit}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Exit Preview
          </button>
        </div>
      </div>
    </div>
  );
}
