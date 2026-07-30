import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsSummary } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function AnalyticsPage() {
  const token = useAuthStore((s) => s.accessToken)!;
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .analyticsSummary(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [token]);

  if (error) return <p className="text-accent-danger">{error}</p>;
  if (!data) return <p className="text-ink-mute">Loading analytics…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="page-sub">Searches, trips, and busy paths.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel rounded-md p-4">
          <p className="text-xs text-ink-faint">Navigations</p>
          <p className="font-display text-3xl font-semibold text-accent">{data.navigationCount}</p>
        </div>
        <div className="panel rounded-md p-4">
          <p className="text-xs text-ink-faint">Searchers</p>
          <p className="font-display text-3xl font-semibold">{data.uniqueSearchers}</p>
        </div>
        <div className="panel rounded-md p-4">
          <p className="text-xs text-ink-faint">Avg travel (min)</p>
          <p className="font-display text-3xl font-semibold text-accent">
            {data.averageTravelTimeMinutes.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-md p-4 h-80">
          <p className="mb-3 font-semibold">Most searched</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data.topSearches}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="query" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#141c2e', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <Bar dataKey="count" fill="#0f6b63" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel rounded-md p-4 h-80">
          <p className="mb-3 font-semibold">Route edge heatmap</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data.edgeHeat.slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="edgeId"
                tickFormatter={(v) => String(v).slice(0, 6)}
                stroke="#94a3b8"
              />
              <YAxis stroke="#94a3b8" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#141c2e', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <Bar dataKey="count" fill="#0f6b63" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel rounded-md p-4">
        <p className="mb-3 font-semibold">Popular routes</p>
        <ul className="space-y-2 text-sm">
          {data.popularRoutes.map((r, i) => (
            <li
              key={`${r.sourceName}-${r.destinationName}-${i}`}
              className="rounded-md bg-paper-soft px-3 py-2"
            >
              {r.sourceName} → {r.destinationName}{' '}
              <span className="text-ink-faint">({r.count})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
