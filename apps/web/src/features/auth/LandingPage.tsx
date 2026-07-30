import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function LandingPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('student@smartcampus.edu');
  const [password, setPassword] = useState('student123');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, name || 'Student');
      setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
      navigate('/map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function enterGuest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.guest('Campus Guest');
      setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
      navigate('/map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-heroMap text-ink">
      <div className="pointer-events-none absolute inset-0 hero-paths" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-end gap-10 px-5 pb-10 pt-16 lg:justify-center lg:py-16">
        <header className="animate-fade-up max-w-2xl">
          <p className="font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            CampusAR
          </p>
          <h1 className="mt-5 max-w-xl font-display text-2xl font-medium leading-snug text-ink sm:text-3xl">
            Find any room without asking for directions.
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-mute sm:text-lg">
            Live routes that steer around crowds, hazards, and closed paths — on a map or through
            your camera.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 animate-fade-up-delay">
            <button className="btn-primary" type="button" onClick={enterGuest} disabled={loading}>
              Enter as guest <ArrowRight size={16} />
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                document.getElementById('sign-in')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Sign in
            </button>
          </div>
        </header>

        <section
          id="sign-in"
          className="animate-fade-up-delay-2 w-full max-w-md border border-line bg-paper-raised p-6 sm:p-7"
        >
          <div className="mb-5 flex gap-6 border-b border-line">
            <button
              type="button"
              className={`pb-3 text-sm font-semibold ${
                mode === 'login' ? 'border-b-2 border-accent text-ink' : 'text-ink-faint'
              }`}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`pb-3 text-sm font-semibold ${
                mode === 'register' ? 'border-b-2 border-accent text-ink' : 'text-ink-faint'
              }`}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            {mode === 'register' && (
              <div>
                <label className="label">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
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
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="mt-4 text-xs text-ink-faint">
            Demo · student@smartcampus.edu / student123 · admin@smartcampus.edu / admin123
          </p>
        </section>
      </div>
    </div>
  );
}
