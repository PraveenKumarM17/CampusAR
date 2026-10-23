import { MongoClient, type Collection } from 'mongodb';
import { AppError } from '../../domain/errors';
import { env } from '../config/env';
import { query } from '../db/pool';
import { toPinPointDoc, type PinPointDoc, type PinPointRecord } from './pinPointDocument';

export type { PinPointDoc, PinPointRecord } from './pinPointDocument';
export { toPinPointDoc } from './pinPointDocument';

const NODE_COLUMNS = `id, stable_id, site_id, map_version_id, name, latitude, longitude,
  floor_id, building_id, kind, active, updated_at`;

let client: MongoClient | null = null;
let collectionReady: Promise<Collection<PinPointDoc>> | null = null;

export function pinStoreEnabled(): boolean {
  return Boolean(env.mongoUrl) && process.env.VITEST !== 'true';
}

function mapRow(row: Record<string, unknown>): PinPointRecord {
  const updated = row.updated_at;
  return {
    id: String(row.id),
    stableId: (row.stable_id as string | null) ?? null,
    siteId: (row.site_id as string | null) ?? null,
    mapVersionId: (row.map_version_id as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    floorId: (row.floor_id as string | null) ?? null,
    buildingId: (row.building_id as string | null) ?? null,
    kind: String(row.kind),
    active: Boolean(row.active),
    updatedAt: updated instanceof Date ? updated.toISOString() : updated ? String(updated) : null,
  };
}

async function collection(): Promise<Collection<PinPointDoc>> {
  if (!env.mongoUrl) {
    throw new AppError('PIN_STORE_DISABLED', 'MongoDB is not configured', 503);
  }
  if (!collectionReady) {
    const mongo = new MongoClient(env.mongoUrl);
    collectionReady = mongo
      .connect()
      .then(async (connected) => {
        client = connected;
        const col = connected.db(env.mongoDb).collection<PinPointDoc>('pin_points');
        await col.createIndex({ siteId: 1, mapVersionId: 1 });
        await col.createIndex({ location: '2dsphere' });
        return col;
      })
      .catch((err: unknown) => {
        collectionReady = null;
        throw err;
      });
  }
  return collectionReady;
}

async function upsert(record: PinPointRecord, col: Collection<PinPointDoc>) {
  await col.updateOne({ _id: record.id }, { $set: toPinPointDoc(record) }, { upsert: true });
}

export const pinPointRepository = {
  /** Copy one navigation node into the pin_points collection. No-op in tests. */
  async saveNode(id: string): Promise<void> {
    if (!pinStoreEnabled()) return;
    try {
      const { rows } = await query(`SELECT ${NODE_COLUMNS} FROM nodes WHERE id = $1`, [id]);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return;
      await upsert(mapRow(row), await collection());
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('Pin point MongoDB write failed', err);
      throw new AppError('PIN_STORE_UNAVAILABLE', 'Could not store pin point in MongoDB', 503);
    }
  },

  /** Upsert every node so existing pins are present in MongoDB. */
  async syncAll(): Promise<number> {
    if (!pinStoreEnabled()) return 0;
    const { rows } = await query(`SELECT ${NODE_COLUMNS} FROM nodes`);
    if (rows.length === 0) return 0;
    const col = await collection();
    for (const raw of rows) {
      await upsert(mapRow(raw as Record<string, unknown>), col);
    }
    return rows.length;
  },

  async close(): Promise<void> {
    collectionReady = null;
    if (client) {
      await client.close();
      client = null;
    }
  },
};
