-- Migration: Resolve rows stuck at `status='pending_content'` due to #706.
--
-- Background: two evaluation paths in the discovery feed worker and the
-- discovery coordinator wrote `status='pending_content'` when they should
-- have written `status='rejected'`:
--
--   1. Metadata rejection: worker/coordinator called `markMetadataEvaluated`
--      (which sets status='pending_content') then returned early without a
--      reject() call when the URL failed metadata evaluation.
--
--   2. Content rejection: `markContentEvaluated` wrote 'pending_content'
--      (not 'rejected') when combined confidence was below threshold.
--
-- Since 'pending_content' is in REPROCESSABLE_STATUSES, admin "Re-queue
-- Stuck" actions looped these rows through the same failing evaluation
-- forever. Staging accumulated 723+ stuck rows; production is unaffected
-- only if it has not run enough discovery cycles to trigger the bug.
--
-- This migration flips two cohorts of stuck rows to 'rejected':
--
--   Cohort A: metadata-stage rejections
--     - status = 'pending_content'
--     - metadata_confidence IS NOT NULL
--     - content_confidence IS NULL  (content eval never ran)
--     - updated_at older than 1 hour (not currently in-flight)
--
--   Cohort B: content-stage rejections
--     - status = 'pending_content'
--     - content_confidence IS NOT NULL  (content eval did run)
--     - combined_confidence IS NOT NULL
--     - updated_at older than 1 hour

BEGIN;

-- Cohort A: rejected at metadata stage
UPDATE discovered_sources
SET
  status = 'rejected',
  reviewed_at = NOW(),
  reviewed_by = 'auto-backfill-706',
  rejection_reason = COALESCE(
    'Backfill (#706): metadata-stage rejection — ' || metadata_reasoning,
    'Backfill (#706): metadata confidence ' || COALESCE(metadata_confidence::text, 'null') || ' below 0.5'
  ),
  updated_at = NOW()
WHERE status = 'pending_content'
  AND metadata_confidence IS NOT NULL
  AND content_confidence IS NULL
  AND updated_at < NOW() - INTERVAL '1 hour';

-- Cohort B: rejected at content stage
UPDATE discovered_sources
SET
  status = 'rejected',
  reviewed_at = NOW(),
  reviewed_by = 'auto-backfill-706',
  rejection_reason = 'Backfill (#706): combined confidence ' ||
                     COALESCE(combined_confidence::text, 'null') ||
                     ' below auto-approval threshold',
  updated_at = NOW()
WHERE status = 'pending_content'
  AND content_confidence IS NOT NULL
  AND combined_confidence IS NOT NULL
  AND updated_at < NOW() - INTERVAL '1 hour';

COMMIT;
