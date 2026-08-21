import { useEffect, useMemo, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Building, DangerZone, GeoPoint, GraphNode, SiteArea } from '@campusar/shared';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAX_ZOOM } from '../../lib/campus';
import { MAPLIBRE_STYLE_URL } from '../../lib/mapEngine';
import { ensureMapLibreWorker } from '../../lib/maplibreWorker';
import type { UserPose } from '../../lib/geo';

export type CrowdEdge = {
  id: string;
  crowdScore: number;
  fromNodeId: string;
  toNodeId: string;
};

type Props = {
  className?: string;
  center: [number, number];
  buildings?: Building[];
  /** Named/clickable places shown as markers. */
  placeNodes: GraphNode[];
  /** Full graph nodes used to resolve walkway edge endpoints (may include unnamed nodes). */
  graphNodes?: GraphNode[];
  edges?: CrowdEdge[];
  areas?: SiteArea[];
  zones?: DangerZone[];
  routePoints?: [number, number][];
  pose?: UserPose | null;
  followGps?: boolean;
  recenterAt?: number;
  sourceNodeId?: string | null;
  destinationNodeId?: string | null;
  onPlaceClick?: (nodeId: string) => void;
  onBuildingClick?: (buildingId: string) => void;
  onFollowBreak?: () => void;
};

function crowdColor(score: number): string {
  if (score < 0.33) return '#0f6b63';
  if (score < 0.66) return '#c47a12';
  return '#b42318';
}

function toPolygonCoords(ring: GeoPoint[]): number[][][] {
  return [ring.map((p) => [p.longitude, p.latitude])];
}

/** Approximate a geographic circle as a closed GeoJSON polygon ring. */
function circlePolygon(
  lat: number,
  lon: number,
  radiusM: number,
  steps = 48,
): GeoJSON.Feature {
  const coords: number[][] = [];
  const latRad = (lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const dLat = (radiusM * Math.sin(a)) / mPerDegLat;
    const dLon = (radiusM * Math.cos(a)) / mPerDegLon;
    coords.push([lon + dLon, lat + dLat]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function setGeoJson(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

/**
 * Shared MapLibre campus canvas for MapPage / NavigatePage (read + navigation only).
 * Leaflet path remains separate; this is only mounted when MAP_ENGINE=maplibre.
 */
export function CampusMapLibreMap({
  className = 'h-full w-full',
  center,
  buildings = [],
  placeNodes,
  graphNodes,
  edges = [],
  areas = [],
  zones = [],
  routePoints = [],
  pose = null,
  followGps = false,
  recenterAt = 0,
  sourceNodeId = null,
  destinationNodeId = null,
  onPlaceClick,
  onBuildingClick,
  onFollowBreak,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const followRef = useRef(followGps);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onBuildingClickRef = useRef(onBuildingClick);
  const onFollowBreakRef = useRef(onFollowBreak);

  useEffect(() => {
    followRef.current = followGps;
  }, [followGps]);
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
    onBuildingClickRef.current = onBuildingClick;
    onFollowBreakRef.current = onFollowBreak;
  }, [onPlaceClick, onBuildingClick, onFollowBreak]);

  const edgeNodeById = useMemo(() => {
    const list = graphNodes?.length ? graphNodes : placeNodes;
    return new Map(list.map((n) => [n.id, n]));
  }, [graphNodes, placeNodes]);

  const buildingsGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const b of buildings) {
      if (b.footprint && b.footprint.length >= 3) {
        features.push({
          type: 'Feature',
          properties: { id: b.id, name: b.name, code: b.code },
          geometry: { type: 'Polygon', coordinates: toPolygonCoords(b.footprint) },
        });
      } else {
        features.push({
          type: 'Feature',
          properties: { id: b.id, name: b.name, code: b.code, point: 1 },
          geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [buildings]);

  const edgesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const e of edges) {
      const from = edgeNodeById.get(e.fromNodeId);
      const to = edgeNodeById.get(e.toNodeId);
      if (!from || !to) continue;
      features.push({
        type: 'Feature',
        properties: {
          id: e.id,
          crowdScore: e.crowdScore,
          color: crowdColor(e.crowdScore),
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [edges, edgeNodeById]);

  const placesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = placeNodes.map((n) => ({
      type: 'Feature',
      properties: {
        id: n.id,
        name: n.name,
        kind: n.kind,
        role:
          n.id === sourceNodeId ? 'source' : n.id === destinationNodeId ? 'destination' : 'place',
      },
      geometry: { type: 'Point', coordinates: [n.longitude, n.latitude] },
    }));
    return { type: 'FeatureCollection', features };
  }, [placeNodes, sourceNodeId, destinationNodeId]);

  const areasGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = areas
      .filter((a) => a.footprint.length >= 3)
      .map((a) => ({
        type: 'Feature',
        properties: { id: a.id, name: a.name, type: a.type },
        geometry: { type: 'Polygon', coordinates: toPolygonCoords(a.footprint) },
      }));
    return { type: 'FeatureCollection', features };
  }, [areas]);

  const zonesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = zones.map((z) => {
      const f = circlePolygon(z.latitude, z.longitude, z.radiusM);
      f.properties = {
        id: z.id,
        name: z.name,
        type: z.type,
        color:
          z.type === 'construction' || z.type === 'fire'
            ? '#c47a12'
            : z.type === 'poor_lighting'
              ? '#6b7c8a'
              : '#b42318',
      };
      return f;
    });
    return { type: 'FeatureCollection', features };
  }, [zones]);

  const routeGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    if (routePoints.length < 2) return emptyFc();
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routePoints.map(([lat, lon]) => [lon, lat]),
          },
        },
      ],
    };
  }, [routePoints]);

  const gpsAccuracyGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!pose) return emptyFc();
    const radius = Math.min(Math.max(pose.accuracy ?? 20, 8), 80);
    const f = circlePolygon(pose.latitude, pose.longitude, radius);
    f.properties = { id: 'gps-accuracy' };
    return { type: 'FeatureCollection', features: [f] };
  }, [pose]);

  const dataRef = useRef({
    areasGeo,
    buildingsGeo,
    edgesGeo,
    zonesGeo,
    placesGeo,
    routeGeo,
    gpsAccuracyGeo,
  });
  dataRef.current = {
    areasGeo,
    buildingsGeo,
    edgesGeo,
    zonesGeo,
    placesGeo,
    routeGeo,
    gpsAccuracyGeo,
  };

  const applyAllSources = (map: maplibregl.Map) => {
    const d = dataRef.current;
    setGeoJson(map, 'campus-areas', d.areasGeo);
    setGeoJson(map, 'campus-buildings', d.buildingsGeo);
    setGeoJson(map, 'campus-edges', d.edgesGeo);
    setGeoJson(map, 'campus-zones', d.zonesGeo);
    setGeoJson(map, 'campus-places', d.placesGeo);
    setGeoJson(map, 'campus-route', d.routeGeo);
    setGeoJson(map, 'campus-gps-accuracy', d.gpsAccuracyGeo);
  };

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureMapLibreWorker();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPLIBRE_STYLE_URL,
      center: [center[1], center[0]],
      zoom: CAMPUS_DEFAULT_ZOOM,
      maxZoom: CAMPUS_MAX_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;
    // Dev-only hook for manual/runtime verification of sources/layers.
    if (import.meta.env.DEV) {
      (window as unknown as { __campusMapLibre?: maplibregl.Map }).__campusMapLibre = map;
    }

    const onLoad = () => {
      map.addSource('campus-areas', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-buildings', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-edges', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-zones', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-places', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-route', { type: 'geojson', data: emptyFc() });
      map.addSource('campus-gps-accuracy', { type: 'geojson', data: emptyFc() });

      map.addLayer({
        id: 'campus-areas-fill',
        type: 'fill',
        source: 'campus-areas',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'campus-zones-fill',
        type: 'fill',
        source: 'campus-zones',
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#b42318'],
          'fill-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'campus-buildings-fill',
        type: 'fill',
        source: 'campus-buildings',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#0F6B63', 'fill-opacity': 0.25 },
      });
      map.addLayer({
        id: 'campus-buildings-line',
        type: 'line',
        source: 'campus-buildings',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': '#0F6B63', 'line-width': 2 },
      });
      map.addLayer({
        id: 'campus-buildings-point',
        type: 'circle',
        source: 'campus-buildings',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#0F6B63',
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'campus-edges-line',
        type: 'line',
        source: 'campus-edges',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#0f6b63'],
          'line-width': 4,
          'line-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'campus-route-line',
        type: 'line',
        source: 'campus-route',
        paint: { 'line-color': '#0f6b63', 'line-width': 6, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'campus-places-circle',
        type: 'circle',
        source: 'campus-places',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'role'],
            'source',
            9,
            'destination',
            9,
            6,
          ],
          'circle-color': [
            'match',
            ['get', 'role'],
            'source',
            '#0f6b63',
            'destination',
            '#1a2228',
            '#2aa89c',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'campus-gps-accuracy-fill',
        type: 'fill',
        source: 'campus-gps-accuracy',
        paint: { 'fill-color': '#2166a8', 'fill-opacity': 0.12 },
      });

      applyAllSources(map);

      const clickPlace = (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onPlaceClickRef.current?.(id);
      };
      const clickBuilding = (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onBuildingClickRef.current?.(id);
      };
      map.on('click', 'campus-places-circle', clickPlace);
      map.on('click', 'campus-buildings-fill', clickBuilding);
      map.on('click', 'campus-buildings-point', clickBuilding);

      map.on('dragstart', () => {
        if (followRef.current) onFollowBreakRef.current?.();
      });
    };
    map.on('load', onLoad);

    return () => {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      map.off('load', onLoad);
      if (import.meta.env.DEV) {
        const w = window as unknown as { __campusMapLibre?: maplibregl.Map };
        if (w.__campusMapLibre === map) delete w.__campusMapLibre;
      }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  // Push GeoJSON updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyAllSources(map);
  }, [areasGeo, buildingsGeo, edgesGeo, zonesGeo, placesGeo, routeGeo, gpsAccuracyGeo]);

  // GPS pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pose) {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      return;
    }
    const el = document.createElement('div');
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '50%';
    el.style.background = '#2166a8';
    el.style.border = '3px solid #ffffff';
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pose.longitude, pose.latitude])
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([pose.longitude, pose.latitude]);
    }
  }, [pose]);

  // Follow GPS / Track me recenter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pose) return;
    if (!followGps && !recenterAt) return;
    map.easeTo({
      center: [pose.longitude, pose.latitude],
      zoom: Math.max(map.getZoom(), 18),
      duration: 350,
    });
  }, [pose, followGps, recenterAt]);

  // Fit route when not tracking
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followGps || routePoints.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const [lat, lon] of routePoints) bounds.extend([lon, lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 400 });
  }, [routePoints, followGps]);

  // Recenter on site when not tracking and no route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followGps || routePoints.length > 1) return;
    map.easeTo({ center: [center[1], center[0]], duration: 400 });
  }, [center, followGps, routePoints.length]);

  return <div ref={containerRef} className={className} />;
}
