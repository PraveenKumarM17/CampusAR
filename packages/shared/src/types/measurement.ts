/**
 * Measurement Path & Point types for GPS-based admin measurements
 */

export type MeasurementPathType = 'indoor' | 'outdoor' | 'mixed';
export type MeasurementPathStatus = 'draft' | 'active' | 'archived';

export interface MeasurementPath {
  id: string;
  siteId: string;
  buildingId: string | null;
  floorId: string | null;
  mapVersionId: string;
  name: string;
  description: string | null;
  pathType: MeasurementPathType;
  status: MeasurementPathStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  pointCount?: number;
  totalLengthM?: number;
}

export interface MeasurementPoint {
  id: string;
  pathId: string;
  ordinal: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  floorLevel: number | null;
  accuracyM: number | null;
  label: string | null;
  recordedAt: string;
  metadata: Record<string, unknown>;
  snappedX: number | null;
  snappedY: number | null;
  snappedZ: number | null;
  snappedToNodeId: string | null;
}

export interface MeasurementEdge {
  id: string;
  pathId: string;
  fromPointId: string;
  toPointId: string;
  ordinal: number;
  lengthM: number;
  headingDeg: number | null;
  elevationChangeM: number | null;
  metadata: Record<string, unknown>;
}

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

export interface CreateMeasurementPathDto {
  siteId: string;
  buildingId?: string | null;
  floorId?: string | null;
  mapVersionId: string;
  name: string;
  description?: string | null;
  pathType?: MeasurementPathType;
  status?: MeasurementPathStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateMeasurementPathDto {
  name?: string;
  description?: string | null;
  status?: MeasurementPathStatus;
  pathType?: MeasurementPathType;
  metadata?: Record<string, unknown>;
}

export interface MeasurementPathStatistics {
  pointCount: number;
  totalLengthM: number;
  averageAccuracyM: number | null;
  startPoint: { latitude: number; longitude: number } | null;
  endPoint: { latitude: number; longitude: number } | null;
}
