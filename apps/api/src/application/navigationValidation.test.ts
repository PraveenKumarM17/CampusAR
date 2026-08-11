import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphNode } from '@campusar/shared';
import {
  isNamedPlace,
  resolveShareEndpoints,
  validateRouteEndpoints,
} from './navigationValidation';

vi.mock('../infrastructure/repositories/campusRepository', () => ({
  campusRepository: {
    getNodeById: vi.fn(),
  },
}));

import { campusRepository } from '../infrastructure/repositories/campusRepository';

const getNodeById = vi.mocked(campusRepository.getNodeById);

function place(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'a1000001-0000-0000-0000-000000000001',
    name: 'Main Gate',
    latitude: 12.9,
    longitude: 77.51,
    floorId: null,
    buildingId: null,
    kind: 'outdoor',
    active: true,
    ...overrides,
  };
}

describe('navigationValidation', () => {
  beforeEach(() => {
    getNodeById.mockReset();
  });

  it('isNamedPlace rejects blank names', () => {
    expect(isNamedPlace({ name: '  ' })).toBe(false);
    expect(isNamedPlace({ name: 'Library' })).toBe(true);
  });

  it('validateRouteEndpoints accepts two active named places', async () => {
    getNodeById.mockImplementation(async (id) => {
      if (id === 'a1000001-0000-0000-0000-000000000001') return place();
      if (id === 'a1000001-0000-0000-0000-000000000014') {
        return place({
          id: 'a1000001-0000-0000-0000-000000000014',
          name: 'Cyber Block Entrance',
        });
      }
      return null;
    });

    const result = await validateRouteEndpoints(
      'a1000001-0000-0000-0000-000000000001',
      'a1000001-0000-0000-0000-000000000014',
    );
    expect(result.source.name).toBe('Main Gate');
    expect(result.destination.name).toBe('Cyber Block Entrance');
  });

  it('validateRouteEndpoints rejects same source and destination', async () => {
    await expect(
      validateRouteEndpoints(
        'a1000001-0000-0000-0000-000000000001',
        'a1000001-0000-0000-0000-000000000001',
      ),
    ).rejects.toMatchObject({ code: 'SAME_NODE', status: 400 });
  });

  it('validateRouteEndpoints rejects missing source', async () => {
    getNodeById.mockResolvedValue(null);
    await expect(
      validateRouteEndpoints(
        '00000000-0000-0000-0000-000000000099',
        'a1000001-0000-0000-0000-000000000014',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_NODE', status: 422, details: { reason: 'not_found' } });
  });

  it('validateRouteEndpoints rejects inactive place', async () => {
    getNodeById.mockResolvedValue(place({ active: false }));
    await expect(
      validateRouteEndpoints(
        'a1000001-0000-0000-0000-000000000001',
        'a1000001-0000-0000-0000-000000000014',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_NODE', status: 422, details: { reason: 'inactive' } });
  });

  it('validateRouteEndpoints rejects unnamed admin node', async () => {
    getNodeById.mockResolvedValue(place({ name: null }));
    await expect(
      validateRouteEndpoints(
        'a1000001-0000-0000-0000-000000000001',
        'a1000001-0000-0000-0000-000000000014',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_NODE', status: 422, details: { reason: 'unnamed' } });
  });

  it('resolveShareEndpoints reports invalid share link fields', async () => {
    getNodeById.mockImplementation(async (id) => {
      if (id === 'a1000001-0000-0000-0000-000000000001') return place();
      return null;
    });

    const result = await resolveShareEndpoints(
      'a1000001-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000099',
    );
    expect(result.valid).toBe(false);
    expect(result.source?.name).toBe('Main Gate');
    expect(result.destination).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('to');
  });
});
