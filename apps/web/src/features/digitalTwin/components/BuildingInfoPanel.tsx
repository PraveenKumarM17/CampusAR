import type { IndoorBuildingContext } from '@campusar/shared';
import { pickKindLabel } from '../adapters/pickAdapter';
import {
  CROWD_BAND_COLORS,
  CROWD_BAND_LABELS,
  type CampusPOI,
  type CrowdBand,
  type DigitalTwinBuilding,
  type GreenArea,
  type ParkingArea,
  type TwinEntrance,
  type TwinPick,
} from '../types/digitalTwin';

interface BuildingInfoPanelProps {
  pick: TwinPick | null;
  building: DigitalTwinBuilding | null;
  poi: CampusPOI | null;
  entrance: TwinEntrance | null;
  parking: ParkingArea | null;
  green: GreenArea | null;
  crowdBand: CrowdBand;
  lastUpdated: string | null;
  indoor: IndoorBuildingContext | null;
  indoorLoading: boolean;
  onClose: () => void;
  onFocus: () => void;
  onNavigate: () => void;
  navigateBusy: boolean;
  navigateLabel: string;
}

export function BuildingInfoPanel({
  pick,
  building,
  poi,
  entrance,
  parking,
  green,
  crowdBand,
  lastUpdated,
  indoor,
  indoorLoading,
  onClose,
  onFocus,
  onNavigate,
  navigateBusy,
  navigateLabel,
}: BuildingInfoPanelProps) {
  if (!pick) return null;

  const title =
    building?.name ?? poi?.name ?? entrance?.name ?? parking?.name ?? green?.name ?? 'Selected';
  const subtitle = building?.code ?? (poi ? poi.category : pickKindLabel(pick.kind));
  const description = building?.description ?? null;
  const published = indoor?.indoorMap?.status === 'published';
  const canNavigate = Boolean(
    (pick.kind === 'building' && building) ||
      (pick.kind === 'entrance' && entrance) ||
      (pick.kind === 'poi' && poi?.metadata?.nodeId) ||
      (pick.kind === 'parking' && parking),
  );

  return (
    <aside className="max-h-[45vh] overflow-auto border border-line bg-paper-raised/95 p-4 shadow-lg backdrop-blur-sm sm:max-h-[70vh] sm:w-80">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-mute">{pickKindLabel(pick.kind)}</p>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-xs text-ink-faint">{subtitle}</p>
        </div>
        <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      {description && <p className="mb-3 text-sm text-ink-mute">{description}</p>}
      <dl className="space-y-1.5 text-sm">
        {building && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Floors</dt>
            <dd>{building.floorsCount}</dd>
          </div>
        )}
        {building && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Geometry</dt>
            <dd className="capitalize">{building.geometryKind}</dd>
          </div>
        )}
        {entrance && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Role</dt>
            <dd className="capitalize">{entrance.role}</dd>
          </div>
        )}
        {parking && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Spaces</dt>
            <dd>
              {parking.availableSpaces != null || parking.totalSpaces != null
                ? `${parking.availableSpaces ?? '—'} / ${parking.totalSpaces ?? '—'}`
                : 'Not in campus data'}
            </dd>
          </div>
        )}
        {building && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Crowd</dt>
            <dd className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: CROWD_BAND_COLORS[crowdBand] }}
              />
              {CROWD_BAND_LABELS[crowdBand]}
            </dd>
          </div>
        )}
        {building && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Indoor map</dt>
            <dd>
              {indoorLoading ? 'Checking…' : published ? indoor?.indoorMap?.name : 'None published'}
            </dd>
          </div>
        )}
        {lastUpdated && building && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Live update</dt>
            <dd>{lastUpdated}</dd>
          </div>
        )}
        {poi?.metadata?.phone && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">Phone</dt>
            <dd>{String(poi.metadata.phone)}</dd>
          </div>
        )}
      </dl>
      {building && (
        <p className="mt-3 text-xs text-ink-faint">
          Occupancy % is not in the API. Crowd is derived from nearby walkway intensities (0–1), not
          people counts.
        </p>
      )}
      {published && (
        <p className="mt-2 text-xs text-ink-mute">
          Indoor 3D geometry is not in this twin. After outdoor arrival, continue in Indoor with a
          QR marker.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {canNavigate && (
          <button type="button" className="btn-primary" disabled={navigateBusy} onClick={onNavigate}>
            {navigateBusy ? 'Preparing…' : navigateLabel}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onFocus}>
          Focus
        </button>
      </div>
    </aside>
  );
}
