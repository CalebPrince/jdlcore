-- Adds tank calibration/strapping tables (dip -> volume, and for a floating-roof tank, dip -> roof
-- correction) and the inspector's product outturn records (initial vs. final tank readings, per
-- job). Safe to re-run. Until this is applied the Outturn category on the inspector job page and
-- the tank calibration admin page cannot save anything.

ALTER TABLE tanks ADD COLUMN IF NOT EXISTS has_floating_roof boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS tank_calibration_points (
  id                      serial PRIMARY KEY,
  tank_id                 integer NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  dip_mm                  numeric(10,2) NOT NULL,
  volume_litres           numeric(14,3) NOT NULL,
  roof_correction_litres  numeric(14,3),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tank_calibration_points_tank_dip_idx
  ON tank_calibration_points (tank_id, dip_mm);

CREATE UNIQUE INDEX IF NOT EXISTS tank_calibration_points_tank_dip_unique
  ON tank_calibration_points (tank_id, dip_mm);

CREATE TABLE IF NOT EXISTS job_outturns (
  id                                serial PRIMARY KEY,
  job_id                            integer NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  movement_type                     text NOT NULL,             -- receipt | delivery
  is_crude_oil                      boolean NOT NULL DEFAULT false,
  density_unit                      text NOT NULL DEFAULT 'kg_m3', -- kg_m3 | g_cm3

  initial_tank_id                   integer NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  initial_dip_mm                    numeric(10,2),
  initial_water_dip_mm              numeric(10,2),
  initial_temperature_c             numeric(6,2),
  initial_density_at_20             numeric(8,4),
  initial_vcf                       numeric(8,5),
  initial_tgv_l                     numeric(14,3),
  initial_water_volume_l            numeric(14,3),
  initial_roof_volume_l             numeric(14,3),
  initial_sw_percent                numeric(6,3),
  initial_air_buoyancy_override_mt  numeric(14,3),

  final_tank_id                     integer NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  final_dip_mm                      numeric(10,2),
  final_water_dip_mm                numeric(10,2),
  final_temperature_c               numeric(6,2),
  final_density_at_20               numeric(8,4),
  final_vcf                         numeric(8,5),
  final_tgv_l                       numeric(14,3),
  final_water_volume_l              numeric(14,3),
  final_roof_volume_l               numeric(14,3),
  final_sw_percent                  numeric(6,3),
  final_air_buoyancy_override_mt    numeric(14,3),

  submitted_at                      timestamptz,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_outturns_job_idx ON job_outturns (job_id);

INSERT INTO schema_migrations (name) VALUES ('0008_outturn_and_calibration') ON CONFLICT (name) DO NOTHING;
