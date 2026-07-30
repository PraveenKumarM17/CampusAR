import { useEffect, useState } from 'react';
import type { UserPose } from '../lib/geo';

export interface GeoWatchState {
  pose: UserPose | null;
  error: string | null;
  watching: boolean;
}

/** Watch browser GPS with high accuracy while the map is open. */
export function useGeolocation(enabled = true): GeoWatchState {
  const [pose, setPose] = useState<UserPose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }

    setWatching(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPose({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          heading: pos.coords.heading ?? null,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — pick a start point on the map.'
            : 'Waiting for a GPS fix…',
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(id);
      setWatching(false);
    };
  }, [enabled]);

  return { pose, error, watching };
}
