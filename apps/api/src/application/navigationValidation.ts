import type { GraphNode, RoutePlaceSummary } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { campusRepository } from '../infrastructure/repositories/campusRepository';

export function isNamedPlace(node: Pick<GraphNode, 'name'>): boolean {
  return Boolean(node.name?.trim());
}

export function toRoutePlaceSummary(node: GraphNode): RoutePlaceSummary {
  return {
    id: node.id,
    name: node.name?.trim() ?? '',
    latitude: node.latitude,
    longitude: node.longitude,
    kind: node.kind,
  };
}

export function toCampusPlace(node: GraphNode): CampusPlace {
  return {
    id: node.id,
    name: node.name?.trim() ?? '',
    latitude: node.latitude,
    longitude: node.longitude,
    floorId: node.floorId,
    buildingId: node.buildingId,
    kind: node.kind,
  };
}

type EndpointField = 'sourceNodeId' | 'destinationNodeId';

function endpointLabel(field: EndpointField): string {
  return field === 'sourceNodeId' ? 'Source' : 'Destination';
}

function assertNavigableEndpoint(
  field: EndpointField,
  nodeId: string,
  node: GraphNode | null,
): RoutePlaceSummary {
  if (!node) {
    throw new AppError('INVALID_NODE', `${endpointLabel(field)} place was not found`, 422, {
      field,
      nodeId,
      reason: 'not_found',
    });
  }
  if (node.active === false) {
    throw new AppError(
      'INVALID_NODE',
      `${node.name?.trim() ?? 'This place'} is no longer available for navigation`,
      422,
      { field, nodeId, reason: 'inactive' },
    );
  }
  if (!isNamedPlace(node)) {
    throw new AppError(
      'INVALID_NODE',
      `${endpointLabel(field)} must be a named campus place`,
      422,
      { field, nodeId, reason: 'unnamed' },
    );
  }
  return toRoutePlaceSummary(node);
}

/** Validates user-facing route endpoints (named, active places). */
export async function validateRouteEndpoints(
  sourceNodeId: string,
  destinationNodeId: string,
): Promise<{ source: RoutePlaceSummary; destination: RoutePlaceSummary }> {
  if (sourceNodeId === destinationNodeId) {
    throw new AppError('SAME_NODE', 'Source and destination must be different', 400, {
      sourceNodeId,
      destinationNodeId,
    });
  }

  const [sourceNode, destinationNode] = await Promise.all([
    campusRepository.getNodeById(sourceNodeId),
    campusRepository.getNodeById(destinationNodeId),
  ]);

  const source = assertNavigableEndpoint('sourceNodeId', sourceNodeId, sourceNode);
  const destination = assertNavigableEndpoint(
    'destinationNodeId',
    destinationNodeId,
    destinationNode,
  );

  return { source, destination };
}

/** Validates share-link node IDs without throwing. */
export async function resolveShareEndpoints(
  fromId: string | null,
  toId: string | null,
): Promise<{
  valid: boolean;
  source: RoutePlaceSummary | null;
  destination: RoutePlaceSummary | null;
  errors: Array<{ field: 'from' | 'to'; code: string; message: string; nodeId?: string }>;
}> {
  const errors: Array<{ field: 'from' | 'to'; code: string; message: string; nodeId?: string }> =
    [];
  let source: RoutePlaceSummary | null = null;
  let destination: RoutePlaceSummary | null = null;

  async function check(field: 'from' | 'to', nodeId: string | null) {
    if (!nodeId) return;
    const node = await campusRepository.getNodeById(nodeId);
    if (!node) {
      errors.push({
        field,
        code: 'INVALID_NODE',
        message: `${field === 'from' ? 'Start' : 'Destination'} place was not found`,
        nodeId,
      });
      return;
    }
    if (node.active === false) {
      errors.push({
        field,
        code: 'INVALID_NODE',
        message: `${node.name?.trim() ?? 'This place'} is no longer available for navigation`,
        nodeId,
      });
      return;
    }
    if (!isNamedPlace(node)) {
      errors.push({
        field,
        code: 'INVALID_NODE',
        message: `${field === 'from' ? 'Start' : 'Destination'} must be a named campus place`,
        nodeId,
      });
      return;
    }
    const summary = toRoutePlaceSummary(node);
    if (field === 'from') source = summary;
    else destination = summary;
  }

  await Promise.all([check('from', fromId), check('to', toId)]);

  return {
    valid: errors.length === 0 && (fromId == null || source != null) && (toId == null || destination != null),
    source,
    destination,
    errors,
  };
}
