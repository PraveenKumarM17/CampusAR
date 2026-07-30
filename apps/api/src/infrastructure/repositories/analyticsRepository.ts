import type { AnalyticsSummary, AppNotification, NotificationType } from '@campusar/shared';
import { query } from '../db/pool';

export const analyticsRepository = {
  async recordSearch(userId: string | null, queryText: string, resultCount: number) {
    await query(`INSERT INTO analytics_searches (user_id, query, result_count) VALUES ($1,$2,$3)`, [
      userId,
      queryText,
      resultCount,
    ]);
  },

  async recordNavigation(input: {
    userId: string | null;
    sourceNodeId: string;
    destinationNodeId: string;
    edgeIds: string[];
    distanceM: number;
    etaMinutes: number;
  }) {
    await query(
      `INSERT INTO analytics_navigations
        (user_id, source_node_id, destination_node_id, edge_ids, distance_m, eta_minutes, travel_time_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [
        input.userId,
        input.sourceNodeId,
        input.destinationNodeId,
        input.edgeIds,
        input.distanceM,
        input.etaMinutes,
      ],
    );
  },

  async summary(): Promise<AnalyticsSummary> {
    const navCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM analytics_navigations`,
    );
    const uniqueSearchers = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT COALESCE(user_id::text, 'anon'))::text AS count FROM analytics_searches`,
    );
    const avgTravel = await query<{ avg: string | null }>(
      `SELECT AVG(travel_time_minutes)::text AS avg FROM analytics_navigations WHERE travel_time_minutes IS NOT NULL`,
    );
    const topSearches = await query<{ query: string; count: string }>(
      `SELECT query, COUNT(*)::text AS count FROM analytics_searches
       GROUP BY query ORDER BY COUNT(*) DESC LIMIT 10`,
    );
    const popularRoutes = await query<{
      source_name: string;
      destination_name: string;
      count: string;
      edge_ids: string[];
    }>(
      `SELECT
         COALESCE(sn.name, sn.id::text) AS source_name,
         COALESCE(dn.name, dn.id::text) AS destination_name,
         COUNT(*)::text AS count,
         (ARRAY_AGG(an.edge_ids))[1] AS edge_ids
       FROM analytics_navigations an
       LEFT JOIN nodes sn ON sn.id = an.source_node_id
       LEFT JOIN nodes dn ON dn.id = an.destination_node_id
       GROUP BY sn.name, sn.id, dn.name, dn.id
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
    );
    const edgeHeat = await query<{ edge_id: string; count: string }>(
      `SELECT unnest(edge_ids)::text AS edge_id, COUNT(*)::text AS count
       FROM analytics_navigations
       GROUP BY 1
       ORDER BY COUNT(*) DESC
       LIMIT 50`,
    );

    return {
      navigationCount: Number(navCount.rows[0]?.count ?? 0),
      uniqueSearchers: Number(uniqueSearchers.rows[0]?.count ?? 0),
      averageTravelTimeMinutes: Number(avgTravel.rows[0]?.avg ?? 0),
      topSearches: topSearches.rows.map((r) => ({
        query: r.query,
        count: Number(r.count),
      })),
      popularRoutes: popularRoutes.rows.map((r) => ({
        sourceName: r.source_name,
        destinationName: r.destination_name,
        count: Number(r.count),
        edgeIds: r.edge_ids ?? [],
      })),
      edgeHeat: edgeHeat.rows.map((r) => ({
        edgeId: r.edge_id,
        count: Number(r.count),
      })),
    };
  },
};

export const notificationRepository = {
  async list(userId: string | null): Promise<AppNotification[]> {
    const { rows } = await query(
      `SELECT n.*,
         CASE WHEN $1::uuid IS NULL THEN FALSE
              ELSE EXISTS (
                SELECT 1 FROM notification_reads nr
                WHERE nr.notification_id = n.id AND nr.user_id = $1::uuid
              )
         END AS read
       FROM notifications n
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      type: r.type as NotificationType,
      title: r.title as string,
      body: r.body as string,
      createdAt: (r.created_at as Date).toISOString(),
      read: Boolean(r.read),
    }));
  },

  async create(input: { type: NotificationType; title: string; body: string }) {
    const { rows } = await query(
      `INSERT INTO notifications (type, title, body) VALUES ($1,$2,$3) RETURNING *`,
      [input.type, input.title, input.body],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      type: r.type as NotificationType,
      title: r.title as string,
      body: r.body as string,
      createdAt: (r.created_at as Date).toISOString(),
      read: false,
    };
  },

  async markRead(userId: string, notificationId: string) {
    await query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [notificationId, userId],
    );
  },
};

export const safetyRepository = {
  async recordSos(input: {
    userId: string | null;
    latitude: number;
    longitude: number;
    message?: string;
  }) {
    const { rows } = await query(
      `INSERT INTO sos_events (user_id, latitude, longitude, message)
       VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [input.userId, input.latitude, input.longitude, input.message ?? null],
    );
    return rows[0] as { id: string; created_at: Date };
  },
};
