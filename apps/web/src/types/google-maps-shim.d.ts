/** Minimal Google Maps typings for CampusAR (avoids hard dep on @types/google.maps). */
declare namespace google.maps {
  class Map {
    constructor(el: HTMLElement, opts?: Record<string, unknown>);
    setMapTypeId(id: string): void;
    setTilt(tilt: number): void;
    setHeading(heading: number): void;
    fitBounds(bounds: LatLngBounds, padding?: number | Record<string, number>): void;
  }
  class LatLngBounds {
    extend(latLng: LatLngLiteral): void;
  }
  class Polyline {
    constructor(opts?: Record<string, unknown>);
    setMap(map: Map | null): void;
  }
  class Marker {
    constructor(opts?: Record<string, unknown>);
    setMap(map: Map | null): void;
    addListener(event: string, handler: () => void): void;
  }
  class Circle {
    constructor(opts?: Record<string, unknown>);
    setMap(map: Map | null): void;
  }
  interface LatLngLiteral {
    lat: number;
    lng: number;
  }
  interface MVCObject {
    setMap?(map: Map | null): void;
  }
  enum SymbolPath {
    CIRCLE = 0,
  }
  const SymbolPath: {
    CIRCLE: SymbolPath;
  };
}

declare const google: {
  maps: typeof google.maps;
};
