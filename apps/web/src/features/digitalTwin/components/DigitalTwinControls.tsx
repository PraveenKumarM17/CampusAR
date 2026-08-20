import { useState } from 'react';
import type { TwinCameraMode, TwinLayerFlags } from '../types/digitalTwin';

interface DigitalTwinControlsProps {
  layers: TwinLayerFlags;
  onToggle: (key: keyof TwinLayerFlags) => void;
  available: Partial<Record<keyof TwinLayerFlags, boolean>>;
  cameraMode: TwinCameraMode;
  onCameraMode: (mode: TwinCameraMode) => void;
  onResetCamera: () => void;
  onFocusSelected: () => void;
  canFocusSelected: boolean;
  onFocusRoute: () => void;
  canFocusRoute: boolean;
}

const LAYER_ITEMS: { key: keyof TwinLayerFlags; label: string }[] = [
  { key: 'buildings', label: 'Buildings' },
  { key: 'walkways', label: 'Walkways' },
  { key: 'activeRoute', label: 'Active route' },
  { key: 'pois', label: 'POIs' },
  { key: 'entrances', label: 'Entrances' },
  { key: 'parking', label: 'Parking' },
  { key: 'greenAreas', label: 'Open areas' },
  { key: 'liveData', label: 'Live data' },
  { key: 'hazards', label: 'Hazards' },
  { key: 'boundary', label: 'Boundary' },
];

export function DigitalTwinControls({
  layers,
  onToggle,
  available,
  cameraMode,
  onCameraMode,
  onResetCamera,
  onFocusSelected,
  canFocusSelected,
  onFocusRoute,
  canFocusRoute,
}: DigitalTwinControlsProps) {
  const [layersOpen, setLayersOpen] = useState(false);
  const visibleItems = LAYER_ITEMS.filter((item) => available[item.key] !== false);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={onResetCamera}>
          Reset camera
        </button>
        <button
          type="button"
          className="btn-ghost !px-3 !py-2 text-xs"
          disabled={!canFocusSelected}
          onClick={onFocusSelected}
        >
          Focus selected
        </button>
        <button
          type="button"
          className="btn-ghost !px-3 !py-2 text-xs"
          disabled={!canFocusRoute}
          onClick={onFocusRoute}
        >
          Focus route
        </button>
        {(['3D', 'TOP', 'BUILDING'] as TwinCameraMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`btn-ghost !px-3 !py-2 text-xs ${cameraMode === mode ? 'border-accent' : ''}`}
            onClick={() => onCameraMode(mode)}
          >
            {mode === '3D' ? '3D' : mode === 'TOP' ? 'Top view' : 'Building view'}
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost !px-3 !py-2 text-xs lg:hidden"
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
        >
          {layersOpen ? 'Hide layers' : 'Layers'}
        </button>
      </div>
      <div className={`${layersOpen ? 'flex' : 'hidden'} flex-wrap gap-2 lg:flex`}>
        {visibleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`btn-ghost !px-3 !py-2 text-xs ${layers[item.key] ? 'border-accent' : ''}`}
            onClick={() => onToggle(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
