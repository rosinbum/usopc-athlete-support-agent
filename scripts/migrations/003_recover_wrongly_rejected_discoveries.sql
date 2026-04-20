-- Migration: Recover discoveries wrongly rejected by the v0.6.3
-- "Re-queue Stuck" admin action.
--
-- Background (#701): the worker's duplicate-row detection still used the
-- DynamoDB-era substring match `msg.includes("Conditional")`, which never
-- matched PG's `duplicate key value violates unique constraint` error. So
-- when the admin re-queued stuck rows, the worker rethrew the unique-
-- violation, recorded it as an extraction error, and after 3 attempts
-- marked the row `status='rejected'` with the duplicate-key text in
-- `rejection_reason`.
--
-- This migration flips those rows back to `pending_metadata` so they get
-- re-evaluated by the now-fixed worker. It is a no-op in any environment
-- where the v0.6.3 reprocess action was never run (production was not
-- promoted to v0.6.3 before the fix landed).

BEGIN;

UPDATE discovered_sources
SET
  status = 'pending_metadata',
  error_count = 0,
  last_error = NULL,
  rejection_reason = NULL,
  updated_at = NOW()
WHERE status = 'rejected'
  AND rejection_reason LIKE '%duplicate key value violates unique constraint%';

COMMIT;
