create or replace function public.admin_set_worker_baler_type_capabilities(
  p_worker_id integer,
  p_baler_type_ids integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selected_ids integer[] := '{}'::integer[];
  v_invalid_ids integer[] := '{}'::integer[];
begin
  if not exists (
    select 1
    from public.stg_workers
    where id = p_worker_id
      and deleted_at is null
  ) then
    raise exception 'Worker % not found', p_worker_id
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct selected_id order by selected_id), '{}'::integer[])
    into v_selected_ids
  from unnest(coalesce(p_baler_type_ids, '{}'::integer[])) as selected_id
  where selected_id is not null;

  select coalesce(array_agg(candidate_id order by candidate_id), '{}'::integer[])
    into v_invalid_ids
  from (
    select selected_id as candidate_id
    from unnest(v_selected_ids) as selected_id
    left join public.stg_baler_types baler_type
      on baler_type.id = selected_id
     and baler_type.active = true
     and baler_type.deleted_at is null
    where baler_type.id is null
  ) invalid_ids;

  if coalesce(array_length(v_invalid_ids, 1), 0) > 0 then
    raise exception 'Invalid baler type ids: %', v_invalid_ids
      using errcode = '22023';
  end if;

  update public.worker_baler_type_capabilities
     set deleted_at = now(),
         updated_at = now()
   where worker_id = p_worker_id
     and deleted_at is null
     and not (baler_type_id = any(v_selected_ids));

  update public.worker_baler_type_capabilities
     set deleted_at = null,
         updated_at = now()
   where id in (
     select reactivatable.id
     from (
       select distinct on (capability.baler_type_id)
         capability.id
       from public.worker_baler_type_capabilities capability
       where capability.worker_id = p_worker_id
         and capability.deleted_at is not null
         and capability.baler_type_id = any(v_selected_ids)
         and not exists (
           select 1
           from public.worker_baler_type_capabilities active_capability
           where active_capability.worker_id = p_worker_id
             and active_capability.baler_type_id = capability.baler_type_id
             and active_capability.deleted_at is null
         )
       order by capability.baler_type_id, capability.updated_at desc, capability.id desc
     ) reactivatable
   );

  insert into public.worker_baler_type_capabilities (
    worker_id,
    baler_type_id
  )
  select
    p_worker_id,
    selected_id
  from unnest(v_selected_ids) as selected_id
  where not exists (
    select 1
    from public.worker_baler_type_capabilities capability
    where capability.worker_id = p_worker_id
      and capability.baler_type_id = selected_id
  );
end;
$$;
