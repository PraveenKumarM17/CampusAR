import { useEffect, useMemo } from 'react';
import { Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { UserPose } from '../../lib/geo';

const PIN_BLUE = '#2166a8';

/** Blue map pin — always marks raw GPS position. */
function userPinIcon(headingDeg: number | null): L.DivIcon {
  const hasHeading = headingDeg != null && Number.isFinite(headingDeg);
  const rot = hasHeading ? headingDeg : 0;
  const headingCone = hasHeading
    ? `<div style="
        position:absolute;left:50%;bottom:28px;
        width:0;height:0;
        border-left:9px solid transparent;
        border-right:9px solid transparent;
        border-bottom:22px solid rgba(33,102,168,0.4);
        transform:translateX(-50%) rotate(${rot}deg);
        transform-origin:50% 100%;
      "></div>`
    : '';

  return L.divIcon({
    className: 'gps-user-marker',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    html: `<div style="position:relative;width:32px;height:42px;">
      ${headingCone}
      <div style="
        position:absolute;left:50%;bottom:0;
        transform:translateX(-50%);
        width:28px;height:28px;
        border-radius:50% 50% 50% 0;
        background:${PIN_BLUE};
        border:2.5px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        rotate:-45deg;
      "></div>
      <div style="
        position:absolute;left:50%;bottom:13px;
        transform:translateX(-50%);
        width:10px;height:10px;
        border-radius:50%;
        background:#fff;
      "></div>
    </div>`,
  });
}

/** Keep the map centered on the user while follow is enabled. */
export function FollowUser({
  pose,
  enabled,
  recenterAt = 0,
  zoom = 18,
}: {
  pose: UserPose | null;
  enabled: boolean;
  /** Bump to force an immediate pan (e.g. Track me click). */
  recenterAt?: number;
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!pose) return;
    if (!enabled && !recenterAt) return;

    const target = L.latLng(pose.latitude, pose.longitude);
    const z = Math.max(map.getZoom(), zoom);
    map.setView(target, z, { animate: true, duration: 0.35 });
  }, [map, pose, enabled, recenterAt, zoom]);

  return null;
}

/** Fit map to route bounds when not auto-tracking the user. */
export function FitMapBounds({
  points,
  enabled,
}: {
  points: [number, number][];
  enabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || points.length <= 1) return;
    map.fitBounds(points, { padding: [48, 48] });
  }, [map, points, enabled]);
  return null;
}

/** Disable follow when the user pans/zooms the map by hand. */
export function BreakFollowOnInteract({ onBreak }: { onBreak: () => void }) {
  useMapEvents({
    dragstart() {
      onBreak();
    },
  });
  return null;
}

/** Accuracy ring + blue pin at the user's GPS position. */
export function UserLocationMarker({ pose }: { pose: UserPose }) {
  const icon = useMemo(() => userPinIcon(pose.heading), [pose.heading]);

  return (
    <>
      <Circle
        center={[pose.latitude, pose.longitude]}
        radius={Math.min(Math.max(pose.accuracy ?? 20, 8), 80)}
        pathOptions={{
          color: PIN_BLUE,
          fillColor: PIN_BLUE,
          fillOpacity: 0.12,
          weight: 1,
        }}
      />
      <Marker
        position={[pose.latitude, pose.longitude]}
        icon={icon}
        zIndexOffset={1000}
        interactive={false}
      />
    </>
  );
}
