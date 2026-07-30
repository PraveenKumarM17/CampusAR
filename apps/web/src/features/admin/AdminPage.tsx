import { FormEvent, useEffect, useState } from 'react';
import type {
  Building,
  CampusEvent,
  CrowdLevel,
  DangerZone,
  GraphEdge,
  IotStatus,
  RouteWeights,
} from '@campusar/shared';
import { DEFAULT_ROUTE_WEIGHTS } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

type Tab = 'weights' | 'buildings' | 'paths' | 'zones' | 'crowd' | 'events' | 'iot';

export function AdminPage() {
  const token = useAuthStore((s) => s.accessToken)!;
  const [tab, setTab] = useState<Tab>('weights');
  const [weights, setWeights] = useState<RouteWeights>(DEFAULT_ROUTE_WEIGHTS);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [crowd, setCrowd] = useState<CrowdLevel[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [iot, setIot] = useState<IotStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [w, b, e, z, c, ev, status] = await Promise.all([
      api.weights(token),
      api.buildings(token),
      api.adminEdges.list(token),
      api.zones(),
      api.adminCrowd.list(token),
      api.adminEvents.list(token),
      api.iotStatus(),
    ]);
    setWeights(w);
    setBuildings(b);
    setEdges(e);
    setZones(z);
    setCrowd(c);
    setEvents(ev);
    setIot(status);
  }

  useEffect(() => {
    refresh().catch((err) => setMessage(err instanceof Error ? err.message : 'Load failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function saveWeights(e: FormEvent) {
    e.preventDefault();
    const saved = await api.updateWeights(weights, token);
    setWeights(saved);
    setMessage('Route weights updated');
  }

  async function addBuilding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.adminBuildings.create(
      {
        name: String(fd.get('name')),
        code: String(fd.get('code')),
        description: String(fd.get('description') || '') || null,
        latitude: Number(fd.get('latitude')),
        longitude: Number(fd.get('longitude')),
        floorsCount: Number(fd.get('floorsCount')),
      },
      token,
    );
    e.currentTarget.reset();
    await refresh();
    setMessage('Building created');
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'weights', label: 'Weights' },
    { id: 'buildings', label: 'Buildings' },
    { id: 'paths', label: 'Paths' },
    { id: 'zones', label: 'Danger zones' },
    { id: 'crowd', label: 'Crowd' },
    { id: 'events', label: 'Events' },
    { id: 'iot', label: 'IoT sim' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Admin dashboard</h1>
        <p className="text-sm text-white/60">
          Manage campus graph data and smart-routing weights (simulated crowd & hazards).
        </p>
      </div>
      {message && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === t.id ? 'bg-accent text-ink-950' : 'bg-white/5 text-white/70'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'weights' && (
        <form className="glass rounded-2xl p-4 space-y-4 max-w-xl" onSubmit={saveWeights}>
          <p className="text-sm text-white/60">
            cost = w_d·dist + w_s·(1−safety) + w_c·crowd + w_a·(1−accessibility) + blocked penalty
          </p>
          {(
            [
              ['wDistance', 'Distance'],
              ['wSafety', 'Safety'],
              ['wCrowd', 'Crowd'],
              ['wAccessibility', 'Accessibility'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="label">
                {label}: {weights[key].toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          ))}
          <label className="block">
            <span className="label">Blocked penalty</span>
            <input
              className="input"
              type="number"
              value={weights.wBlockedPenalty}
              onChange={(e) => setWeights({ ...weights, wBlockedPenalty: Number(e.target.value) })}
            />
          </label>
          <button className="btn-primary" type="submit">
            Save weights
          </button>
        </form>
      )}

      {tab === 'buildings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="glass rounded-2xl p-4 space-y-3" onSubmit={addBuilding}>
            <p className="font-semibold">Create building</p>
            {['name', 'code', 'description', 'latitude', 'longitude', 'floorsCount'].map((f) => (
              <div key={f}>
                <label className="label">{f}</label>
                <input className="input" name={f} required={f !== 'description'} />
              </div>
            ))}
            <button className="btn-primary" type="submit">
              Create
            </button>
          </form>
          <div className="glass rounded-2xl p-4">
            <p className="mb-3 font-semibold">Buildings</p>
            <ul className="space-y-2 max-h-[28rem] overflow-auto text-sm">
              {buildings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2"
                >
                  <span>
                    {b.name} ({b.code})
                  </span>
                  <button
                    type="button"
                    className="text-accent-danger text-xs"
                    onClick={async () => {
                      await api.adminBuildings.remove(b.id, token);
                      await refresh();
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'paths' && (
        <div className="glass rounded-2xl p-4 overflow-auto">
          <p className="mb-3 font-semibold">Edges / paths</p>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-white/45">
              <tr>
                <th className="py-2">ID</th>
                <th>Kind</th>
                <th>Dist</th>
                <th>Safety</th>
                <th>Crowd</th>
                <th>Access</th>
                <th>Blocked</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((edge) => (
                <tr key={edge.id} className="border-t border-white/5">
                  <td className="py-2 font-mono text-xs">{edge.id.slice(0, 8)}</td>
                  <td>{edge.kind}</td>
                  <td>{edge.distanceM}m</td>
                  <td>{edge.safetyScore}</td>
                  <td>{edge.crowdScore}</td>
                  <td>{edge.accessibilityScore}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={edge.blocked}
                      onChange={async (e) => {
                        await api.adminEdges.update(edge.id, { blocked: e.target.checked }, token);
                        await refresh();
                        setMessage(e.target.checked ? 'Path blocked' : 'Path reopened');
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'zones' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="glass rounded-2xl p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await api.adminZones.create(
                {
                  name: String(fd.get('name')),
                  type: String(fd.get('type')) as DangerZone['type'],
                  latitude: Number(fd.get('latitude')),
                  longitude: Number(fd.get('longitude')),
                  radiusM: Number(fd.get('radiusM')),
                  description: String(fd.get('description') || '') || null,
                  active: true,
                },
                token,
              );
              e.currentTarget.reset();
              await refresh();
            }}
          >
            <p className="font-semibold">Add danger zone</p>
            <input className="input" name="name" placeholder="Name" required />
            <select className="input" name="type" defaultValue="construction">
              <option value="construction">construction</option>
              <option value="poor_lighting">poor_lighting</option>
              <option value="unsafe">unsafe</option>
            </select>
            <input className="input" name="latitude" placeholder="Latitude" required />
            <input className="input" name="longitude" placeholder="Longitude" required />
            <input className="input" name="radiusM" placeholder="Radius m" defaultValue={25} />
            <input className="input" name="description" placeholder="Description" />
            <button className="btn-primary" type="submit">
              Create zone
            </button>
          </form>
          <ul className="glass rounded-2xl p-4 space-y-2 text-sm max-h-[28rem] overflow-auto">
            {zones.map((z) => (
              <li
                key={z.id}
                className="flex justify-between gap-2 rounded-xl bg-black/20 px-3 py-2"
              >
                <span>
                  {z.name} · {z.type}
                </span>
                <button
                  type="button"
                  className="text-accent-danger text-xs"
                  onClick={async () => {
                    await api.adminZones.remove(z.id, token);
                    await refresh();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'crowd' && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <p className="font-semibold">Simulated crowd levels</p>
          {crowd.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs">
                {c.edgeId?.slice(0, 8) ?? c.nodeId?.slice(0, 8)}
              </span>
              <span>{c.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={c.intensity}
                onChange={async (e) => {
                  await api.adminCrowd.upsert(
                    { id: c.id, intensity: Number(e.target.value), label: c.label ?? undefined },
                    token,
                  );
                  await refresh();
                }}
              />
              <span>{c.intensity.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'events' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="glass rounded-2xl p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await api.adminEvents.create(
                {
                  title: String(fd.get('title')),
                  description: String(fd.get('description') || '') || null,
                  latitude: Number(fd.get('latitude')) || null,
                  longitude: Number(fd.get('longitude')) || null,
                  startsAt: new Date(String(fd.get('startsAt'))).toISOString(),
                  endsAt: new Date(String(fd.get('endsAt'))).toISOString(),
                  affectsRouting: Boolean(fd.get('affectsRouting')),
                  active: true,
                },
                token,
              );
              e.currentTarget.reset();
              await refresh();
            }}
          >
            <p className="font-semibold">Create event</p>
            <input className="input" name="title" placeholder="Title" required />
            <input className="input" name="description" placeholder="Description" />
            <input className="input" name="latitude" placeholder="Latitude" />
            <input className="input" name="longitude" placeholder="Longitude" />
            <input className="input" name="startsAt" type="datetime-local" required />
            <input className="input" name="endsAt" type="datetime-local" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="affectsRouting" /> Affects routing
            </label>
            <button className="btn-primary" type="submit">
              Create event
            </button>
          </form>
          <ul className="glass rounded-2xl p-4 space-y-2 text-sm max-h-[28rem] overflow-auto">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex justify-between gap-2 rounded-xl bg-black/20 px-3 py-2"
              >
                <span>{ev.title}</span>
                <button
                  type="button"
                  className="text-accent-danger text-xs"
                  onClick={async () => {
                    await api.adminEvents.remove(ev.id, token);
                    await refresh();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'iot' && (
        <div className="glass rounded-2xl p-4 max-w-xl space-y-3">
          <p className="font-semibold">IoT crowd/sensor simulator</p>
          <p className="text-sm text-white/60">
            Broadcasts crowd and environmental readings every 10 seconds over WebSocket.
          </p>
          <p className="text-sm">
            Status: <strong>{iot?.running ? 'running' : 'stopped'}</strong>
            {iot?.lastTickAt ? ` · last tick ${new Date(iot.lastTickAt).toLocaleTimeString()}` : ''}
            {iot ? ` · ticks ${iot.tickCount}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                setIot(await api.iotStart(token));
                setMessage('IoT simulator started');
              }}
            >
              Start
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                setIot(await api.iotStop(token));
                setMessage('IoT simulator stopped');
              }}
            >
              Stop
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                await refresh();
                setMessage('IoT status refreshed');
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
