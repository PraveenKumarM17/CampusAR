import type { TwinLatLng } from '../types/digitalTwin';

/**
 * Optional surveyed building footprints (WGS84 lat/lng rings).
 * Keep empty until real polygons exist — do not invent campus outlines.
 */
export const BUILDING_FOOTPRINTS: Record<string, TwinLatLng[]> = {};

/**
 * Optional measured building width/depth in meters.
 * Keep empty until real dimensions exist.
 */
export const BUILDING_DIMENSIONS: Record<string, { width: number; depth: number }> = {};

/**
 * Optional campus boundary ring. Null until a real polygon is surveyed.
 */
export const CAMPUS_BOUNDARY: TwinLatLng[] | null = null;

/**
 * Optional parking lot polygons keyed by parking/building id.
 * Keep empty until real lot geometry exists. Do not invent stall counts.
 */
export const PARKING_POLYGONS: Record<string, TwinLatLng[]> = {};

/**
 * Optional garden / sports-field polygons keyed by building or area id.
 * Keep empty until real open-area geometry exists. Do not generate trees.
 */
export const GREEN_AREA_POLYGONS: Record<string, TwinLatLng[]> = {};
