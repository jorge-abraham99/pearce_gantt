-- =============================================================================
-- Migration 005: Move spraying before assembling in stage order
-- =============================================================================
--
-- Purpose:
--   1. Make stage ordering:
--        welding   -> 1
--        spraying  -> 2
--        assembling -> 3
--   2. Update existing baler requirements and persisted assignments.
--   3. Ensure baler admin create/update RPCs keep saving the new order.
-- =============================================================================

create or replace function public.baler_stage_sequence_for_name(p_stage_name text)
returns integer
language plpgsql
immutable
as $function$
declare
  v_stage_name text;
begin
  v_stage_name := public.normalize_baler_stage_name(p_stage_name);

  case v_stage_name
    when 'welding' then return 1;
    when 'spraying' then return 2;
    when 'assembling' then return 3;
    else
      raise exception 'Unsupported normalized baler stage_name: %', v_stage_name;
  end case;
end;
$function$;

create or replace function public.admin_create_baler_type_with_requirements(
  p_name text,
  p_welding_hours numeric,
  p_assembling_hours numeric,
  p_spraying_hours numeric
)
returns bigint
language plpgsql
as $function$
declare
    v_baler_type_id bigint;
    v_name text;
begin
    v_name := btrim(p_name);

    if v_name is null or v_name = '' then
        raise exception 'name is required';
    end if;

    if p_welding_hours is null or p_welding_hours < 0 then
        raise exception 'welding hours must be a non-negative number';
    end if;
    if p_assembling_hours is null or p_assembling_hours < 0 then
        raise exception 'assembling hours must be a non-negative number';
    end if;
    if p_spraying_hours is null or p_spraying_hours < 0 then
        raise exception 'spraying hours must be a non-negative number';
    end if;

    insert into public.stg_baler_types (name, active)
    values (v_name, true)
    returning id into v_baler_type_id;

    insert into public.stg_baler_requirements (
        baler_type_id,
        name,
        stage_name,
        stage_sequence,
        stage_hour_requirements
    )
    values
        (
          v_baler_type_id,
          v_name,
          'welding',
          public.baler_stage_sequence_for_name('welding'),
          p_welding_hours
        ),
        (
          v_baler_type_id,
          v_name,
          'spraying',
          public.baler_stage_sequence_for_name('spraying'),
          p_spraying_hours
        ),
        (
          v_baler_type_id,
          v_name,
          'assembling',
          public.baler_stage_sequence_for_name('assembling'),
          p_assembling_hours
        );

    return v_baler_type_id;
end;
$function$;

create or replace function public.admin_update_baler_type_with_requirements(
  p_baler_type_id bigint,
  p_name text,
  p_welding_hours numeric,
  p_assembling_hours numeric,
  p_spraying_hours numeric
)
returns void
language plpgsql
as $function$
declare
    v_name text;
begin
    v_name := btrim(p_name);

    if p_baler_type_id is null then
        raise exception 'baler_type_id is required';
    end if;

    if v_name is null or v_name = '' then
        raise exception 'name is required';
    end if;

    if p_welding_hours is null or p_welding_hours < 0 then
        raise exception 'welding hours must be a non-negative number';
    end if;
    if p_assembling_hours is null or p_assembling_hours < 0 then
        raise exception 'assembling hours must be a non-negative number';
    end if;
    if p_spraying_hours is null or p_spraying_hours < 0 then
        raise exception 'spraying hours must be a non-negative number';
    end if;

    update public.stg_baler_types
    set name = v_name,
        updated_at = now()
    where id = p_baler_type_id
      and deleted_at is null;

    if not found then
        raise exception 'baler type not found';
    end if;

    update public.stg_baler_requirements
    set name = v_name,
        stage_sequence = public.baler_stage_sequence_for_name('welding'),
        stage_hour_requirements = p_welding_hours,
        deleted_at = null,
        updated_at = now()
    where baler_type_id = p_baler_type_id
      and stage_name = 'welding';

    if not found then
        insert into public.stg_baler_requirements (
            baler_type_id, name, stage_name, stage_sequence, stage_hour_requirements
        )
        values (
          p_baler_type_id,
          v_name,
          'welding',
          public.baler_stage_sequence_for_name('welding'),
          p_welding_hours
        );
    end if;

    update public.stg_baler_requirements
    set name = v_name,
        stage_sequence = public.baler_stage_sequence_for_name('spraying'),
        stage_hour_requirements = p_spraying_hours,
        deleted_at = null,
        updated_at = now()
    where baler_type_id = p_baler_type_id
      and stage_name = 'spraying';

    if not found then
        insert into public.stg_baler_requirements (
            baler_type_id, name, stage_name, stage_sequence, stage_hour_requirements
        )
        values (
          p_baler_type_id,
          v_name,
          'spraying',
          public.baler_stage_sequence_for_name('spraying'),
          p_spraying_hours
        );
    end if;

    update public.stg_baler_requirements
    set name = v_name,
        stage_sequence = public.baler_stage_sequence_for_name('assembling'),
        stage_hour_requirements = p_assembling_hours,
        deleted_at = null,
        updated_at = now()
    where baler_type_id = p_baler_type_id
      and stage_name = 'assembling';

    if not found then
        insert into public.stg_baler_requirements (
            baler_type_id, name, stage_name, stage_sequence, stage_hour_requirements
        )
        values (
          p_baler_type_id,
          v_name,
          'assembling',
          public.baler_stage_sequence_for_name('assembling'),
          p_assembling_hours
        );
    end if;

    update public.stg_baler_requirements
    set deleted_at = now(),
        updated_at = now()
    where baler_type_id = p_baler_type_id
      and deleted_at is null
      and stage_name not in ('welding', 'spraying', 'assembling');
end;
$function$;

update public.stg_baler_requirements
set stage_sequence = public.baler_stage_sequence_for_name(stage_name),
    updated_at = now()
where lower(stage_name) in ('welding', 'spraying', 'assembling');

update public.int_operation_assignments
set stage_order = case lower(stage)
  when 'welding' then 1
  when 'spraying' then 2
  when 'assembling' then 3
  else stage_order
end,
updated_at = now()
where lower(stage) in ('welding', 'spraying', 'assembling')
  and deleted_at is null;
