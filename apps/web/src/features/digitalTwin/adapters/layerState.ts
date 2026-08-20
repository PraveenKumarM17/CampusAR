import type { TwinLayerFlags, TwinDataSourceId } from '../types/digitalTwin';
import { DEFAULT_TWIN_LAYERS } from '../types/digitalTwin';

export type TwinDataSourceVisibility = Record<TwinDataSourceId, boolean>;

/**
 * Maps UI layer flags to data-source `.show` values.
 * Toggling a layer must not recreate the Cesium Viewer — only these booleans change.
 */
export function dataSourceVisibility(flags: TwinLayerFlags): TwinDataSourceVisibility {
  return {
    buildings: flags.buildings,
    walkways: flags.walkways,
    route: flags.activeRoute,
    pois: flags.pois,
    entrances: flags.entrances,
    parking: flags.parking,
    greenAreas: flags.greenAreas,
    hazards: flags.hazards,
    boundary: flags.boundary,
    user: flags.liveData,
  };
}

export function toggleTwinLayer(flags: TwinLayerFlags, key: keyof TwinLayerFlags): TwinLayerFlags {
  return { ...flags, [key]: !flags[key] };
}

export function layerFlagsEqual(a: TwinLayerFlags, b: TwinLayerFlags): boolean {
  return (Object.keys(DEFAULT_TWIN_LAYERS) as (keyof TwinLayerFlags)[]).every((k) => a[k] === b[k]);
}

export function staticCampusSignature(input: {
  buildingIds: string[];
  nodeIds: string[];
  edgeIds: string[];
}): string {
  return `${input.buildingIds.join(',')}|${input.nodeIds.join(',')}|${input.edgeIds.join(',')}`;
}
