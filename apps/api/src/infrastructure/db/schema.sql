-- CampusAR schema (PostgreSQL + PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'guest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  floors_count INT NOT NULL DEFAULT 1,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  level INT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (building_id, level)
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('outdoor', 'indoor', 'entrance', 'elevator', 'stairs', 'ramp', 'exit')),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'classroom', 'lab', 'office', 'library', 'cafeteria', 'restroom', 'auditorium', 'other'
  )),
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  wheelchair_accessible BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (building_id, code)
);

CREATE TABLE IF NOT EXISTS edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m > 0),
  kind TEXT NOT NULL CHECK (kind IN ('walkway', 'stairs', 'elevator', 'ramp', 'corridor')),
  bidirectional BOOLEAN NOT NULL DEFAULT TRUE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  safety_score DOUBLE PRECISION NOT NULL DEFAULT 0.9 CHECK (safety_score BETWEEN 0 AND 1),
  crowd_score DOUBLE PRECISION NOT NULL DEFAULT 0.2 CHECK (crowd_score BETWEEN 0 AND 1),
  accessibility_score DOUBLE PRECISION NOT NULL DEFAULT 0.9 CHECK (accessibility_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS edges_from_idx ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges(to_node_id);

CREATE TABLE IF NOT EXISTS danger_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('unsafe', 'poor_lighting', 'construction')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m DOUBLE PRECISION NOT NULL DEFAULT 25,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS crowd_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id UUID REFERENCES edges(id) ON DELETE CASCADE,
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  intensity DOUBLE PRECISION NOT NULL CHECK (intensity BETWEEN 0 AND 1),
  label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (edge_id IS NOT NULL OR node_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  affects_routing BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS route_weights (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  w_distance DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  w_safety DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  w_crowd DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  w_accessibility DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  w_blocked_penalty DOUBLE PRECISION NOT NULL DEFAULT 1000000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO route_weights (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('road_closed', 'event_alert', 'emergency_alert', 'route_updated')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('security', 'medical', 'sos')),
  phone TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emergency_exits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_navigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  destination_node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  edge_ids UUID[] NOT NULL DEFAULT '{}',
  distance_m DOUBLE PRECISION NOT NULL,
  eta_minutes DOUBLE PRECISION NOT NULL,
  travel_time_minutes DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nodes_geom_idx ON nodes USING GIST (geom);
CREATE INDEX IF NOT EXISTS danger_zones_geom_idx ON danger_zones USING GIST (geom);
CREATE INDEX IF NOT EXISTS analytics_searches_query_idx ON analytics_searches (query);
CREATE INDEX IF NOT EXISTS analytics_nav_created_idx ON analytics_navigations (created_at);
