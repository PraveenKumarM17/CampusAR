import { describe, expect, it } from 'vitest';
import { toPinPointDoc, type PinPointRecord } from './pinPointDocument';

const pin: PinPointRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  stableId: '22222222-2222-2222-2222-222222222222',
  siteId: '33333333-3333-3333-3333-333333333333',
  mapVersionId: '44444444-4444-4444-4444-444444444444',
  name: 'Library',
  latitude: 12.9,
  longitude: 77.5,
  floorId: null,
  buildingId: null,
  kind: 'outdoor',
  active: true,
  updatedAt: '2026-10-08T10:00:00.000Z',
};

describe('toPinPointDoc', () => {
  it('stores coordinates as a GeoJSON point with longitude first', () => {
    const doc = toPinPointDoc(pin);
    expect(doc.name).toBe('Library');
    expect(doc.location).toEqual({ type: 'Point', coordinates: [77.5, 12.9] });
    expect(doc.updatedAt?.toISOString()).toBe('2026-10-08T10:00:00.000Z');
    expect(doc.active).toBe(true);
  });
});
