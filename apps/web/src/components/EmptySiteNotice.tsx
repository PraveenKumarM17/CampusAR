import { EMPTY_SITE_MESSAGE } from '../lib/campus';

export function EmptySiteNotice({
  compact = false,
  title = 'No map data yet',
  message = EMPTY_SITE_MESSAGE,
}: {
  compact?: boolean;
  title?: string;
  message?: string;
}) {
  return (
    <div
      role="status"
      className={
        compact
          ? 'border border-line bg-paper-raised p-3 text-sm'
          : 'flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 bg-paper-soft p-6 text-center'
      }
    >
      <p className="font-semibold text-ink">{title}</p>
      <p className="text-sm text-ink-mute">{message}</p>
    </div>
  );
}
