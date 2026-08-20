import { describe, expect, it } from 'vitest';
import {
  indoorAnchorBuildingError,
  indoorPlaceBuildingError,
  placeBelongsToBuilding,
  publishedIndoorMapAvailable,
} from './buildingHandoff';

describe('buildingHandoff', () => {
  it('treats unpublished maps as outdoor-only', () => {
    expect(publishedIndoorMapAvailable(null)).toBe(false);
    expect(publishedIndoorMapAvailable({ status: 'draft', active: true })).toBe(false);
    expect(publishedIndoorMapAvailable({ status: 'published', active: false })).toBe(false);
    expect(publishedIndoorMapAvailable({ status: 'published', active: true })).toBe(true);
  });

  it('rejects places from another building', () => {
    expect(placeBelongsToBuilding({ buildingId: 'it-block', active: true }, 'it-block')).toBe(true);
    expect(placeBelongsToBuilding({ buildingId: 'ece-block', active: true }, 'it-block')).toBe(false);
    expect(placeBelongsToBuilding({ buildingId: 'it-block', active: false }, 'it-block')).toBe(false);
  });

  it('names the other building when a QR marker is rejected', () => {
    expect(indoorAnchorBuildingError('IT Block', 'ECE Block')).toBe(
      'This marker belongs to ECE Block. Please scan a marker inside IT Block.',
    );
  });

  it('names the other building when a place is rejected', () => {
    expect(indoorPlaceBuildingError('IT Block', 'Civil Block')).toContain('Civil Block');
  });
});
