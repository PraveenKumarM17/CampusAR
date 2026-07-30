import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Navigation,
  Scan,
  ShieldAlert,
  BarChart3,
  LogOut,
  Moon,
  Sun,
  Bell,
  Box,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AppNotification } from '@campusar/shared';

const links = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/navigate', label: 'Navigate', icon: Navigation },
  { to: '/ar', label: 'AR', icon: Scan },
  { to: '/twin', label: 'Twin', icon: Box },
  { to: '/safety', label: 'Safety', icon: ShieldAlert },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const dark = useThemeStore((s) => s.dark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [openNotes, setOpenNotes] = useState(false);

  useEffect(() => {
    api
      .notifications(token)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [token]);

  const adminLinks =
    user?.role === 'admin'
      ? [
          { to: '/admin', label: 'Admin', icon: LayoutDashboard },
          { to: '/analytics', label: 'Analytics', icon: BarChart3 },
        ]
      : [];

  return (
    <div
      className={`min-h-screen ${dark ? 'bg-campus text-white' : 'bg-campusLight text-ink-900'}`}
    >
      <header className="sticky top-0 z-40 border-b border-white/10 glass-strong">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            className="font-display text-lg font-bold tracking-tight"
            onClick={() => navigate('/map')}
          >
            Campus<span className="text-accent">AR</span>
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {[...links, ...adminLinks].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-accent/20 text-accent-soft' : 'text-white/70 hover:bg-white/5'
                  }`
                }
              >
                <Icon size={16} />
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
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-danger" />
                )}
              </button>
              {openNotes && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto rounded-2xl glass-strong p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Alerts
                  </p>
                  {notes.length === 0 && <p className="text-sm text-white/60">No notifications</p>}
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="mb-2 rounded-xl border border-white/10 bg-black/20 p-2.5"
                    >
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-xs text-white/60">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn-ghost !px-2.5 !py-2" onClick={toggleTheme}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-white/45">{user?.role}</p>
            </div>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-2"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:hidden">
          {[...links, ...adminLinks].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${
                  isActive ? 'bg-accent/20 text-accent-soft' : 'bg-white/5 text-white/70'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
