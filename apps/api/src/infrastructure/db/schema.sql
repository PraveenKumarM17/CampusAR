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

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN (
    'university', 'hospital', 'corporate', 'factory', 'government', 'other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS site_map_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  label TEXT,
  description TEXT,
  based_on_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  UNIQUE (site_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS site_map_versions_one_published_idx
  ON site_map_versions (site_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS site_map_versions_one_draft_idx
  ON site_map_versions (site_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS site_map_versions_site_idx ON site_map_versions (site_id);
CREATE INDEX IF NOT EXISTS site_map_versions_status_idx ON site_map_versions (site_id, status);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS published_map_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS organization_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'site_admin', 'member')),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  floors_count INT NOT NULL DEFAULT 1,
  floor_height_m DOUBLE PRECISION NOT NULL DEFAULT 3.5,
  footprint_geom GEOGRAPHY(POLYGON, 4326),
  geometry_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  level INT NOT NULL,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, level)
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('outdoor', 'indoor', 'entrance', 'elevator', 'stairs', 'ramp', 'exit')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  geometry_hash TEXT,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'classroom', 'lab', 'office', 'library', 'cafeteria', 'restroom', 'auditorium',
    'ward', 'meeting_room', 'storage', 'other'
  )),
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  wheelchair_accessible BOOLEAN NOT NULL DEFAULT TRUE,
  local_geometry JSONB,
  measured_length_m DOUBLE PRECISION,
  measured_width_m DOUBLE PRECISION,
  measured_height_m DOUBLE PRECISION,
  measurement_source TEXT CHECK (measurement_source IN ('camera_ar', 'floor_plan', 'manual')),
  measured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, code)
);

CREATE TABLE IF NOT EXISTS floor_corridors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT,
  category TEXT NOT NULL DEFAULT 'corridor',
  local_geometry JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_pois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  local_x DOUBLE PRECISION NOT NULL,
  local_y DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS floor_corridors_floor_idx ON floor_corridors (floor_id);
CREATE INDEX IF NOT EXISTS floor_pois_floor_idx ON floor_pois (floor_id);

CREATE TABLE IF NOT EXISTS edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m > 0),
  kind TEXT NOT NULL CHECK (kind IN ('walkway', 'stairs', 'elevator', 'ramp', 'corridor')),
  bidirectional BOOLEAN NOT NULL DEFAULT TRUE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  safety_score DOUBLE PRECISION NOT NULL DEFAULT 0.9 CHECK (safety_score BETWEEN 0 AND 1),
  crowd_score DOUBLE PRECISION NOT NULL DEFAULT 0.2 CHECK (crowd_score BETWEEN 0 AND 1),
  accessibility_score DOUBLE PRECISION NOT NULL DEFAULT 0.9 CHECK (accessibility_score BETWEEN 0 AND 1),
  geometry_hash TEXT
);

CREATE INDEX IF NOT EXISTS edges_from_idx ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges(to_node_id);

CREATE TABLE IF NOT EXISTS danger_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('unsafe', 'poor_lighting', 'construction', 'fire')),
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

CREATE TABLE IF NOT EXISTS sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_key TEXT NOT NULL,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('temperature', 'humidity', 'aqi', 'occupancy')),
  value DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sensor_readings_zone_idx ON sensor_readings (zone_key, recorded_at DESC);
CREATE INDEX IF NOT EXISTS sensor_readings_kind_idx ON sensor_readings (kind);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
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
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('security', 'medical', 'sos')),
  phone TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emergency_exits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS nodes_active_named_idx ON nodes (active) WHERE name IS NOT NULL AND trim(name) <> '';
CREATE INDEX IF NOT EXISTS nodes_site_idx ON nodes (site_id);
CREATE INDEX IF NOT EXISTS buildings_site_idx ON buildings (site_id);
CREATE INDEX IF NOT EXISTS buildings_footprint_geom_idx ON buildings USING GIST (footprint_geom)
  WHERE footprint_geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS edges_site_idx ON edges (site_id);
CREATE INDEX IF NOT EXISTS danger_zones_geom_idx ON danger_zones USING GIST (geom);
CREATE UNIQUE INDEX IF NOT EXISTS buildings_version_code_idx ON buildings (map_version_id, code);
CREATE INDEX IF NOT EXISTS buildings_site_version_idx ON buildings (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS nodes_site_version_idx ON nodes (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS edges_site_version_idx ON edges (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS floors_building_version_idx ON floors (building_id, map_version_id);

CREATE TABLE IF NOT EXISTS site_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('parking', 'open_area', 'restricted', 'assembly')),
  footprint_geom GEOGRAPHY(POLYGON, 4326) NOT NULL,
  geometry_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE edges ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE site_areas ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS site_areas_site_idx ON site_areas (site_id);
CREATE INDEX IF NOT EXISTS site_areas_site_version_idx ON site_areas (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS site_areas_geom_idx ON site_areas USING GIST (footprint_geom);
CREATE INDEX IF NOT EXISTS buildings_stable_id_idx ON buildings (stable_id);
CREATE INDEX IF NOT EXISTS nodes_stable_id_idx ON nodes (stable_id);
CREATE INDEX IF NOT EXISTS edges_stable_id_idx ON edges (stable_id);
CREATE INDEX IF NOT EXISTS site_areas_stable_id_idx ON site_areas (stable_id);
CREATE INDEX IF NOT EXISTS analytics_searches_query_idx ON analytics_searches (query);
CREATE INDEX IF NOT EXISTS analytics_nav_created_idx ON analytics_navigations (created_at);

CREATE TABLE IF NOT EXISTS map_version_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  published_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  previous_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  published_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff_summary JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS map_version_publish_log_site_idx
  ON map_version_publish_log (site_id, published_at DESC);
CREATE INDEX IF NOT EXISTS map_version_publish_log_version_idx
  ON map_version_publish_log (published_version_id);

-- Indoor AR graphs use a local meter frame relative to a QR/floor origin.
-- They are NOT interchangeable with outdoor WGS84 nodes.
CREATE TABLE IF NOT EXISTS indoor_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  origin_anchor_id UUID,
  tracking_quality TEXT,
  plane_count INT NOT NULL DEFAULT 0,
  confidence DOUBLE PRECISION,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS indoor_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES indoor_maps(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  anchor_id UUID,
  local_x DOUBLE PRECISION NOT NULL,
  local_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  local_z DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'entrance', 'corridor', 'junction', 'turn', 'room_entrance', 'destination',
    'stairs', 'elevator', 'ramp', 'emergency_exit', 'qr_anchor', 'landmark'
  )),
  name TEXT,
  category TEXT,
  accuracy_m DOUBLE PRECISION,
  tracking_quality TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS indoor_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES indoor_maps(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  from_floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  to_floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES indoor_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES indoor_nodes(id) ON DELETE CASCADE,
  distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m > 0),
  kind TEXT NOT NULL CHECK (kind IN ('walk', 'stairs', 'elevator', 'ramp', 'escalator')),
  bidirectional BOOLEAN NOT NULL DEFAULT TRUE,
  wheelchair_accessible BOOLEAN NOT NULL DEFAULT TRUE,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS indoor_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES indoor_maps(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
  node_id UUID REFERENCES indoor_nodes(id) ON DELETE SET NULL,
  parent_place_id UUID REFERENCES indoor_places(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'building', 'floor', 'room', 'cabin', 'person', 'cubicle', 'facility', 'other'
  )),
  searchable BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS indoor_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES indoor_maps(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES indoor_nodes(id) ON DELETE CASCADE,
  anchor_code TEXT NOT NULL,
  physical_marker_type TEXT NOT NULL DEFAULT 'qr',
  local_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  local_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  local_z DOUBLE PRECISION NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS indoor_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  outdoor_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  indoor_node_id UUID NOT NULL REFERENCES indoor_nodes(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES indoor_maps(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL DEFAULT 'Indoor navigation available. Scan the CampusAR marker to continue.',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (outdoor_node_id)
);

CREATE INDEX IF NOT EXISTS indoor_maps_building_idx ON indoor_maps (building_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_maps_building_version_idx ON indoor_maps (building_id, map_version_id);
CREATE INDEX IF NOT EXISTS indoor_nodes_map_idx ON indoor_nodes (map_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_nodes_map_version_idx ON indoor_nodes (map_id, map_version_id);
CREATE INDEX IF NOT EXISTS indoor_nodes_floor_idx ON indoor_nodes (floor_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_edges_map_idx ON indoor_edges (map_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_edges_from_idx ON indoor_edges (from_node_id);
CREATE INDEX IF NOT EXISTS indoor_edges_to_idx ON indoor_edges (to_node_id);
CREATE INDEX IF NOT EXISTS indoor_places_map_idx ON indoor_places (map_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_places_search_idx ON indoor_places (building_id, name) WHERE searchable = TRUE AND active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_anchors_code_idx ON indoor_anchors (anchor_code) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS indoor_anchors_version_code_idx
  ON indoor_anchors (map_version_id, anchor_code)
  WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS indoor_handoffs_outdoor_idx ON indoor_handoffs (outdoor_node_id) WHERE active = TRUE;

-- Allow fire hazard type on existing databases created before the CHECK expansion
DO $$
BEGIN
  ALTER TABLE danger_zones DROP CONSTRAINT IF EXISTS danger_zones_type_check;
  ALTER TABLE danger_zones ADD CONSTRAINT danger_zones_type_check
    CHECK (type IN ('unsafe', 'poor_lighting', 'construction', 'fire'));
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
