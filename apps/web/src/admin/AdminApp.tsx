import { FormEvent, useEffect, useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { BarChart3, LayoutDashboard, LogOut, Map } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { adminApi } from '../lib/adminApi';
import { useAuthStore } from '../stores/authStore';
import { useMapEditorAccess } from '../hooks/useMapEditorAccess';
import { AdminPage } from '../features/admin/AdminPage';
import { AnalyticsPage } from '../features/analytics/AnalyticsPage';
import { MapBuilderPage } from '../features/mapBuilder/MapBuilderPage';
import { IndoorMapBuilderPage } from '../features/mapBuilder/IndoorMapBuilderPage';
import { PreviewBanner } from '../components/PreviewBanner';
import { useSiteBootstrap } from '../hooks/useSiteBootstrap';
import { useActiveSite } from '../hooks/useActiveSite';
import { useSiteStore } from '../stores/siteStore';
import { syncPreviewSite } from '../stores/previewStore';

export { AdminMapEditor } from '../features/admin/AdminMapEditor';

function AdminLogin() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const { canEdit, loading } = useMapEditorAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const denied = (location.state as { denied?: boolean } | null)?.denied;
    if (denied) setError('Invalid credentials');
  }, [location.state]);

  useEffect(() => {
    if (!user || loading) return;
    if (user.role !== 'admin' && !canEdit) {
      logout();
      setError('Invalid credentials');
    }
  }, [user, loading, canEdit, logout]);

  if (user?.role === 'admin') return <Navigate to="/" replace />;
  if (user && !loading && canEdit) return <Navigate to="/map-builder" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      const accessToken = res.tokens.accessToken;
      if (res.user.role === 'admin') {
        setSession(res.user, accessToken, res.tokens.refreshToken);
        navigate('/', { replace: true });
        return;
      }
      try {
        await adminApi.mapBuilder.snapshot(accessToken);
        setSession(res.user, accessToken, res.tokens.refreshToken);
        navigate('/map-builder', { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && err.code === 'SITE_CONTEXT_REQUIRED') {
          setSession(res.user, accessToken, res.tokens.refreshToken);
          navigate('/map-builder', { replace: true });
          return;
        }
        setError('Invalid credentials');
      }
    } catch {
      setError('Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-atlas px-4 text-ink">
      <section className="w-full max-w-md border border-line bg-paper-raised p-5 sm:p-6 md:p-7">
        <h1 className="font-display text-lg font-semibold sm:text-xl">Sign in</h1>
        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </div>
          {error && (
            <p className="border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-sm text-accent-danger">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}

function AdminSession({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout = useAuthStore((s) => s.logout);
  const { canEdit, loading } = useMapEditorAccess();

  useEffect(() => {
    if (!hydrated || loading || !user) return;
    if (user.role !== 'admin' && !canEdit) logout();
  }, [hydrated, loading, user, canEdit, logout]);

  if (!hydrated || (user && loading)) return null;
  if (!user || (user.role !== 'admin' && !canEdit)) {
    return <Navigate to="/login" replace state={{ denied: Boolean(user) }} />;
  }
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'admin') return <>{children}</>;
  return <Navigate to="/map-builder" replace />;
}

function AdminShell() {
  useSiteBootstrap();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { canEdit } = useMapEditorAccess();
  const { site, activeSiteId, label } = useActiveSite();
  const sites = useSiteStore((s) => s.sites);
  const setActiveSiteId = useSiteStore((s) => s.setActiveSiteId);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    syncPreviewSite(activeSiteId);
  }, [activeSiteId]);
  const links = [
    ...(isAdmin
      ? [
          { to: '/', label: 'Admin', icon: LayoutDashboard, end: true },
          { to: '/analytics', label: 'Analytics', icon: BarChart3, end: false },
        ]
      : []),
    ...(isAdmin || canEdit
      ? [{ to: '/map-builder', label: 'Map Builder', icon: Map, end: false }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-atlas text-ink">
      <header className="sticky top-0 z-[2000] border-b border-line bg-paper-raised/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <button
            type="button"
            className="font-display text-lg font-semibold tracking-tight sm:text-xl"
            onClick={() => navigate(isAdmin ? '/' : '/map-builder')}
          >
            CampusAR
          </button>
          <nav className="hidden items-center gap-0.5 md:flex">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            {sites.length > 0 && (
              <label className="hidden max-w-[14rem] lg:block">
                <span className="sr-only">Active site</span>
                <select
                  className="input !py-1.5 !text-xs"
                  value={site?.id ?? ''}
                  onChange={(e) => setActiveSiteId(e.target.value || null)}
                  aria-label="Active site"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.organizationName} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="hidden text-right md:block">
              <p className="text-xs font-semibold sm:text-sm">{user?.name}</p>
              <p className="text-[10px] text-ink-faint sm:text-xs">
                {isAdmin ? 'Admin' : 'Member'}
              </p>
              {site && (
                <p className="max-w-[8rem] truncate text-[10px] text-ink-faint sm:max-w-[10rem] sm:text-xs">
                  {label}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1.5 sm:!px-2.5 sm:!py-2"
              aria-label="Sign out"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut size={16} className="sm:size-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1.5 md:hidden">
          {sites.length > 1 && (
            <select
              className="input mr-1 !w-auto !py-1.5 !text-xs"
              value={site?.id ?? ''}
              onChange={(e) => setActiveSiteId(e.target.value || null)}
              aria-label="Active site"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'bg-accent text-white' : 'text-ink-mute hover:bg-paper-soft'
                }`
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <PreviewBanner />
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route
        element={
          <AdminSession>
            <AdminShell />
          </AdminSession>
        }
      >
        <Route
          path="/"
          element={
            <AdminOnly>
              <AdminPage />
            </AdminOnly>
          }
        />
        <Route path="/map-builder" element={<MapBuilderPage />} />
        <Route path="/map-builder/indoor/:buildingId?" element={<IndoorMapBuilderPage />} />
        <Route
          path="/analytics"
          element={
            <AdminOnly>
              <AnalyticsPage />
            </AdminOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
