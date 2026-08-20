import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { api, ApiError } from '../lib/api';

/** True when the signed-in user may open the Map Builder (platform or org/site admin). */
export function useMapEditorAccess(): { canEdit: boolean; loading: boolean } {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const [canEdit, setCanEdit] = useState(user?.role === 'admin');
  const [loading, setLoading] = useState(user?.role !== 'admin');

  useEffect(() => {
    if (!user || !token) {
      setCanEdit(false);
      setLoading(false);
      return;
    }
    if (user.role === 'admin') {
      setCanEdit(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.mapBuilder
      .snapshot(token)
      .then(() => {
        if (!cancelled) setCanEdit(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCanEdit(err instanceof ApiError && err.status === 422 && err.code === 'SITE_CONTEXT_REQUIRED');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  return { canEdit, loading };
}
