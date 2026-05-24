-- =============================================================================
-- Migration 003: Atomic replacement for future schedule recalculation
-- =============================================================================
--
-- Requires:
--   - public.int_operation_assignments overlap guard already in place
--   - public.schedule_recalculation_runs table already created separately
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_future_schedule_atomic(
  p_assignment_ids_to_remove BIGINT[],
  p_cutoff_at TIMESTAMP,
  p_new_assignments JSONB
)
RETURNS TABLE (
  assignments_removed INT,
  assignments_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_removed INT := COALESCE(array_length(p_assignment_ids_to_remove, 1), 0);
  v_removed INT := 0;
  v_created INT := 0;
BEGIN
  IF p_new_assignments IS NULL OR jsonb_typeof(p_new_assignments) <> 'array' THEN
    RAISE EXCEPTION 'p_new_assignments must be a JSON array';
  END IF;

  IF v_expected_removed > 0 THEN
    UPDATE public.int_operation_assignments
    SET deleted_at = now()
    WHERE id = ANY(p_assignment_ids_to_remove)
      AND deleted_at IS NULL
      AND status = 'scheduled'
      AND schedule_start > p_cutoff_at;

    GET DIAGNOSTICS v_removed = ROW_COUNT;

    IF v_removed <> v_expected_removed THEN
      RAISE EXCEPTION 'Future assignment set changed during recalculation'
        USING ERRCODE = 'P0001',
              DETAIL = format(
                'Expected to remove %s rows but removed %s.',
                v_expected_removed,
                v_removed
              );
    END IF;
  END IF;

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
    (a->>'order_id')::BIGINT,
    a->>'baler_name',
    (a->>'baler_type_id')::BIGINT,
    a->>'stage',
    (a->>'stage_order')::INT,
    (a->>'schedule_start')::TIMESTAMP,
    (a->>'schedule_end')::TIMESTAMP,
    (a->>'scheduled_hours')::NUMERIC,
    COALESCE(a->>'status', 'scheduled')
  FROM jsonb_array_elements(p_new_assignments) a;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN QUERY
  SELECT v_removed, v_created;
END;
$$;
