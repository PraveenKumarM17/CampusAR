import type {
  MapDiffFeatureType,
  MapVersionDiff,
  MapVersionDiffFeature,
  MapVersionDiffModifiedFeature,
} from '@campusar/shared';
import { query } from '../infrastructure/db/pool';
import { haversineMeters } from '../domain/routing/astar';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

type ProjectionRow = {
  feature_type: MapDiffFeatureType;
  id: string;
  stable_id: string;
  version_id: string;
  name: string | null;
  geometry_hash: string | null;
  non_geom: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
};

const PROJECTION_SQL = `
  SELECT
    'building'::text AS feature_type,
    b.id,
    b.stable_id,
    b.map_version_id AS version_id,
    b.name,
    b.geometry_hash,
    jsonb_build_object(
      'name', b.name,
      'code', b.code,
      'description', b.description,
      'floorsCount', b.floors_count,
      'floorHeightM', b.floor_height_m
    ) AS non_geom,
    jsonb_build_object(
      'latitude', b.latitude,
      'longitude', b.longitude,
      'footprint', CASE WHEN b.footprint_geom IS NULL THEN NULL ELSE ST_AsGeoJSON(b.footprint_geom)::jsonb END
    ) AS geometry
  FROM buildings b
  WHERE b.map_version_id = $1
  UNION ALL
  SELECT
    'node'::text AS feature_type,
    n.id,
    n.stable_id,
    n.map_version_id AS version_id,
    n.name,
    n.geometry_hash,
    jsonb_build_object(
      'name', n.name,
      'floorLevel', f.level,
      'buildingStableId', b.stable_id,
      'kind', n.kind,
      'active', n.active
    ) AS non_geom,
    jsonb_build_object(
      'latitude', n.latitude,
      'longitude', n.longitude
    ) AS geometry
  FROM nodes n
  LEFT JOIN floors f ON f.id = n.floor_id
  LEFT JOIN buildings b ON b.id = n.building_id
  WHERE n.map_version_id = $1
  UNION ALL
  SELECT
    'edge'::text AS feature_type,
    e.id,
    e.stable_id,
    e.map_version_id AS version_id,
    NULL::text AS name,
    e.geometry_hash,
    jsonb_build_object(
      'fromNodeStableId', fn.stable_id,
      'toNodeStableId', tn.stable_id,
      'distanceM', e.distance_m,
      'kind', e.kind,
      'bidirectional', e.bidirectional,
      'blocked', e.blocked,
      'safetyScore', e.safety_score,
      'crowdScore', e.crowd_score,
      'accessibilityScore', e.accessibility_score
    ) AS non_geom,
    jsonb_build_object(
      'fromLatitude', fn.latitude,
      'fromLongitude', fn.longitude,
      'toLatitude', tn.latitude,
      'toLongitude', tn.longitude
    ) AS geometry
  FROM edges e
  JOIN nodes fn ON fn.id = e.from_node_id
  JOIN nodes tn ON tn.id = e.to_node_id
  WHERE e.map_version_id = $1
  UNION ALL
  SELECT
    'area'::text AS feature_type,
    a.id,
    a.stable_id,
    a.map_version_id AS version_id,
    a.name,
    a.geometry_hash,
    jsonb_build_object(
      'name', a.name,
      'type', a.type
    ) AS non_geom,
    jsonb_build_object(
      'footprint', ST_AsGeoJSON(a.footprint_geom)::jsonb
    ) AS geometry
  FROM site_areas a
  WHERE a.map_version_id = $1
`;

function toFeature(featureType: MapDiffFeatureType, row: ProjectionRow): MapVersionDiffFeature {
  return {
    featureType,
    stableId: row.stable_id,
    versionId: row.version_id,
    id: row.id,
    name: row.name,
  };
}

function parsePolygonRings(geo: unknown): Array<[number, number]> | null {
  if (!geo || typeof geo !== 'object') return null;
  const coords = (geo as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;
  const ring = coords[0] as unknown[];
  const points: Array<[number, number]> = [];
  for (const item of ring) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const lon = Number(item[0]);
    const lat = Number(item[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    points.push([lat, lon]);
  }
  return points;
}

function metersBetween(a: [number, number], b: [number, number]): number {
  return haversineMeters(a[0], a[1], b[0], b[1]);
}

function geometryChangedBeyondEpsilon(
  type: MapDiffFeatureType,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  epsilonM: number,
): boolean {
  if (!before || !after) return before !== after;
  if (type === 'node') {
    const a: [number, number] = [Number(before.latitude), Number(before.longitude)];
    const b: [number, number] = [Number(after.latitude), Number(after.longitude)];
    return metersBetween(a, b) > epsilonM;
  }
  if (type === 'edge') {
    const af: [number, number] = [Number(before.fromLatitude), Number(before.fromLongitude)];
    const at: [number, number] = [Number(before.toLatitude), Number(before.toLongitude)];
    const bf: [number, number] = [Number(after.fromLatitude), Number(after.fromLongitude)];
    const bt: [number, number] = [Number(after.toLatitude), Number(after.toLongitude)];
    const direct = Math.max(metersBetween(af, bf), metersBetween(at, bt));
    const reversed = Math.max(metersBetween(af, bt), metersBetween(at, bf));
    return Math.min(direct, reversed) > epsilonM;
  }
  if (type === 'building') {
    const beforeFootprint = parsePolygonRings(before.footprint);
    const afterFootprint = parsePolygonRings(after.footprint);
    if (beforeFootprint && afterFootprint) {
      if (beforeFootprint.length !== afterFootprint.length) return true;
      for (let i = 0; i < beforeFootprint.length; i += 1) {
        if (metersBetween(beforeFootprint[i]!, afterFootprint[i]!) > epsilonM) return true;
      }
      return false;
    }
    const a: [number, number] = [Number(before.latitude), Number(before.longitude)];
    const b: [number, number] = [Number(after.latitude), Number(after.longitude)];
    return metersBetween(a, b) > epsilonM;
  }
  const beforeFootprint = parsePolygonRings(before.footprint);
  const afterFootprint = parsePolygonRings(after.footprint);
  if (!beforeFootprint || !afterFootprint) return JSON.stringify(before) !== JSON.stringify(after);
  if (beforeFootprint.length !== afterFootprint.length) return true;
  for (let i = 0; i < beforeFootprint.length; i += 1) {
    if (metersBetween(beforeFootprint[i]!, afterFootprint[i]!) > epsilonM) return true;
  }
  return false;
}

function computeChangedFields(before: ProjectionRow, after: ProjectionRow, includeGeometry: boolean): string[] {
  const changed: string[] = [];
  const keys = new Set<string>([
    ...Object.keys(before.non_geom ?? {}),
    ...Object.keys(after.non_geom ?? {}),
  ]);
  for (const key of keys) {
    const a = before.non_geom?.[key];
    const b = after.non_geom?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  if (includeGeometry) changed.push('geometry');
  return changed.length > 0 ? changed : ['geometry'];
}

export const mapVersionDiffService = {
  async computeDiff(
    draftVersionId: string,
    publishedVersionId: string | null,
    client?: Queryable,
    epsilonMeters = 0.5,
  ): Promise<MapVersionDiff> {
    return this.diffVersions(draftVersionId, publishedVersionId, client, epsilonMeters);
  },

  async diffVersions(
    draftVersionId: string,
    baseVersionId: string | null,
    client?: Queryable,
    epsilonMeters = 0.5,
  ): Promise<MapVersionDiff> {
    if (!baseVersionId) {
      return {
        versionId: draftVersionId,
        baseVersionId: null,
        added: [],
        removed: [],
        modified: [],
        summary: { added: 0, removed: 0, modified: 0 },
      };
    }
    const q = client ? (sql: string, params?: unknown[]) => client.query(sql, params) : query;
    const run = async (versionId: string): Promise<ProjectionRow[]> => {
      const sql = PROJECTION_SQL;
      const res = await q(sql, [versionId]);
      return res.rows as ProjectionRow[];
    };
    const added: MapVersionDiffFeature[] = [];
    const removed: MapVersionDiffFeature[] = [];
    const modified: MapVersionDiffModifiedFeature[] = [];

    const [draftRows, baseRows] = await Promise.all([run(draftVersionId), run(baseVersionId)]);
    const keyFor = (r: ProjectionRow) => `${r.feature_type}:${r.stable_id}`;
    const draftByStable = new Map(draftRows.map((r) => [keyFor(r), r]));
    const baseByStable = new Map(baseRows.map((r) => [keyFor(r), r]));

    for (const [stableKey, draftRow] of draftByStable) {
      const baseRow = baseByStable.get(stableKey);
      const featureType = draftRow.feature_type;
      if (!baseRow) {
        added.push(toFeature(featureType, draftRow));
        continue;
      }
      const nonGeomChanged = JSON.stringify(draftRow.non_geom) !== JSON.stringify(baseRow.non_geom);
      const geometryHashChanged = (draftRow.geometry_hash ?? '') !== (baseRow.geometry_hash ?? '');
      let geometryChanged = false;
      if (geometryHashChanged) {
        geometryChanged = geometryChangedBeyondEpsilon(
          featureType,
          baseRow.geometry,
          draftRow.geometry,
          epsilonMeters,
        );
      }
      if (nonGeomChanged || geometryChanged) {
        modified.push({
          ...toFeature(featureType, draftRow),
          changedFields: computeChangedFields(baseRow, draftRow, geometryChanged),
        });
      }
    }

    for (const [stableKey, baseRow] of baseByStable) {
      if (!draftByStable.has(stableKey)) {
        removed.push(toFeature(baseRow.feature_type, baseRow));
      }
    }

    return {
      versionId: draftVersionId,
      baseVersionId,
      added,
      removed,
      modified,
      summary: {
        added: added.length,
        removed: removed.length,
        modified: modified.length,
      },
    };
  },
};

