import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint } from '@campusar/shared';
import { ringFromPolygonLayer, ringToLatLngs } from './mapBuilderUtils';

export function EditableFootprintLayer({
  footprint,
  onChange,
}: {
  footprint: GeoPoint[];
  onChange: (ring: GeoPoint[]) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.Polygon | null>(null);

  useEffect(() => {
    const polygon = L.polygon(ringToLatLngs(footprint), {
      color: '#f97316',
      fillColor: '#f97316',
      fillOpacity: 0.2,
      weight: 2,
    });
    polygon.addTo(map);
    polygon.pm.enable({
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 15,
    });
    layerRef.current = polygon;

    const sync = () => {
      onChange(ringFromPolygonLayer(polygon));
    };
    polygon.on('pm:edit', sync);
    polygon.on('pm:vertexadded', sync);
    polygon.on('pm:vertexremoved', sync);
    polygon.on('pm:dragend', sync);

    return () => {
      polygon.off('pm:edit', sync);
      polygon.off('pm:vertexadded', sync);
      polygon.off('pm:vertexremoved', sync);
      polygon.off('pm:dragend', sync);
      polygon.pm.disable();
      polygon.remove();
      layerRef.current = null;
    };
    // Mount once per edit session; footprint prop is the initial snapshot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, onChange]);

  return null;
}
