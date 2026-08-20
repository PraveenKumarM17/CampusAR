import { describe, expect, it } from 'vitest';
import type { IndoorBuildingContext, IndoorPlace } from '@campusar/shared';
import {
  afterIndoorCompletePatch,
  buildingContextToNavPatch,
  cancelIndoorScanStatus,
  clearBuildingContextCache,
  filterPlacesForBuilding,
  formatPlaceHierarchy,
  hasPublishedIndoorMap,
  indoorConfirmVisible,
  indoorPickerVisible,
  loadBuildingContext,
  outdoorDestinationForBuilding,
  parseIndoorParams,
  placeBelongsToBuilding,
  shouldOpenIndoorPicker,
} from './buildingNavigation';

const itBlock: IndoorBuildingContext = {
  building: { id: '11111111-1111-4111-8111-111111111111', name: 'IT Block', code: 'IT' },
  indoorMap: { id: '22222222-2222-4222-8222-222222222222', name: 'IT indoor', status: 'published' },
  entrance: {
    outdoorNodeId: '33333333-3333-4333-8333-333333333333',
    indoorNodeId: '44444444-4444-4444-8444-444444444444',
    name: 'IT Block Main Entrance',
  },
  floors: [{ id: 'f3', buildingId: '11111111-1111-4111-8111-111111111111', level: 3, name: 'Floor 3' }],
  placeCount: 2,
  quickPlaces: [],
  anchors: [],
};

const noMap: IndoorBuildingContext = {
  ...itBlock,
  indoorMap: null,
  placeCount: 0,
  anchors: [],
};

const teacher: IndoorPlace = {
  id: '55555555-5555-4555-8555-555555555555',
  mapId: itBlock.indoorMap!.id,
  buildingId: itBlock.building.id,
  floorId: 'f3',
  nodeId: 'n1',
  parentPlaceId: '66666666-6666-4666-8666-666666666666',
  name: 'Teacher X',
  category: 'person',
  searchable: true,
  metadata: {},
  active: true,
};

const cabin: IndoorPlace = {
  ...teacher,
  id: '66666666-6666-4666-8666-666666666666',
  parentPlaceId: '77777777-7777-4777-8777-777777777777',
  name: 'Teachers Cabin',
  category: 'cabin',
};

const room: IndoorPlace = {
  ...teacher,
  id: '77777777-7777-4777-8777-777777777777',
  parentPlaceId: null,
  name: 'Room 308',
  category: 'room',
};

const ecePlace: IndoorPlace = {
  ...teacher,
  id: '88888888-8888-4888-8888-888888888888',
  buildingId: '99999999-9999-4999-8999-999999999999',
  name: 'ECE Lab',
};

describe('building with no indoor map', () => {
  it('keeps normal outdoor navigation to the entrance when present', () => {
    expect(hasPublishedIndoorMap(noMap)).toBe(false);
    const patch = buildingContextToNavPatch(noMap);
    expect(patch.hasIndoorMap).toBe(false);
    expect(patch.transitionStatus).toBe('none');
    expect(outdoorDestinationForBuilding(patch)).toBe(noMap.entrance?.outdoorNodeId);
  });
});

describe('building with indoor map', () => {
  it('preloads indoor context and routes outdoors to the entrance', () => {
    const patch = buildingContextToNavPatch(itBlock);
    expect(patch.hasIndoorMap).toBe(true);
    expect(patch.indoorMapId).toBe(itBlock.indoorMap?.id);
    expect(patch.transitionStatus).toBe('navigating_outdoor');
    expect(outdoorDestinationForBuilding(patch)).toBe(itBlock.entrance?.outdoorNodeId);
  });

  it('caches building context so the selected building is not fetched repeatedly', async () => {
    clearBuildingContextCache();
    let calls = 0;
    const fetchContext = async () => {
      calls += 1;
      return itBlock;
    };
    await loadBuildingContext(itBlock.building.id, fetchContext);
    await loadBuildingContext(itBlock.building.id, fetchContext);
    expect(calls).toBe(1);
  });
});

describe('outdoor arrival', () => {
  it('opens the indoor picker exactly once', () => {
    expect(
      shouldOpenIndoorPicker({ arrived: true, hasIndoorMap: true, arrivalPromptShown: false }),
    ).toBe(true);
    expect(
      shouldOpenIndoorPicker({ arrived: true, hasIndoorMap: true, arrivalPromptShown: true }),
    ).toBe(false);
    expect(
      indoorPickerVisible({
        hasIndoorMap: true,
        indoorPickerDismissed: false,
        indoorDestinationPlaceId: null,
        transitionStatus: 'arrived_at_building',
      }),
    ).toBe(true);
    expect(
      indoorPickerVisible({
        hasIndoorMap: true,
        indoorPickerDismissed: true,
        indoorDestinationPlaceId: null,
        transitionStatus: 'none',
      }),
    ).toBe(false);
  });
});

describe('indoor place search scope', () => {
  it('keeps results inside the selected building', () => {
    const scoped = filterPlacesForBuilding([teacher, ecePlace], itBlock.building.id);
    expect(scoped).toEqual([teacher]);
    expect(placeBelongsToBuilding(teacher, itBlock.building.id)).toBe(true);
  });

  it('cannot select a place from another building', () => {
    expect(placeBelongsToBuilding(ecePlace, itBlock.building.id)).toBe(false);
  });

  it('formats nested place hierarchy', () => {
    expect(formatPlaceHierarchy(teacher, [teacher, cabin, room], itBlock.floors)).toBe(
      'Teachers Cabin → Room 308 → Floor 3',
    );
  });
});

describe('QR and indoor session', () => {
  it('accepts a marker from the selected building and rejects another building', () => {
    expect(placeBelongsToBuilding({ buildingId: itBlock.building.id }, itBlock.building.id)).toBe(true);
    expect(placeBelongsToBuilding({ buildingId: ecePlace.buildingId }, itBlock.building.id)).toBe(false);
  });

  it('restores valid building/destination ids from the indoor URL', () => {
    const parsed = parseIndoorParams(
      `?building=${itBlock.building.id}&destination=${teacher.id}&map=${itBlock.indoorMap!.id}`,
    );
    expect(parsed.building).toBe(itBlock.building.id);
    expect(parsed.destination).toBe(teacher.id);
    expect(parseIndoorParams('?building=not-a-uuid&destination=gone').building).toBeNull();
  });

  it('treats a deleted destination as unrestorable', () => {
    expect(placeBelongsToBuilding(null, itBlock.building.id)).toBe(false);
  });

  it('returns to destination confirmation when the user cancels QR scanning', () => {
    expect(cancelIndoorScanStatus()).toBe('waiting_for_anchor');
    expect(
      indoorConfirmVisible({
        indoorDestinationPlaceId: teacher.id,
        transitionStatus: 'waiting_for_anchor',
      }),
    ).toBe(true);
  });

  it('clears indoor navigation state after completion', () => {
    const patch = afterIndoorCompletePatch();
    expect(patch.transitionStatus).toBe('none');
    expect(patch.indoorDestinationPlaceId).toBeNull();
    expect(patch.selectedBuildingId).toBeNull();
  });
});
