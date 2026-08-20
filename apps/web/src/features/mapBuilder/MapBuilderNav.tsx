import { Link } from 'react-router-dom';

export function MapBuilderNav({ mode }: { mode: 'outdoor' | 'indoor' }) {
  return (
    <div className="flex gap-2 rounded-lg border border-line bg-paper-raised p-1">
      <Link
        to="/admin/map-builder"
        className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
          mode === 'outdoor' ? 'bg-accent text-white' : 'text-ink-mute hover:text-ink'
        }`}
      >
        Outdoor
      </Link>
      <Link
        to="/admin/map-builder/indoor"
        className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
          mode === 'indoor' ? 'bg-accent text-white' : 'text-ink-mute hover:text-ink'
        }`}
      >
        Indoor
      </Link>
    </div>
  );
}
