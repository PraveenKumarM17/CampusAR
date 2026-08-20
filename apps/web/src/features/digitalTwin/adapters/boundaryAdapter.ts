import { CAMPUS_BOUNDARY } from '../models/buildingGeometry';
import type { CampusBoundary, TwinLatLng } from '../types/digitalTwin';
import { isValidWgs84 } from './coordinates';

export function campusBoundaryFromConfig(ring: TwinLatLng[] | null = CAMPUS_BOUNDARY): CampusBoundary | null {
  if (!ring || ring.length < 3) return null;
  const coordinates = ring.filter((p) => isValidWgs84(p));
  if (coordinates.length < 3) return null;
  return { coordinates };
}
