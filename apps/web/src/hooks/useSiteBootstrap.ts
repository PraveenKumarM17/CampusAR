import { useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useSiteStore } from '../stores/siteStore';

/** Loads accessible sites and selects a default when the user has one option. */
export function useSiteBootstrap() {
  const token = useAuthStore((s) => s.accessToken);
  const setSites = useSiteStore((s) => s.setSites);

  useEffect(() => {
    api
      .sites(token)
      .then(setSites)
      .catch(() => setSites([]));
  }, [token, setSites]);
}
