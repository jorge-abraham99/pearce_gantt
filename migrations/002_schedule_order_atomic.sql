-- =============================================================================
-- Migration 002: Atomic schedule-order persistence + worker overlap guard
-- =============================================================================
--
-- Purpose:
--   1. Persist order + assignments atomically in a single RPC.
--   2. Reject overlapping live assignments for the same worker at the DB layer.
--
-- Notes:
--   - The exclusion constraint uses [start, end) semantics so back-to-back
--     assignments are allowed, but any true overlap is rejected.
--   - The scheduler now sends local wall-clock timestamps like
--     2026-06-08T08:00:00 instead of UTC-shifted ISO strings.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 0: clear current demo assignment rows so the overlap constraint can be
-- added cleanly. This intentionally preserves workers, baler types, customers,
-- and other master data.
TRUNCATE TABLE public.int_operation_assignments RESTART IDENTITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_assignment_times'
      AND conrelid = 'public.int_operation_assignments'::regclass
  ) THEN
    ALTER TABLE public.int_operation_assignments
      ADD CONSTRAINT chk_assignment_times
      CHECK (schedule_end > schedule_start AND scheduled_hours >= 0);
  END IF;
END $$;

DO $$
DECLARE
  v_schedule_start_type text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'int_operation_assignments_no_worker_overlap'
      AND conrelid = 'public.int_operation_assignments'::regclass
  ) THEN
    RETURN;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_schedule_start_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.int_operation_assignments'::regclass
    AND a.attname = 'schedule_start'
    AND NOT a.attisdropped;

  IF v_schedule_start_type = 'timestamp with time zone' THEN
    EXECUTE $sql$
      ALTER TABLE public.int_operation_assignments
        ADD CONSTRAINT int_operation_assignments_no_worker_overlap
        EXCLUDE USING gist (
          worker_id WITH =,
          tstzrange(schedule_start, schedule_end, '[)') WITH &&
        )
        WHERE (deleted_at IS NULL)
    $sql$;
  ELSE
    EXECUTE $sql$
      ALTER TABLE public.int_operation_assignments
        ADD CONSTRAINT int_operation_assignments_no_worker_overlap
        EXCLUDE USING gist (
          worker_id WITH =,
          tsrange(schedule_start, schedule_end, '[)') WITH &&
        )
        WHERE (deleted_at IS NULL)
    $sql$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_order_atomic(
  p_baler_type_id BIGINT,
  p_baler_name TEXT,
  p_customer TEXT,
  p_assignments JSONB
)
RETURNS TABLE (
  order_id BIGINT,
  order_number TEXT,
  assignments_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id BIGINT;
  v_order_number TEXT;
  v_count INT;
BEGIN
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'p_assignments must be a JSON array';
  END IF;

  INSERT INTO public.stg_orders (
    order_number,
    customer,
    baler_type,
    baler_type_id,
    status
  )
  VALUES (
    'TMP-' || gen_random_uuid()::text,
    NULLIF(BTRIM(p_customer), ''),
    p_baler_name,
    p_baler_type_id,
    'scheduled'
  )
  RETURNING id INTO v_order_id;

  v_order_number := 'O' || LPAD(v_order_id::TEXT, 8, '0');

  UPDATE public.stg_orders
  SET order_number = v_order_number
  WHERE id = v_order_id;

  INSERT INTO public.int_operation_assignments (
    worker_id,
    order_id,
    baler_name,
    baler_type_id,
    stage,
    stage_order,
    schedule_start,
    schedule_end,
    scheduled_hours,
    status
  )
  SELECT
    (a->>'worker_id')::BIGINT,
    v_order_id,
    p_baler_name,
    p_baler_type_id,
    a->>'stage',
    (a->>'stage_order')::INT,
    (a->>'schedule_start')::TIMESTAMP,
    (a->>'schedule_end')::TIMESTAMP,
    (a->>'scheduled_hours')::NUMERIC,
    COALESCE(a->>'status', 'scheduled')
  FROM jsonb_array_elements(p_assignments) a;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY
  SELECT v_order_id, v_order_number, v_count;
END;
$$;
