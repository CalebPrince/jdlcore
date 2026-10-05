-- Removes the data created on 5 Oct 2026 while testing that day's updates on the live site:
-- test job JDL-2026-0014 (with its timeline, chat, document, invoice INV-2026-0010, certificate
-- COQ-2026-0005, stock reading, outturn and notifications, all of which cascade from the job),
-- the staff notifications that pointed at it, and the tank "TEST TK-1" created for it.
-- Each delete is pinned to the test markers as well as the id, so it cannot touch anything else.
-- Safe to re-run.

DELETE FROM notifications
WHERE job_id IS NULL
  AND link LIKE '/admin/jobs/14%'
  AND EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = 14 AND j.ref = 'JDL-2026-0014' AND j.notes LIKE 'TEST REQUEST.%'
  );

DELETE FROM jobs
WHERE id = 14 AND ref = 'JDL-2026-0014' AND notes LIKE 'TEST REQUEST.%';

DELETE FROM tanks t
WHERE t.name = 'TEST TK-1'
  AND NOT EXISTS (SELECT 1 FROM stock_readings s WHERE s.tank_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM job_outturn_tanks o WHERE o.initial_tank_id = t.id OR o.final_tank_id = t.id);

INSERT INTO schema_migrations (name) VALUES ('0016_remove_test_job_0014') ON CONFLICT (name) DO NOTHING;
