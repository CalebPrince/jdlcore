-- Inspector auto-assignment and job approval checks. Safe to re-run.
--
-- Separate tables (not new columns on inspectors/jobs) so nothing that already reads those
-- tables can break if the code is deployed before this is applied. Until it is, the new
-- features simply stay inactive.

-- What each inspector is eligible for, used to pick who a job is auto-assigned to.
-- An inspector is only considered once auto_assign_enabled is switched on for them.
CREATE TABLE IF NOT EXISTS inspector_assignment_profiles (
  inspector_id        integer PRIMARY KEY REFERENCES inspectors(id) ON DELETE CASCADE,
  regions             text[]  NOT NULL DEFAULT '{}',   -- place names matched against the job location; empty = any location
  service_types       text[]  NOT NULL DEFAULT '{}',   -- keys of the services they are qualified for
  max_open_jobs       integer NOT NULL DEFAULT 3,
  unavailable_until   timestamptz,                     -- away until this moment (leave, travel)
  auto_assign_enabled boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One row per submission of a job for approval: what the automatic checks concluded, and
-- what the human then decided. Powers "shadow mode" (compare the two before trusting it).
CREATE TABLE IF NOT EXISTS job_approval_checks (
  id             serial PRIMARY KEY,
  job_id         integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  submitted_at   timestamptz NOT NULL,
  mode           text NOT NULL,                        -- shadow | auto
  verdict        text NOT NULL,                        -- pass | fail
  checks         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,ok,detail}]
  human_decision text,                                 -- approved | rejected | auto_approved
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_approval_checks_job_submitted_idx
  ON job_approval_checks (job_id, submitted_at);

INSERT INTO schema_migrations (name) VALUES ('0005_auto_assignment_and_approval') ON CONFLICT (name) DO NOTHING;
