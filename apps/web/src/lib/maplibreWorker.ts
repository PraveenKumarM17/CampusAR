/**
 * MapLibre GL JS v6 + Vite: worker must be wired via ?worker&url or the map
 * never reaches `load` (style/tiles hang; custom GeoJSON layers never attach).
 * Import this once before constructing any maplibregl.Map.
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let configured = false;

export function ensureMapLibreWorker(): void {
  if (configured) return;
  setWorkerUrl(workerUrl);
  configured = true;
}
