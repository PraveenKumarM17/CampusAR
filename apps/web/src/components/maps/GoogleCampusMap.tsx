import { useEffect, useRef, useState } from 'react';
import type { DangerZone, GraphNode } from '@campusar/shared';
import { CAMPUS_CENTER, CAMPUS_DEFAULT_ZOOM } from '../../lib/campus';
import type { UserPose } from '../../lib/geo';

export type GoogleMapMode = 'hybrid' | 'satellite' | 'roadmap' | 'streets';

export interface CampusPathLine {
  id: string;
  positions: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
}

interface GoogleCampusMapProps {
  className?: string;
  mode?: GoogleMapMode;
  placeNodes: GraphNode[];
  sourceNodeId: string | null;
  destinationNodeId: string | null;
  routePoints: [number, number][];
  pathLines?: CampusPathLine[];
  zones?: DangerZone[];
  pose?: UserPose | null;
  onPlaceClick?: (nodeId: string) => void;
}

declare global {
  interface Window {
    google?: typeof google;
    __campusarGmapsCb?: () => void;
  }
}

function toMapTypeId(mode: GoogleMapMode): string {
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'satellite') return 'satellite';
  return 'roadmap';
}

export function hasGoogleMapsKey(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-campusar-gmaps]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps script error')));
    });
  }
  return new Promise((resolve, reject) => {
    window.__campusarGmapsCb = () => resolve();
    const script = document.createElement('script');
    script.dataset.campusarGmaps = '1';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=__campusarGmapsCb&v=weekly`;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
}

export function GoogleCampusMap({
  className = 'h-[62vh] w-full',
  mode = 'hybrid',
  placeNodes,
  sourceNodeId,
  destinationNodeId,
  routePoints,
  pathLines = [],
  zones = [],
  pose = null,
  onPlaceClick,
}: GoogleCampusMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onPlaceClickRef = useRef(onPlaceClick);
  onPlaceClickRef.current = onPlaceClick;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lon },
          zoom: CAMPUS_DEFAULT_ZOOM,
          mapTypeId: toMapTypeId(mode),
          tilt: 67.5,
          heading: 20,
          rotateControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          clickableIcons: true,
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setMapTypeId(toMapTypeId(mode));
    map.setTilt(toMapTypeId(mode) === 'roadmap' ? 45 : 67.5);
    map.setHeading(20);
  }, [mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;

    overlaysRef.current.forEach((o) => {
      (o as google.maps.Polyline | google.maps.Marker | google.maps.Circle).setMap(null);
    });
    overlaysRef.current = [];

    for (const line of pathLines) {
      const poly = new google.maps.Polyline({
        map,
        path: line.positions.map(([lat, lon]) => ({ lat, lng: lon })),
        strokeColor: line.color,
        strokeOpacity: line.opacity ?? 0.7,
        strokeWeight: line.weight ?? 4,
      });
      overlaysRef.current.push(poly);
    }

    if (routePoints.length > 1) {
      const route = new google.maps.Polyline({
        map,
        path: routePoints.map(([lat, lon]) => ({ lat, lng: lon })),
        strokeColor: '#0f6b63',
        strokeOpacity: 0.95,
        strokeWeight: 6,
      });
      overlaysRef.current.push(route);
      const bounds = new google.maps.LatLngBounds();
      routePoints.forEach(([lat, lon]) => bounds.extend({ lat, lng: lon }));
      map.fitBounds(bounds, 64);
      map.setTilt(55);
    }

    for (const node of placeNodes) {
      const isSrc = node.id === sourceNodeId;
      const isDst = node.id === destinationNodeId;
      const marker = new google.maps.Marker({
        map,
        position: { lat: node.latitude, lng: node.longitude },
        title: node.name ?? node.kind,
        label: node.name
          ? {
              text: node.name.length > 14 ? `${node.name.slice(0, 12)}…` : node.name,
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '700',
            }
          : undefined,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSrc || isDst ? 9 : 6,
          fillColor: isSrc ? '#0f6b63' : isDst ? '#f5c518' : '#2aa89c',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      marker.addListener('click', () => onPlaceClickRef.current?.(node.id));
      overlaysRef.current.push(marker);
    }

    for (const z of zones) {
      const circle = new google.maps.Circle({
        map,
        center: { lat: z.latitude, lng: z.longitude },
        radius: z.radiusM,
        fillColor:
          z.type === 'construction' || z.type === 'fire'
            ? '#c47a12'
            : z.type === 'poor_lighting'
              ? '#6b7c8a'
              : '#b42318',
        fillOpacity: 0.2,
        strokeWeight: 1,
        strokeColor: '#1a2228',
      });
      overlaysRef.current.push(circle);
    }

    if (pose) {
      const accuracy = new google.maps.Circle({
        map,
        center: { lat: pose.latitude, lng: pose.longitude },
        radius: Math.min(pose.accuracy ?? 20, 40),
        fillColor: '#2166a8',
        fillOpacity: 0.15,
        strokeWeight: 0,
      });
      const you = new google.maps.Marker({
        map,
        position: { lat: pose.latitude, lng: pose.longitude },
        title: 'You',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#2166a8',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 999,
      });
      overlaysRef.current.push(accuracy, you);
    }
  }, [
    ready,
    placeNodes,
    sourceNodeId,
    destinationNodeId,
    routePoints,
    pathLines,
    zones,
    pose,
  ]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-paper-soft px-4 text-center text-sm text-accent-danger ${className}`}
      >
        {error}. Check VITE_GOOGLE_MAPS_API_KEY and enable Maps JavaScript API.
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper-soft text-sm text-ink-mute">
          Loading Google Maps…
        </div>
      )}
    </div>
  );
}
