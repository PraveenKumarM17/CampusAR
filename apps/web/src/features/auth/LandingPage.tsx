import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, Shield, Sparkles } from 'lucide-react';
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
    <div className="relative min-h-screen overflow-hidden bg-campus text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-accent-mint/10 blur-3xl" />
      </div>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-2">
        <section className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
            <Sparkles size={14} /> Smart Campus
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Campus<span className="text-accent">AR</span>
          </h1>
          <p className="max-w-md text-lg text-white/70">
            AI-driven AR navigation with IoT crowd awareness, predictive routing, Digital Twin
            monitoring, and safety-aware campus guidance.
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            <span className="inline-flex items-center gap-1.5 rounded-lg glass px-3 py-2">
              <Compass size={16} className="text-accent" /> Predictive A* routes
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg glass px-3 py-2">
              <Shield size={16} className="text-accent-mint" /> Safety & SOS
            </span>
          </div>
        </section>

        <section className="glass-strong rounded-3xl p-6 sm:p-8">
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                mode === 'login' ? 'bg-accent text-ink-950' : 'bg-white/5 text-white/70'
              }`}
              onClick={() => setMode('login')}
            >
              Student login
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                mode === 'register' ? 'bg-accent text-ink-950' : 'bg-white/5 text-white/70'
              }`}
              onClick={() => setMode('register')}
            >
              Register
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
              <p className="rounded-xl border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
                {error}
              </p>
            )}
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              Continue <ArrowRight size={16} />
            </button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-white/40">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <button
            className="btn-ghost w-full"
            type="button"
            onClick={enterGuest}
            disabled={loading}
          >
            Continue as guest
          </button>
          <p className="mt-4 text-xs text-white/45">
            Demo: student@smartcampus.edu / student123 · admin@smartcampus.edu / admin123
          </p>
        </section>
      </div>
    </div>
  );
}
