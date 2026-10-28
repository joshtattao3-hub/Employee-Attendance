-- =====================================================================
-- Hirara attendance: Stage 5, scheduling
-- Run AFTER 01 to 07. Safe to run more than once.
--
-- Adds:
--   * set_schedule(): give an employee a shift template on a date
--   * clear_schedule(): remove an employee's shift on a date
--
-- These run as the SIGNED-IN person (security invoker), so the row-level
-- security rules from Stage 1 still decide who may change what:
-- admins everywhere, managers only in their own branch.
--
-- Rules enforced here:
--   * the times are built from the BRANCH's time zone, not the phone's
--   * one shift per employee per day (Stage 6 allows more)
--   * same-day shifts only (overnight shifts come in Stage 6)
--   * no changes to days before today at the branch
--   * a shift someone already clocked in against cannot be changed or removed
-- =====================================================================

create or replace function public.set_schedule(
  p_employee_id uuid,
  p_work_date   date,
  p_template_id uuid
)
returns public.schedules
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now       timestamptz := clock_timestamp();
  v_branch_id uuid;
  v_active    boolean;
  v_timezone  text;
  v_template  public.shift_templates;
  v_start     timestamptz;
  v_end       timestamptz;
  v_existing  public.schedules;
  v_row       public.schedules;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not (app.is_admin() or app.is_manager()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_work_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  -- Employees you are not allowed to see simply do not exist here.
  select e.branch_id, e.active, b.timezone
    into v_branch_id, v_active, v_timezone
  from public.employees e
  join public.branches b on b.id = e.branch_id
  where e.id = p_employee_id;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0001';
  end if;
  if not v_active then
    raise exception 'employee_inactive' using errcode = 'P0001';
  end if;

  -- One change at a time per person (double clicks, two managers at once)
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 1));

  -- Days before today (by the branch's calendar) are history
  if p_work_date < (v_now at time zone v_timezone)::date then
    raise exception 'date_in_past' using errcode = 'P0001';
  end if;

  select * into v_template from public.shift_templates where id = p_template_id;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0001';
  end if;
  if not v_template.active then
    raise exception 'template_inactive' using errcode = 'P0001';
  end if;
  if v_template.crosses_midnight then
    raise exception 'overnight_not_supported' using errcode = 'P0001';
  end if;

  -- "08:00 on this date in the branch's time zone" as a real moment
  v_start := (p_work_date + v_template.start_time) at time zone v_timezone;
  v_end   := (p_work_date + v_template.end_time)   at time zone v_timezone;

  select * into v_existing
  from public.schedules
  where employee_id = p_employee_id and work_date = p_work_date
  order by start_at
  limit 1
  for update;

  if found then
    if exists (select 1 from public.attendance where schedule_id = v_existing.id) then
      raise exception 'shift_in_use' using errcode = 'P0001';
    end if;

    update public.schedules
    set template_id   = p_template_id,
        branch_id     = v_branch_id,
        start_at      = v_start,
        end_at        = v_end,
        break_minutes = v_template.break_minutes
    where id = v_existing.id
    returning * into v_row;

    -- Security rules hide rows you may not change, without an error
    if not found then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  else
    insert into public.schedules
      (employee_id, branch_id, template_id, work_date, start_at, end_at, break_minutes)
    values
      (p_employee_id, v_branch_id, p_template_id, p_work_date, v_start, v_end,
       v_template.break_minutes)
    returning * into v_row;
  end if;

  return v_row;
end
$$;

create or replace function public.clear_schedule(
  p_employee_id uuid,
  p_work_date   date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not (app.is_admin() or app.is_manager()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_work_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  select b.timezone into v_timezone
  from public.employees e
  join public.branches b on b.id = e.branch_id
  where e.id = p_employee_id;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 1));

  if p_work_date < (clock_timestamp() at time zone v_timezone)::date then
    raise exception 'date_in_past' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.schedules s
    join public.attendance a on a.schedule_id = s.id
    where s.employee_id = p_employee_id and s.work_date = p_work_date
  ) then
    raise exception 'shift_in_use' using errcode = 'P0001';
  end if;

  delete from public.schedules
  where employee_id = p_employee_id and work_date = p_work_date;
end
$$;

-- Signed-in users only; the security rules decide the rest.
revoke all on function public.set_schedule(uuid, date, uuid)  from public, anon;
revoke all on function public.clear_schedule(uuid, date)      from public, anon;
grant execute on function public.set_schedule(uuid, date, uuid) to authenticated;
grant execute on function public.clear_schedule(uuid, date)     to authenticated;