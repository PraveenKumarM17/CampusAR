-- Persist metric room dimensions captured by the indoor WebXR/floor-plan measurer.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS measured_length_m DOUBLE PRECISION;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS measured_width_m DOUBLE PRECISION;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS measured_height_m DOUBLE PRECISION;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS measurement_source TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_measurement_source_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_measurement_source_check CHECK (
  measurement_source IS NULL OR measurement_source IN ('camera_ar', 'floor_plan', 'manual')
);

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_measurement_dimensions_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_measurement_dimensions_check CHECK (
  (measured_length_m IS NULL OR measured_length_m > 0) AND
  (measured_width_m IS NULL OR measured_width_m > 0) AND
  (measured_height_m IS NULL OR measured_height_m > 0)
);
