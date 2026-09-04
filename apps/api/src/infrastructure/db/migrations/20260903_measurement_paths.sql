-- Measurement Paths & Points for Admin Measure & Link Feature
-- Allows admins to capture GPS points and create navigation paths

-- Main measurement paths table
CREATE TABLE IF NOT EXISTS measurement_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  map_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  path_type TEXT NOT NULL DEFAULT 'indoor' CHECK (path_type IN ('indoor', 'outdoor', 'mixed')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS measurement_paths_site_idx ON measurement_paths(site_id);
CREATE INDEX IF NOT EXISTS measurement_paths_floor_idx ON measurement_paths(floor_id);
CREATE INDEX IF NOT EXISTS measurement_paths_version_idx ON measurement_paths(map_version_id);
CREATE INDEX IF NOT EXISTS measurement_paths_status_idx ON measurement_paths(site_id, status);

-- Individual measurement points that make up the path
CREATE TABLE IF NOT EXISTS measurement_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES measurement_paths(id) ON DELETE CASCADE,
  ordinal INT NOT NULL CHECK (ordinal > 0),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  floor_level INT,
  accuracy_m DOUBLE PRECISION,
  label TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  -- PostGIS geometry for spatial operations
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  -- Snapped to indoor graph coordinates (local meters)
  snapped_x DOUBLE PRECISION,
  snapped_y DOUBLE PRECISION,
  snapped_z DOUBLE PRECISION,
  snapped_to_node_id UUID REFERENCES indoor_nodes(id) ON DELETE SET NULL,
  UNIQUE (path_id, ordinal)
);

CREATE INDEX IF NOT EXISTS measurement_points_path_idx ON measurement_points(path_id, ordinal);
CREATE INDEX IF NOT EXISTS measurement_points_geom_idx ON measurement_points USING GIST(geom);
CREATE INDEX IF NOT EXISTS measurement_points_snapped_node_idx ON measurement_points(snapped_to_node_id);

-- Edges between consecutive measurement points
CREATE TABLE IF NOT EXISTS measurement_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES measurement_paths(id) ON DELETE CASCADE,
  from_point_id UUID NOT NULL REFERENCES measurement_points(id) ON DELETE CASCADE,
  to_point_id UUID NOT NULL REFERENCES measurement_points(id) ON DELETE CASCADE,
  ordinal INT NOT NULL CHECK (ordinal > 0),
  length_m DOUBLE PRECISION NOT NULL CHECK (length_m >= 0),
  heading_deg DOUBLE PRECISION CHECK (heading_deg >= 0 AND heading_deg < 360),
  elevation_change_m DOUBLE PRECISION,
  -- Path geometry as LineString
  geom GEOGRAPHY(LINESTRING, 4326),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (path_id, ordinal),
  CHECK (from_point_id <> to_point_id)
);

CREATE INDEX IF NOT EXISTS measurement_edges_path_idx ON measurement_edges(path_id, ordinal);
CREATE INDEX IF NOT EXISTS measurement_edges_from_idx ON measurement_edges(from_point_id);
CREATE INDEX IF NOT EXISTS measurement_edges_to_idx ON measurement_edges(to_point_id);
CREATE INDEX IF NOT EXISTS measurement_edges_geom_idx ON measurement_edges USING GIST(geom);

-- View for easy path retrieval with geometry
CREATE OR REPLACE VIEW measurement_paths_with_geometry AS
SELECT 
  mp.*,
  COUNT(mpt.id) as point_count,
  SUM(me.length_m) as total_length_m,
  ST_MakeLine(
    ARRAY(
      SELECT ST_SetSRID(ST_MakePoint(mpt2.longitude, mpt2.latitude), 4326)::geometry
      FROM measurement_points mpt2
      WHERE mpt2.path_id = mp.id
      ORDER BY mpt2.ordinal
    )
  )::geography as path_geom
FROM measurement_paths mp
LEFT JOIN measurement_points mpt ON mpt.path_id = mp.id
LEFT JOIN measurement_edges me ON me.path_id = mp.id
GROUP BY mp.id;

-- Function to automatically create edges when points are added
CREATE OR REPLACE FUNCTION create_measurement_edges_for_path(p_path_id UUID)
RETURNS void AS $$
DECLARE
  v_point_record RECORD;
  v_prev_point_id UUID;
  v_prev_lat DOUBLE PRECISION;
  v_prev_lon DOUBLE PRECISION;
  v_edge_ordinal INT := 1;
BEGIN
  -- Delete existing edges for this path
  DELETE FROM measurement_edges WHERE path_id = p_path_id;
  
  -- Create edges between consecutive points
  FOR v_point_record IN 
    SELECT id, latitude, longitude, ordinal
    FROM measurement_points
    WHERE path_id = p_path_id
    ORDER BY ordinal
  LOOP
    IF v_prev_point_id IS NOT NULL THEN
      INSERT INTO measurement_edges (
        path_id,
        from_point_id,
        to_point_id,
        ordinal,
        length_m,
        heading_deg,
        geom
      ) VALUES (
        p_path_id,
        v_prev_point_id,
        v_point_record.id,
        v_edge_ordinal,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)::geography
        ),
        DEGREES(ST_Azimuth(
          ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326),
          ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)
        )),
        ST_MakeLine(
          ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326)::geometry,
          ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)::geometry
        )::geography
      );
      v_edge_ordinal := v_edge_ordinal + 1;
    END IF;
    
    v_prev_point_id := v_point_record.id;
    v_prev_lat := v_point_record.latitude;
    v_prev_lon := v_point_record.longitude;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update edges when points change
CREATE OR REPLACE FUNCTION trigger_update_measurement_edges()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM create_measurement_edges_for_path(OLD.path_id);
    RETURN OLD;
  ELSE
    PERFORM create_measurement_edges_for_path(NEW.path_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS measurement_points_update_edges ON measurement_points;
CREATE TRIGGER measurement_points_update_edges
AFTER INSERT OR UPDATE OR DELETE ON measurement_points
FOR EACH ROW EXECUTE FUNCTION trigger_update_measurement_edges();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON measurement_paths TO campusar;
GRANT SELECT, INSERT, UPDATE, DELETE ON measurement_points TO campusar;
GRANT SELECT, INSERT, UPDATE, DELETE ON measurement_edges TO campusar;
GRANT SELECT ON measurement_paths_with_geometry TO campusar;
