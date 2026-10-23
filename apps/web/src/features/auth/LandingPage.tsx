import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function LandingPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
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
            <button
              className="btn-primary w-full sm:w-auto"
              type="button"
              onClick={enterGuest}
              disabled={loading}
            >
              Continue as Guest <ArrowRight size={16} />
            </button>
          </div>
          {error && (
            <p className="mt-4 max-w-md border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-sm text-accent-danger">
              {error}
            </p>
          )}
        </header>
      </div>
    </div>
  );
}
