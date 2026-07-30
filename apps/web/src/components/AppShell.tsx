import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Navigation,
  Scan,
  ShieldAlert,
  BarChart3,
  LogOut,
  Bell,
  Box,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AppNotification } from '@campusar/shared';

const navLinks = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/navigate', label: 'Navigate', icon: Navigation },
  { to: '/ar', label: 'AR', icon: Scan },
  { to: '/safety', label: 'Safety', icon: ShieldAlert },
];

const twinLink = { to: '/twin', label: 'Twin', icon: Box };

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [openNotes, setOpenNotes] = useState(false);

  useEffect(() => {
    api
      .notifications(token)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [token]);

  const isAdmin = user?.role === 'admin';
  const isGuest = user?.role === 'guest';

  const links = isAdmin ? [...navLinks, twinLink] : navLinks;

  const adminLinks = isAdmin
    ? [
        { to: '/admin', label: 'Admin', icon: LayoutDashboard },
        { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      ]
    : [];

  const roleLabel = isAdmin ? 'Admin' : isGuest ? 'Guest' : 'Member';

  return (
    <div className="min-h-screen bg-atlas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-paper-raised/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            className="font-display text-xl font-semibold tracking-tight"
            onClick={() => navigate('/map')}
          >
            CampusAR
          </button>
          <nav className="hidden items-center gap-0.5 md:flex">
            {[...links, ...adminLinks].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'border-b-2 border-accent text-ink' : 'text-ink-mute hover:text-ink'
                  }`
                }
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="btn-ghost !px-2.5 !py-2"
                onClick={() => setOpenNotes((v) => !v)}
                aria-label="Notifications"
              >
                <Bell size={16} />
                {notes.some((n) => !n.read) && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-danger" />
                )}
              </button>
              {openNotes && (
                <div className="absolute right-0 mt-2 max-h-96 w-80 overflow-auto border border-line bg-paper-raised p-3 shadow-sm">
                  <p className="mb-2 text-xs font-semibold text-ink-mute">Alerts</p>
                  {notes.length === 0 && <p className="text-sm text-ink-faint">No notifications</p>}
                  {notes.map((n) => (
                    <div key={n.id} className="mb-2 border-b border-line pb-2 last:border-0">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-xs text-ink-mute">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-ink-faint">{roleLabel}</p>
            </div>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-2"
              aria-label={isGuest ? 'Leave guest session' : 'Sign out'}
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 md:hidden">
          {[...links, ...adminLinks].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs font-medium ${
                  isActive ? 'bg-accent text-white' : 'text-ink-mute'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
