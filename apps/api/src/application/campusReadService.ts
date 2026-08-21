import { AppError } from '../domain/errors';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { floorLayoutRepository } from '../infrastructure/repositories/floorLayoutRepository';
import { siteAreaRepository } from '../infrastructure/repositories/siteAreaRepository';

export type MapReadScope = {
  siteId: string;
  mapVersionId: string;
};

export const campusReadService = {
  listBuildings(scope: MapReadScope) {
    return campusRepository.listBuildings(scope.siteId, scope.mapVersionId);
  },

  listFloors(buildingId: string | undefined, scope: MapReadScope) {
    return campusRepository.listFloors(buildingId, scope.siteId, scope.mapVersionId);
  },

  listRooms(
    filters: { buildingId?: string; category?: string },
    scope: MapReadScope,
  ) {
    return campusRepository.listRooms({
      buildingId: filters.buildingId,
      category: filters.category,
      siteId: scope.siteId,
      mapVersionId: scope.mapVersionId,
    });
  },

  listActiveNodes(scope: MapReadScope) {
    return campusRepository.listActiveNodes(scope.siteId, scope.mapVersionId);
  },

  listNamedPlaces(scope: MapReadScope) {
    return campusRepository.listNamedPlaces(scope.siteId, scope.mapVersionId);
  },

  listEdges(scope: MapReadScope) {
    return campusRepository.listEdges(scope.siteId, scope.mapVersionId);
  },

  search(q: string, scope: MapReadScope) {
    return campusRepository.search(q, scope.siteId, scope.mapVersionId);
  },

  listAreas(scope: MapReadScope) {
    return siteAreaRepository.listBySite(scope.siteId, scope.mapVersionId);
  },

  async getIndoorLayout(buildingId: string, floorId: string | undefined, scope: MapReadScope) {
    const building = await campusRepository.getBuildingById(buildingId);
    if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
    if (building.siteId !== scope.siteId) {
      throw new AppError('CROSS_SITE_REFERENCE', 'Building does not belong to the active site', 422);
    }
    const buildingVersion = await campusRepository.getBuildingMapVersionId(buildingId);
    if (buildingVersion !== scope.mapVersionId) {
      throw new AppError('NOT_FOUND', 'Building not found', 404);
    }
    const [floors, rooms, corridors, pois] = await Promise.all([
      floorLayoutRepository.listFloors(buildingId, scope.mapVersionId),
      floorLayoutRepository.listRooms(buildingId, floorId, scope.mapVersionId),
      floorLayoutRepository.listCorridors(buildingId, floorId, scope.mapVersionId),
      floorLayoutRepository.listPois(buildingId, floorId, scope.mapVersionId),
    ]);
    return { building, floors, rooms, corridors, pois };
  },
};
