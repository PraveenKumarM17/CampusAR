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
  if (!data) return <p className="text-white/60">Loading analytics…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-white/60">
          Searches, navigations, popular routes, and edge heat.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase text-white/45">Navigations</p>
          <p className="font-display text-3xl font-bold text-accent-soft">{data.navigationCount}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase text-white/45">Searchers</p>
          <p className="font-display text-3xl font-bold">{data.uniqueSearchers}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase text-white/45">Avg travel (min)</p>
          <p className="font-display text-3xl font-bold text-accent-mint">
            {data.averageTravelTimeMinutes.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-4 h-80">
          <p className="mb-3 font-semibold">Most searched</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data.topSearches}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="query" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#141c2e', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <Bar dataKey="count" fill="#3d9bfd" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-2xl p-4 h-80">
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
              <Bar dataKey="count" fill="#3ddeb5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="mb-3 font-semibold">Popular routes</p>
        <ul className="space-y-2 text-sm">
          {data.popularRoutes.map((r, i) => (
            <li
              key={`${r.sourceName}-${r.destinationName}-${i}`}
              className="rounded-xl bg-black/20 px-3 py-2"
            >
              {r.sourceName} → {r.destinationName}{' '}
              <span className="text-white/45">({r.count})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
