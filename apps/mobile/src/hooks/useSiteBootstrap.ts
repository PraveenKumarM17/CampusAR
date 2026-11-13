import {useEffect} from 'react';
import {api} from '../api/api';
import {useAuthStore} from '../stores/authStore';
import {useSiteStore} from '../stores/siteStore';

export function useSiteBootstrap() {
  const token = useAuthStore(s => s.accessToken);
  const setSites = useSiteStore(s => s.setSites);

  useEffect(() => {
    api
      .sites(token)
      .then(setSites)
      .catch(() => setSites([]));
  }, [token, setSites]);
}
