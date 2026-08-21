import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint } from '@campusar/shared';
import { ringFromPolygonLayer, ringToLatLngs } from './mapBuilderUtils';

/**
 * Always-on vertex editor for the selected footprint (direct manipulation).
 * Calls onCommit only on drag-end / vertex add-remove — not every drag frame.
 */
export function EditableFootprintLayer({
  footprint,
  onCommit,
}: {
  footprint: GeoPoint[];
  onCommit: (ring: GeoPoint[]) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.Polygon | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

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

    const commit = () => {
      onCommitRef.current(ringFromPolygonLayer(polygon));
    };
    polygon.on('pm:markerdragend', commit);
    polygon.on('pm:dragend', commit);
    polygon.on('pm:vertexadded', commit);
    polygon.on('pm:vertexremoved', commit);

    return () => {
      polygon.off('pm:markerdragend', commit);
      polygon.off('pm:dragend', commit);
      polygon.off('pm:vertexadded', commit);
      polygon.off('pm:vertexremoved', commit);
      polygon.pm.disable();
      polygon.remove();
      layerRef.current = null;
    };
    // Parent remounts with key=featureId(+updatedAt) when baseline should reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}
