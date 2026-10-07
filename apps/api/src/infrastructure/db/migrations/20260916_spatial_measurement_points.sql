-- Store AR measurement points in session world space. GPS remains optional metadata.
ALTER TABLE measurement_points
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE measurement_points
  ADD COLUMN IF NOT EXISTS world_x_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS world_y_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS world_z_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS world_transform JSONB,
  ADD COLUMN IF NOT EXISTS raycast_target JSONB,
  ADD COLUMN IF NOT EXISTS tracking_state TEXT,
  ADD COLUMN IF NOT EXISTS feature_density DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS depth_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS estimated_accuracy_mm DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS revisit_count INT NOT NULL DEFAULT 0;

ALTER TABLE measurement_points
  DROP CONSTRAINT IF EXISTS measurement_points_position_check;

ALTER TABLE measurement_points
  ADD CONSTRAINT measurement_points_position_check CHECK (
    (world_x_mm IS NOT NULL AND world_y_mm IS NOT NULL AND world_z_mm IS NOT NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  );

ALTER TABLE measurement_points
  DROP CONSTRAINT IF EXISTS measurement_points_tracking_state_check;

ALTER TABLE measurement_points
  ADD CONSTRAINT measurement_points_tracking_state_check CHECK (
    tracking_state IS NULL OR tracking_state IN ('notAvailable', 'limited', 'normal')
  );

-- Spatial-only points have no GPS geometry. Use their world-space distance for edges.
CREATE OR REPLACE FUNCTION create_measurement_edges_for_path(p_path_id UUID)
RETURNS void AS $$
DECLARE
  v_point_record RECORD;
  v_prev_point_id UUID;
  v_prev_lat DOUBLE PRECISION;
  v_prev_lon DOUBLE PRECISION;
  v_prev_x DOUBLE PRECISION;
  v_prev_y DOUBLE PRECISION;
  v_prev_z DOUBLE PRECISION;
  v_edge_ordinal INT := 1;
  v_length_m DOUBLE PRECISION;
BEGIN
  DELETE FROM measurement_edges WHERE path_id = p_path_id;

  FOR v_point_record IN
    SELECT id, latitude, longitude, world_x_mm, world_y_mm, world_z_mm, ordinal
    FROM measurement_points
    WHERE path_id = p_path_id
    ORDER BY ordinal
  LOOP
    IF v_prev_point_id IS NOT NULL THEN
      IF v_prev_x IS NOT NULL AND v_point_record.world_x_mm IS NOT NULL THEN
        v_length_m := sqrt(
          power(v_point_record.world_x_mm - v_prev_x, 2) +
          power(v_point_record.world_y_mm - v_prev_y, 2) +
          power(v_point_record.world_z_mm - v_prev_z, 2)
        ) / 1000.0;
      ELSE
        v_length_m := ST_Distance(
          ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)::geography
        );
      END IF;

      INSERT INTO measurement_edges (
        path_id, from_point_id, to_point_id, ordinal, length_m, heading_deg,
        elevation_change_m, geom
      ) VALUES (
        p_path_id,
        v_prev_point_id,
        v_point_record.id,
        v_edge_ordinal,
        v_length_m,
        CASE WHEN v_prev_lat IS NOT NULL AND v_point_record.latitude IS NOT NULL THEN
          DEGREES(ST_Azimuth(
            ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326),
            ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)
          ))
        ELSE NULL END,
        CASE WHEN v_prev_y IS NOT NULL AND v_point_record.world_y_mm IS NOT NULL
          THEN (v_point_record.world_y_mm - v_prev_y) / 1000.0
          ELSE NULL END,
        CASE WHEN v_prev_lat IS NOT NULL AND v_point_record.latitude IS NOT NULL THEN
          ST_MakeLine(
            ST_SetSRID(ST_MakePoint(v_prev_lon, v_prev_lat), 4326)::geometry,
            ST_SetSRID(ST_MakePoint(v_point_record.longitude, v_point_record.latitude), 4326)::geometry
          )::geography
        ELSE NULL END
      );
      v_edge_ordinal := v_edge_ordinal + 1;
    END IF;

    v_prev_point_id := v_point_record.id;
    v_prev_lat := v_point_record.latitude;
    v_prev_lon := v_point_record.longitude;
    v_prev_x := v_point_record.world_x_mm;
    v_prev_y := v_point_record.world_y_mm;
    v_prev_z := v_point_record.world_z_mm;
  END LOOP;
END;
$$ LANGUAGE plpgsql;