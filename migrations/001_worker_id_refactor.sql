-- =============================================================================
-- Migration 001: Point int_operation_assignments.worker_id → stg_workers.id
--                Rebuild vw_gantt_assignments to join stg_workers directly
-- =============================================================================
--
-- BEFORE running this migration:
--   1. Deploy the updated application code (scheduler now uses stg_workers).
--   2. Stop or pause any scheduling jobs so no new assignments are created
--      while the migration runs.
--
-- Run this in the Supabase SQL editor or via psql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 1: Remap existing int_operation_assignments.worker_id values
--
-- Currently:  int_operation_assignments.worker_id → int_workers.id
-- After:      int_operation_assignments.worker_id → stg_workers.id
--
-- The bridge is:  int_workers.worker_id = stg_workers.id
-- -----------------------------------------------------------------------------

UPDATE public.int_operation_assignments AS a
SET    worker_id = iw.worker_id          -- iw.worker_id is stg_workers.id
FROM   public.int_workers AS iw
WHERE  a.worker_id  = iw.id
  AND  a.deleted_at IS NULL;

-- Verify: all live assignments should now have a valid stg_workers.id
-- SELECT COUNT(*) FROM public.int_operation_assignments a
-- LEFT JOIN public.stg_workers sw ON a.worker_id = sw.id
-- WHERE a.deleted_at IS NULL AND sw.id IS NULL;
-- → should return 0


-- -----------------------------------------------------------------------------
-- Step 2: Drop the old FK (if one exists) and add the new one
--
-- Supabase auto-names FKs; adjust the constraint name if yours differs.
-- Run:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.int_operation_assignments'::regclass
--     AND contype = 'f';
-- to find the exact name.
-- -----------------------------------------------------------------------------

ALTER TABLE public.int_operation_assignments
    DROP CONSTRAINT IF EXISTS int_operation_assignments_worker_id_fkey;

ALTER TABLE public.int_operation_assignments
    ADD CONSTRAINT int_operation_assignments_worker_id_fkey
    FOREIGN KEY (worker_id)
    REFERENCES public.stg_workers (id)
    ON DELETE RESTRICT;          -- prevent deleting a worker who has assignments


-- -----------------------------------------------------------------------------
-- Step 3: Rebuild vw_gantt_assignments to join stg_workers directly
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.vw_gantt_assignments;

CREATE VIEW public.vw_gantt_assignments AS
SELECT
    a.id                AS assignment_id,
    a.worker_id,                           -- now stg_workers.id
    sw.name             AS worker_name,
    a.order_id,
    o.order_number,
    a.baler_type_id,
    bt.name             AS baler_name,
    a.stage,
    a.stage_order,
    a.schedule_start,
    a.schedule_end,
    a.scheduled_hours,
    a.status
FROM   public.int_operation_assignments a
JOIN   public.stg_workers               sw ON sw.id  = a.worker_id
LEFT JOIN public.stg_orders             o  ON o.id   = a.order_id
                                           AND o.deleted_at IS NULL
JOIN   public.stg_baler_types           bt ON bt.id  = a.baler_type_id
WHERE  a.deleted_at IS NULL
ORDER  BY a.schedule_start;

-- Grant the same privileges your anon / service-role keys need:
-- GRANT SELECT ON public.vw_gantt_assignments TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Step 4 (optional): add a comment to document the intent
-- -----------------------------------------------------------------------------

COMMENT ON COLUMN public.int_operation_assignments.worker_id IS
    'References stg_workers.id (source-of-truth worker). '
    'Prior to migration 001 this referenced int_workers.id.';
