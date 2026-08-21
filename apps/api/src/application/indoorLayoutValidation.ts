import type { IndoorLayoutValidationResult, MapValidationIssue } from '@campusar/shared';
import { floorLayoutRepository } from '../infrastructure/repositories/floorLayoutRepository';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { validateLocalPolygon, ringsOverlap } from './floorLayoutValidation';
import { validateIndoorGraph } from './indoorGraphValidation';

function push(issues: MapValidationIssue[], issue: MapValidationIssue) {
  issues.push(issue);
}

export async function validateIndoorLayout(
  buildingId: string,
  siteId: string,
): Promise<IndoorLayoutValidationResult> {
  const issues: MapValidationIssue[] = [];
  const building = await campusRepository.getBuildingById(buildingId);
  if (!building) {
    push(issues, {
      level: 'error',
      code: 'MISSING_BUILDING',
      message: 'Building not found.',
      resourceType: 'building',
      resourceId: buildingId,
    });
    return summarize(issues);
  }
  if (building.siteId !== siteId) {
    push(issues, {
      level: 'error',
      code: 'CROSS_SITE_BUILDING',
      message: `Building "${building.name}" belongs to another site.`,
      resourceType: 'building',
      resourceId: buildingId,
    });
    return summarize(issues);
  }

  const snapshot = await floorLayoutRepository.loadSnapshot(buildingId, siteId);

  if (snapshot.floors.length === 0) {
    push(issues, {
      level: 'warning',
      code: 'NO_FLOORS',
      message: `${building.name} has no floors defined yet.`,
      resourceType: 'building',
      resourceId: buildingId,
    });
  }

  for (const floor of snapshot.floors) {
    const floorRooms = snapshot.rooms.filter((r) => r.floorId === floor.id);
    const floorCorridors = snapshot.corridors.filter((c) => c.floorId === floor.id);
    const floorPois = snapshot.pois.filter((p) => p.floorId === floor.id);

    if (floorRooms.length === 0 && floorCorridors.length === 0 && floorPois.length === 0) {
      push(issues, {
        level: 'warning',
        code: 'EMPTY_FLOOR',
        message: `Floor "${floor.name}" has no rooms, corridors, or POIs.`,
        resourceType: 'floor',
        resourceId: floor.id,
      });
    }

    if (floorRooms.length > 0 && floorCorridors.length === 0) {
      push(issues, {
        level: 'warning',
        code: 'NO_CORRIDOR',
        message: `Floor "${floor.name}" has rooms but no corridor geometry.`,
        resourceType: 'floor',
        resourceId: floor.id,
      });
    }

    for (const room of floorRooms) {
      if (room.buildingId !== buildingId) {
        push(issues, {
          level: 'error',
          code: 'CROSS_BUILDING_ROOM',
          message: `Room "${room.name}" belongs to another building.`,
          resourceType: 'room',
          resourceId: room.id,
        });
      }
      if (!room.localGeometry || room.localGeometry.length < 3) {
        push(issues, {
          level: 'error',
          code: 'INVALID_ROOM_GEOMETRY',
          message: `Room "${room.name}" has invalid or missing geometry.`,
          resourceType: 'room',
          resourceId: room.id,
        });
        continue;
      }
      try {
        validateLocalPolygon(room.localGeometry, 'Room');
      } catch {
        push(issues, {
          level: 'error',
          code: 'INVALID_ROOM_GEOMETRY',
          message: `Room "${room.name}" has invalid geometry.`,
          resourceType: 'room',
          resourceId: room.id,
        });
      }
    }

    for (let i = 0; i < floorRooms.length; i++) {
      for (let j = i + 1; j < floorRooms.length; j++) {
        const a = floorRooms[i].localGeometry;
        const b = floorRooms[j].localGeometry;
        if (a?.length && b?.length && ringsOverlap(a, b)) {
          push(issues, {
            level: 'warning',
            code: 'OVERLAPPING_ROOMS',
            message: `Rooms "${floorRooms[i].name}" and "${floorRooms[j].name}" may overlap.`,
            resourceType: 'room',
            resourceId: floorRooms[i].id,
          });
        }
      }
    }

    for (const corridor of floorCorridors) {
      if (!corridor.localGeometry || corridor.localGeometry.length < 3) {
        push(issues, {
          level: 'error',
          code: 'INVALID_CORRIDOR_GEOMETRY',
          message: `Corridor "${corridor.name ?? corridor.id}" has invalid geometry.`,
          resourceType: 'corridor',
          resourceId: corridor.id,
        });
      }
    }

    for (const poi of floorPois) {
      if (!Number.isFinite(poi.localX) || !Number.isFinite(poi.localY)) {
        push(issues, {
          level: 'error',
          code: 'INVALID_POI_COORDS',
          message: `POI "${poi.name}" has invalid coordinates.`,
          resourceType: 'poi',
          resourceId: poi.id,
        });
      }
    }
  }

  const graphIssues = await validateIndoorGraph(buildingId, siteId);
  issues.push(...graphIssues);

  return summarize(issues);
}

function summarize(issues: MapValidationIssue[]): IndoorLayoutValidationResult {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return {
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}
