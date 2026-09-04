import { AppError } from '../domain/errors';
import { measurementPathRepository } from '../infrastructure/repositories/measurementPathRepository';
import type {
  MeasurementPath,
  MeasurementPoint,
  MeasurementEdge,
  CreatePathInput,
  CreatePointInput,
} from '../infrastructure/repositories/measurementPathRepository';
import { siteRepository } from '../infrastructure/repositories/siteRepository';
import { mapVersionRepository } from '../infrastructure/repositories/mapVersionRepository';

export interface MeasurementPathWithDetails extends MeasurementPath {
  points: MeasurementPoint[];
  edges: MeasurementEdge[];
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timestamp?: number;
}

export const measurementPathService = {
  /**
   * Create a new measurement path
   */
  async createPath(input: CreatePathInput, userId?: string): Promise<MeasurementPath> {
    // Validate site access
    if (input.siteId) {
      const site = await siteRepository.getById(input.siteId);
      if (!site) {
        throw new AppError('SITE_NOT_FOUND', 'Site not found', 404);
      }
    }

    // Ensure map version is draft (read-only validation)
    if (input.mapVersionId) {
      const version = await mapVersionRepository.getById(input.mapVersionId);
      if (!version) {
        throw new AppError('MAP_VERSION_NOT_FOUND', 'Map version not found', 404);
      }
      if (version.status !== 'draft') {
        throw new AppError('VERSION_NOT_DRAFT', 'Can only add measurements to draft map versions', 422);
      }
    }

    const pathInput: CreatePathInput = {
      ...input,
      createdBy: userId,
      status: input.status ?? 'draft',
      pathType: input.pathType ?? 'indoor',
      metadata: input.metadata ?? {},
    };

    return measurementPathRepository.createPath(pathInput);
  },

  /**
   * Get a measurement path with all points and edges
   */
  async getPathWithDetails(pathId: string): Promise<MeasurementPathWithDetails | null> {
    const path = await measurementPathRepository.getPathById(pathId);
    if (!path) return null;

    const [points, edges] = await Promise.all([
      measurementPathRepository.getPointsByPathId(pathId),
      measurementPathRepository.getEdgesByPathId(pathId),
    ]);

    return {
      ...path,
      points,
      edges,
    };
  },

  /**
   * List all measurement paths for a site/floor
   */
  async listPaths(filters: {
    siteId?: string;
    floorId?: string;
    buildingId?: string;
    status?: string;
    mapVersionId?: string;
  }): Promise<MeasurementPath[]> {
    return measurementPathRepository.listPaths(filters);
  },

  /**
   * Update a measurement path
   */
  async updatePath(pathId: string, updates: Partial<CreatePathInput>): Promise<MeasurementPath> {
    const existing = await measurementPathRepository.getPathById(pathId);
    if (!existing) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    // Ensure map version is draft
    if (existing.mapVersionId) {
      const version = await mapVersionRepository.getById(existing.mapVersionId);
      if (version && version.status !== 'draft') {
        throw new AppError('VERSION_NOT_DRAFT', 'Can only modify measurements in draft map versions', 422);
      }
    }

    const updated = await measurementPathRepository.updatePath(pathId, updates);
    if (!updated) {
      throw new AppError('UPDATE_FAILED', 'Failed to update measurement path', 500);
    }

    return updated;
  },

  /**
   * Delete a measurement path and all its points
   */
  async deletePath(pathId: string): Promise<void> {
    const existing = await measurementPathRepository.getPathById(pathId);
    if (!existing) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    // Ensure map version is draft
    if (existing.mapVersionId) {
      const version = await mapVersionRepository.getById(existing.mapVersionId);
      if (version && version.status !== 'draft') {
        throw new AppError('VERSION_NOT_DRAFT', 'Can only delete measurements from draft map versions', 422);
      }
    }

    const deleted = await measurementPathRepository.deletePath(pathId);
    if (!deleted) {
      throw new AppError('DELETE_FAILED', 'Failed to delete measurement path', 500);
    }
  },

  /**
   * Add a single GPS point to a path
   */
  async addPoint(pathId: string, point: GpsPoint, label?: string): Promise<MeasurementPoint> {
    const path = await measurementPathRepository.getPathById(pathId);
    if (!path) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    // Ensure map version is draft
    if (path.mapVersionId) {
      const version = await mapVersionRepository.getById(path.mapVersionId);
      if (version && version.status !== 'draft') {
        throw new AppError('VERSION_NOT_DRAFT', 'Can only add points to measurements in draft map versions', 422);
      }
    }

    // Get current point count to determine ordinal
    const existingPoints = await measurementPathRepository.getPointsByPathId(pathId);
    const ordinal = existingPoints.length + 1;

    const pointInput: CreatePointInput = {
      pathId,
      ordinal,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude,
      accuracyM: point.accuracy,
      label,
      floorLevel: path.floorId ? 0 : null, // Default floor level if on a floor
      recordedAt: point.timestamp ? new Date(point.timestamp) : new Date(),
      metadata: {},
    };

    return measurementPathRepository.createPoint(pointInput);
  },

  /**
   * Bulk add multiple GPS points to a path
   */
  async addPoints(pathId: string, points: GpsPoint[]): Promise<MeasurementPoint[]> {
    if (points.length === 0) return [];

    const path = await measurementPathRepository.getPathById(pathId);
    if (!path) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    // Ensure map version is draft
    if (path.mapVersionId) {
      const version = await mapVersionRepository.getById(path.mapVersionId);
      if (version && version.status !== 'draft') {
        throw new AppError('VERSION_NOT_DRAFT', 'Can only add points to measurements in draft map versions', 422);
      }
    }

    // Get current point count to determine starting ordinal
    const existingPoints = await measurementPathRepository.getPointsByPathId(pathId);
    let ordinal = existingPoints.length + 1;

    const pointInputs: CreatePointInput[] = points.map((point) => ({
      pathId,
      ordinal: ordinal++,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude,
      accuracyM: point.accuracy,
      floorLevel: path.floorId ? 0 : null,
      recordedAt: point.timestamp ? new Date(point.timestamp) : new Date(),
      metadata: {},
    }));

    return measurementPathRepository.bulkCreatePoints(pointInputs);
  },

  /**
   * Update a measurement point
   */
  async updatePoint(pointId: string, updates: Partial<CreatePointInput>): Promise<MeasurementPoint> {
    const updated = await measurementPathRepository.updatePoint(pointId, updates);
    if (!updated) {
      throw new AppError('POINT_NOT_FOUND', 'Measurement point not found', 404);
    }
    return updated;
  },

  /**
   * Delete a measurement point (and regenerate edges)
   */
  async deletePoint(pointId: string): Promise<void> {
    const deleted = await measurementPathRepository.deletePoint(pointId);
    if (!deleted) {
      throw new AppError('POINT_NOT_FOUND', 'Measurement point not found', 404);
    }
  },

  /**
   * Get all points for a path
   */
  async getPathPoints(pathId: string): Promise<MeasurementPoint[]> {
    return measurementPathRepository.getPointsByPathId(pathId);
  },

  /**
   * Get all edges for a path
   */
  async getPathEdges(pathId: string): Promise<MeasurementEdge[]> {
    return measurementPathRepository.getEdgesByPathId(pathId);
  },

  /**
   * Snap points to nearest indoor nodes
   */
  async snapPointsToIndoorGraph(pathId: string, snapRadiusM: number = 2.0): Promise<void> {
    // TODO: Implement snapping logic to indoor nodes
    // This will be implemented when integrating with the indoor graph
    throw new AppError('NOT_IMPLEMENTED', 'Snapping not yet implemented', 501);
  },

  /**
   * Export path as GeoJSON
   */
  async exportPathAsGeoJson(pathId: string): Promise<any> {
    const pathDetails = await this.getPathWithDetails(pathId);
    if (!pathDetails) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    const features: any[] = pathDetails.points.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude, point.altitude || 0],
      },
      properties: {
        id: point.id,
        ordinal: point.ordinal,
        label: point.label,
        accuracyM: point.accuracyM,
        recordedAt: point.recordedAt,
      },
    }));

    // Add LineString feature for the path
    if (pathDetails.points.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: pathDetails.points.map((p) => [p.longitude, p.latitude, p.altitude || 0]),
        },
        properties: {
          name: pathDetails.name,
          totalLengthM: pathDetails.totalLengthM,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  },

  /**
   * Calculate statistics for a path
   */
  async getPathStatistics(pathId: string): Promise<{
    pointCount: number;
    totalLengthM: number;
    averageAccuracyM: number | null;
    startPoint: { latitude: number; longitude: number } | null;
    endPoint: { latitude: number; longitude: number } | null;
  }> {
    const pathDetails = await this.getPathWithDetails(pathId);
    if (!pathDetails) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }

    const points = pathDetails.points;
    const edges = pathDetails.edges;

    const totalLengthM = edges.reduce((sum, edge) => sum + edge.lengthM, 0);
    const accuracies = points.filter((p) => p.accuracyM !== null).map((p) => p.accuracyM!);
    const averageAccuracyM =
      accuracies.length > 0 ? accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length : null;

    return {
      pointCount: points.length,
      totalLengthM,
      averageAccuracyM,
      startPoint: points.length > 0 ? { latitude: points[0].latitude, longitude: points[0].longitude } : null,
      endPoint:
        points.length > 0
          ? { latitude: points[points.length - 1].latitude, longitude: points[points.length - 1].longitude }
          : null,
    };
  },
};
