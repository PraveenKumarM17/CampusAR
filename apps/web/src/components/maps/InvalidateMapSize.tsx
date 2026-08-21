import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Keeps Leaflet's internal size in sync with the CSS box (grid/flex layouts,
 * late mount, sidebar collapse). Without this, tiles often only fill part of
 * the container and the rest shows `.leaflet-container` background.
 */
export function InvalidateMapSize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const refresh = () => {
      map.invalidateSize({ animate: false });
    };

    refresh();
    const t1 = window.setTimeout(refresh, 0);
    const t2 = window.setTimeout(refresh, 100);
    const t3 = window.setTimeout(refresh, 400);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refresh())
        : null;
    ro?.observe(container);
    window.addEventListener('resize', refresh);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro?.disconnect();
      window.removeEventListener('resize', refresh);
    };
  }, [map]);

  return null;
}
