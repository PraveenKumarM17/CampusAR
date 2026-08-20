import 'leaflet';

declare module 'leaflet' {
  interface Map {
    pm: {
      setGlobalOptions(options: Record<string, unknown>): void;
      enableDraw(shape: string, options?: Record<string, unknown>): void;
      disableDraw(): void;
    };
  }
}

declare module '@geoman-io/leaflet-geoman-free';
