import { AppError } from '../domain/errors';
import { assertResourceInSite, resolveEditorSiteId } from './siteContext';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { indoorRepository } from '../infrastructure/repositories/indoorRepository';
import type { AuthedRequest } from '../interfaces/http/middleware/auth';

export async function assertIndoorBuildingEditable(req: AuthedRequest, buildingId: string): Promise<void> {
  if (req.user?.role === 'admin') return;
  const siteId = await resolveEditorSiteId(req);
  const building = await campusRepository.getBuildingById(buildingId);
  if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
  await assertResourceInSite(building.siteId, siteId, 'Building');
}

export async function assertIndoorMapEditable(req: AuthedRequest, mapId: string): Promise<void> {
  const map = await indoorRepository.getMap(mapId);
  if (!map || !map.active) throw new AppError('NOT_FOUND', 'Indoor map not found', 404);
  await assertIndoorBuildingEditable(req, map.buildingId);
}

export async function assertIndoorNodeEditable(req: AuthedRequest, nodeId: string): Promise<void> {
  const node = await indoorRepository.getNode(nodeId);
  if (!node || !node.active) throw new AppError('NOT_FOUND', 'Indoor node not found', 404);
  await assertIndoorBuildingEditable(req, node.buildingId);
}

export async function assertIndoorEdgeEditable(req: AuthedRequest, edgeId: string): Promise<void> {
  const edge = await indoorRepository.getEdge(edgeId);
  if (!edge || !edge.active) throw new AppError('NOT_FOUND', 'Indoor edge not found', 404);
  await assertIndoorBuildingEditable(req, edge.buildingId);
}

export async function assertIndoorPlaceEditable(req: AuthedRequest, placeId: string): Promise<void> {
  const place = await indoorRepository.getPlace(placeId);
  if (!place || !place.active) throw new AppError('NOT_FOUND', 'Indoor place not found', 404);
  await assertIndoorBuildingEditable(req, place.buildingId);
}

export function canViewIndoorDrafts(req: AuthedRequest): boolean {
  return req.user?.role === 'admin';
}
