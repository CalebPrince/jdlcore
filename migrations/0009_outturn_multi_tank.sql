-- Splits job_outturns into a job-level header (movement type, crude flag, density unit, notes -- one
-- per job) plus a new job_outturn_tanks table (one row per tank in that job's outturn), so a single
-- outturn can span several tanks, matching the client's report layout. Safe to re-run. No production
-- data loss risk: job_outturns has had no real rows yet (the feature shipped in 0008 minutes earlier).

ALTER TABLE job_outturns DROP CONSTRAINT IF EXISTS job_outturns_initial_tank_id_fkey;
ALTER TABLE job_outturns DROP CONSTRAINT IF EXISTS job_outturns_final_tank_id_fkey;

ALTER TABLE job_outturns
  DROP COLUMN IF EXISTS initial_tank_id,
  DROP COLUMN IF EXISTS initial_dip_mm,
  DROP COLUMN IF EXISTS initial_water_dip_mm,
  DROP COLUMN IF EXISTS initial_temperature_c,
  DROP COLUMN IF EXISTS initial_density_at_20,
  DROP COLUMN IF EXISTS initial_vcf,
  DROP COLUMN IF EXISTS initial_tgv_l,
  DROP COLUMN IF EXISTS initial_water_volume_l,
  DROP COLUMN IF EXISTS initial_roof_volume_l,
  DROP COLUMN IF EXISTS initial_sw_percent,
  DROP COLUMN IF EXISTS initial_air_buoyancy_override_mt,
  DROP COLUMN IF EXISTS final_tank_id,
  DROP COLUMN IF EXISTS final_dip_mm,
  DROP COLUMN IF EXISTS final_water_dip_mm,
  DROP COLUMN IF EXISTS final_temperature_c,
  DROP COLUMN IF EXISTS final_density_at_20,
  DROP COLUMN IF EXISTS final_vcf,
  DROP COLUMN IF EXISTS final_tgv_l,
  DROP COLUMN IF EXISTS final_water_volume_l,
  DROP COLUMN IF EXISTS final_roof_volume_l,
  DROP COLUMN IF EXISTS final_sw_percent,
  DROP COLUMN IF EXISTS final_air_buoyancy_override_mt;

ALTER TABLE job_outturns ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS job_outturn_tanks (
  id                                serial PRIMARY KEY,
  job_outturn_id                    integer NOT NULL REFERENCES job_outturns(id) ON DELETE CASCADE,

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

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_outturn_tanks_outturn_idx ON job_outturn_tanks (job_outturn_id);

INSERT INTO schema_migrations (name) VALUES ('0009_outturn_multi_tank') ON CONFLICT (name) DO NOTHING;
