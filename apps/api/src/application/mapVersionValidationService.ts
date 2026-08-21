import type { MapValidationIssue, SiteMapVersion, UnifiedMapValidationResult } from '@campusar/shared';
import { validateSiteMap } from './mapValidation';
import { validateIndoorLayout } from './indoorLayoutValidation';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { query } from '../infrastructure/db/pool';

function mergeIssues(...groups: MapValidationIssue[][]): MapValidationIssue[] {
  return groups.flat();
}

function summarize(issues: MapValidationIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.level === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/** Detect rows or references that belong to a different map version within the site. */
async function validateVersionScopeIntegrity(
  siteId: string,
  mapVersionId: string,
): Promise<MapValidationIssue[]> {
  const issues: MapValidationIssue[] = [];

  const tables: Array<{ table: string; resourceType: MapValidationIssue['resourceType'] }> = [
    { table: 'buildings', resourceType: 'building' },
    { table: 'nodes', resourceType: 'node' },
    { table: 'edges', resourceType: 'edge' },
    { table: 'site_areas', resourceType: 'area' },
  ];

  for (const { table, resourceType } of tables) {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM ${table}
       WHERE site_id = $1 AND map_version_id IS DISTINCT FROM $2`,
      [siteId, mapVersionId],
    );
    for (const row of rows) {
      issues.push({
        level: 'error',
        code: 'CROSS_VERSION_REFERENCE',
        message: `${table.slice(0, -1)} belongs to a different map version.`,
        resourceType,
        resourceId: row.id,
      });
    }
  }

  const { rows: crossVersionEdges } = await query<{ id: string; from_node_id: string; to_node_id: string }>(
    `SELECT e.id, e.from_node_id, e.to_node_id
     FROM edges e
     WHERE e.site_id = $1 AND e.map_version_id = $2`,
    [siteId, mapVersionId],
  );

  for (const edge of crossVersionEdges) {
    const fromVersion = await campusRepository.getNodeMapVersionId(edge.from_node_id);
    const toVersion = await campusRepository.getNodeMapVersionId(edge.to_node_id);
    if (fromVersion != null && fromVersion !== mapVersionId) {
      issues.push({
        level: 'error',
        code: 'CROSS_VERSION_REFERENCE',
        message: 'Outdoor edge references a start node from another map version.',
        resourceType: 'edge',
        resourceId: edge.id,
      });
    }
    if (toVersion != null && toVersion !== mapVersionId) {
      issues.push({
        level: 'error',
        code: 'CROSS_VERSION_REFERENCE',
        message: 'Outdoor edge references an end node from another map version.',
        resourceType: 'edge',
        resourceId: edge.id,
      });
    }
  }

  const { rows: buildings } = await query<{ id: string }>(
    `SELECT id FROM buildings WHERE site_id = $1 AND map_version_id = $2`,
    [siteId, mapVersionId],
  );

  for (const building of buildings) {
    const { rows: mismatchedFloors } = await query<{ id: string }>(
      `SELECT id FROM floors
       WHERE building_id = $1 AND map_version_id IS DISTINCT FROM $2`,
      [building.id, mapVersionId],
    );
    for (const floor of mismatchedFloors) {
      issues.push({
        level: 'error',
        code: 'CROSS_VERSION_REFERENCE',
        message: 'Floor belongs to a different map version than its building.',
        resourceType: 'floor',
        resourceId: floor.id,
      });
    }

    const { rows: mismatchedMaps } = await query<{ id: string; building_id: string }>(
      `SELECT id, building_id FROM indoor_maps
       WHERE building_id = $1 AND map_version_id IS DISTINCT FROM $2`,
      [building.id, mapVersionId],
    );
    for (const map of mismatchedMaps) {
      issues.push({
        level: 'error',
        code: 'CROSS_VERSION_REFERENCE',
        message: 'Indoor map belongs to a different map version than its building.',
        resourceType: 'building',
        resourceId: map.building_id,
      });
    }
  }

  return issues;
}

/**
 * Aggregates outdoor, indoor layout, indoor graph, and version-scope validators
 * for a single requested map version. Does not mutate data.
 */
export async function validateMapVersion(
  siteId: string,
  version: SiteMapVersion,
): Promise<UnifiedMapValidationResult> {
  const mapVersionId = version.id;

  const outdoor = await validateSiteMap(siteId, mapVersionId);
  const buildings = await campusRepository.listBuildings(siteId, mapVersionId);

  const indoorGroups = await Promise.all(
    buildings.map(async (building) => validateIndoorLayout(building.id, siteId, mapVersionId)),
  );
  const indoorIssues = indoorGroups.flatMap((result) => [...result.errors, ...result.warnings]);
  const integrityIssues = await validateVersionScopeIntegrity(siteId, mapVersionId);

  const issues = mergeIssues(outdoor.issues, indoorIssues, integrityIssues);
  const summary = summarize(issues);

  return {
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      label: version.label,
    },
    valid: summary.errors === 0,
    summary,
    issues,
  };
}
