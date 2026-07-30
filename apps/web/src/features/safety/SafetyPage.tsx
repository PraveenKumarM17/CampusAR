import { useEffect, useState } from 'react';
import { AlertTriangle, Phone, Siren } from 'lucide-react';
import type { DangerZone, EmergencyContact, EmergencyExit } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function SafetyPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [exits, setExits] = useState<EmergencyExit[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [sosMsg, setSosMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    Promise.all([api.zones(), api.exits(), api.contacts()]).then(([z, e, c]) => {
      setZones(z);
      setExits(e);
      setContacts(c);
    });
  }, []);

  async function triggerSos() {
    setSending(true);
    setSosMsg(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 }),
      ).catch(() => null);
      const res = await api.sos(
        {
          latitude: pos?.coords.latitude ?? 37.7748,
          longitude: pos?.coords.longitude ?? -122.419,
          message: 'SOS from CampusAR web client',
        },
        token,
      );
      setSosMsg(res.message);
    } catch (err) {
      setSosMsg(err instanceof Error ? err.message : 'SOS failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Safety</h1>
          <p className="text-sm text-white/60">
            Hazard zones, emergency exits, security contacts, and SOS.
          </p>
        </div>
        <button
          className="btn-primary !bg-accent-danger"
          type="button"
          disabled={sending}
          onClick={triggerSos}
        >
          <Siren size={16} /> SOS
        </button>
      </div>
      {sosMsg && (
        <p className="rounded-2xl border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 text-sm">
          {sosMsg}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="glass rounded-2xl p-4 md:col-span-1">
          <p className="mb-3 inline-flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} className="text-accent-warn" /> Danger zones
          </p>
          <ul className="space-y-2">
            {zones.map((z) => (
              <li key={z.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <p className="font-semibold">{z.name}</p>
                <p className="text-xs uppercase tracking-wide text-white/45">{z.type}</p>
                <p className="mt-1 text-white/70">{z.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-2xl p-4">
          <p className="mb-3 font-semibold">Emergency exits</p>
          <ul className="space-y-2 text-sm">
            {exits.map((e) => (
              <li key={e.id} className="rounded-xl bg-black/20 px-3 py-2">
                {e.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-2xl p-4">
          <p className="mb-3 inline-flex items-center gap-2 font-semibold">
            <Phone size={16} className="text-accent-mint" /> Contacts
          </p>
          <ul className="space-y-2 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-xl bg-black/20 px-3 py-2">
                <p className="font-semibold">{c.name}</p>
                <a className="text-accent-soft" href={`tel:${c.phone}`}>
                  {c.phone}
                </a>
                <p className="text-xs uppercase text-white/45">{c.kind}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
