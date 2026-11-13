/** Cross-platform AR tracking quality exposed to JavaScript. */
export type ArTrackingQuality =
  | 'unavailable'
  | 'initializing'
  | 'limited'
  | 'normal'
  | 'interrupted';

export type ArWorldPoint = {
  id: string;
  x: number;
  y: number;
  z: number;
};

export type ArMeasureEvent =
  | {
      type: 'tracking';
      quality: ArTrackingQuality;
      reason?: string;
    }
  | {
      type: 'points';
      points: ArWorldPoint[];
      segmentDistanceM: number | null;
      totalDistanceM: number;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'surface';
      detected: boolean;
    };

export type CampusARMeasureNativeCommands = {
  startSession(): Promise<void>;
  pauseSession(): Promise<void>;
  resumeSession(): Promise<void>;
  placePoint(): Promise<ArWorldPoint | null>;
  undoLastPoint(): Promise<void>;
  clearPoints(): Promise<void>;
  resetSession(): Promise<void>;
  getTrackingState(): Promise<{ quality: ArTrackingQuality; reason?: string }>;
};
