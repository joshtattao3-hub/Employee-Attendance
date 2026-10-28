-- =====================================================================
-- Hirara attendance: Stage 5d, link clock-in to the schedule
-- Run AFTER 01 to 08. Safe to run more than once.
--
-- Replaces clock_in() so a new attendance record remembers which scheduled
-- shift it belongs to (attendance.schedule_id).
--
-- Rules:
--   * the match is the employee's shift on today's date AT THE BRANCH
--   * no scheduled shift is fine: the clock-in still works, schedule_id
--     stays empty (late / early / no-show flags come in Stage 6)
--   * every earlier rule is unchanged: one open shift, one shift per work
--     day, missed time-outs, database clock
--
-- To undo: run 06_stage3_attendance.sql again.
-- =====================================================================

create or replace function public.clock_in()
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now         timestamptz := clock_timestamp();
  v_employee_id uuid;
  v_branch_id   uuid;
  v_timezone    text;
  v_max_hours   integer;
  v_work_date   date;
  v_schedule_id uuid;                                   -- NEW
  v_row         public.attendance;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Only active employees can clock in. Admins have no employee record.
  v_employee_id := app.my_employee_id();
  if v_employee_id is null then
    raise exception 'no_employee' using errcode = 'P0001';
  end if;

  -- One action at a time per person (double taps, two devices at once)
  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  select e.branch_id, b.timezone
    into v_branch_id, v_timezone
  from public.employees e
  join public.branches b on b.id = e.branch_id
  where e.id = v_employee_id;

  select max_shift_hours into v_max_hours from public.company_settings where id = 1;

  -- A shift left open too long can no longer be closed: flag it as missed.
  update public.attendance
  set missed_timeout = true
  where employee_id = v_employee_id
    and clock_out is null
    and not missed_timeout
    and clock_in < v_now - make_interval(hours => v_max_hours);

  if exists (
    select 1 from public.attendance
    where employee_id = v_employee_id and clock_out is null and not missed_timeout
  ) then
    raise exception 'already_clocked_in' using errcode = 'P0001';
  end if;

  -- The work day is the branch's calendar day, not the phone's.
  v_work_date := (v_now at time zone v_timezone)::date;

  if exists (
    select 1 from public.attendance
    where employee_id = v_employee_id and work_date = v_work_date
  ) then
    raise exception 'already_completed_today' using errcode = 'P0001';
  end if;

  -- NEW: find today's scheduled shift, if there is one. The row is locked
  -- until this clock-in finishes, so a manager cannot change or clear it
  -- at the same moment. Having no shift is fine and not an error.
  select s.id into v_schedule_id
  from public.schedules s
  where s.employee_id = v_employee_id
    and s.work_date = v_work_date
  order by s.start_at
  limit 1
  for share;

  insert into public.attendance
    (employee_id, branch_id, schedule_id, work_date, clock_in, source)  -- NEW: schedule_id
  values
    (v_employee_id, v_branch_id, v_schedule_id, v_work_date, v_now, 'self')
  returning * into v_row;

  return v_row;
end
$$;

-- Signed-in users only. No arguments exist, so nobody can act for someone else.
revoke all on function public.clock_in() from public, anon;
grant execute on function public.clock_in() to authenticated;