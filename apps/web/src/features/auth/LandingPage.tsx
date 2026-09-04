import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function LandingPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState('admin@smartcampus.edu');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enterGuest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.guest('Campus Guest');
      setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
      navigate('/map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest access failed');
    } finally {
      setLoading(false);
    }
  }

  async function onAdminSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      if (res.user.role !== 'admin') {
        setError('This sign-in is for organization administrators only.');
        return;
      }
      setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-heroMap text-ink">
      <div className="pointer-events-none absolute inset-0 hero-paths" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-end gap-6 px-4 pb-8 pt-12 sm:gap-10 sm:px-6 sm:pb-10 sm:pt-16 lg:justify-center lg:py-16">
        <header className="animate-fade-up max-w-2xl">
          <p className="font-display text-4xl font-semibold leading-[0.95] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            CampusAR
          </p>
          <h1 className="mt-4 max-w-xl font-display text-xl font-medium leading-snug text-ink sm:mt-5 sm:text-2xl md:text-3xl">
            Find any room at RNSIT without asking for directions.
          </h1>
          <p className="mt-2 max-w-md text-sm text-ink-mute sm:mt-3 sm:text-base md:text-lg">
            Channasandra, Bengaluru — scan, allow location, and navigate. No account needed.
          </p>
          <div className="mt-6 flex flex-col items-start gap-3 animate-fade-up-delay sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center">
            <button className="btn-primary w-full sm:w-auto" type="button" onClick={enterGuest} disabled={loading}>
              Continue as Guest <ArrowRight size={16} />
            </button>
            <button
              className="w-full text-center text-sm font-medium text-ink-mute underline-offset-4 hover:text-ink hover:underline sm:w-auto sm:text-left"
              type="button"
              onClick={() => {
                setShowAdmin(true);
                setError(null);
                requestAnimationFrame(() =>
                  document.getElementById('admin-sign-in')?.scrollIntoView({ behavior: 'smooth' }),
                );
              }}
            >
              Organization admin sign in
            </button>
          </div>
          {error && !showAdmin && (
            <p className="mt-4 max-w-md border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-sm text-accent-danger">
              {error}
            </p>
          )}
        </header>

        {showAdmin && (
          <section
            id="admin-sign-in"
            className="animate-fade-up-delay-2 w-full max-w-md border border-line bg-paper-raised p-5 sm:p-6 md:p-7"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Administrators only
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold sm:text-xl">Admin sign in</h2>
            <p className="mt-1 text-sm text-ink-mute">
              Manage the map, nodes, branding, safety, and analytics for this organization.
            </p>
            <form className="mt-5 space-y-4" onSubmit={onAdminSubmit}>
              <div>
                <label className="label" htmlFor="admin-email">
                  Email
                </label>
                <input
                  id="admin-email"
                  className="input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="admin-password">
                  Password
                </label>
                <input
                  id="admin-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-sm text-accent-danger">
                  {error}
                </p>
              )}
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                Sign in to Dashboard
              </button>
            </form>
            <button
              type="button"
              className="mt-4 text-sm text-ink-mute hover:text-ink"
              onClick={() => {
                setShowAdmin(false);
                setError(null);
              }}
            >
              Back — continue as guest instead
            </button>
            <p className="mt-4 text-xs text-ink-faint">Demo admin · admin@smartcampus.edu / admin123</p>
          </section>
        )}
      </div>
    </div>
  );
}
