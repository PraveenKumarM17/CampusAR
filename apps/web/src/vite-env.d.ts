/// <reference types="vite/client" />

declare module '*?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_MAP_ENGINE?: 'leaflet' | 'maplibre';
  readonly VITE_MAPLIBRE_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
