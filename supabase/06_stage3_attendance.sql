-- =====================================================================
-- Hirara attendance: Stage 3, attendance in the database
-- Run AFTER 01 to 05. Safe to run more than once.
--
-- Adds:
--   * clock_in() / clock_out(): the ONLY way attendance is written from the
--     app. They take no inputs, act only for the signed-in person, and use
--     the database clock, so a wrong phone clock cannot change a record.
--   * server_time(): lets the app show timers against the database clock.
--   * A rule that an employee's email cannot change while they have a login
--     (their login email and employee email must stay the same).
--
-- Rules enforced here:
--   * one open shift at a time
--   * one shift per work day (the day is the BRANCH's calendar day)
--   * a shift left open longer than the company limit (16 hours by
--     default) is flagged as a "missed time-out". It can no longer be
--     closed by the employee and it no longer blocks the next clock-in.
--     An administrator corrects it (correction requests come in Stage 7).
-- =====================================================================

-- The current time according to the database
create or replace function public.server_time()
returns timestamptz
language sql stable
as $$ select clock_timestamp() $$;

revoke all on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;

-- ---------------------------------------------------------------------
-- clock_in(): start a shift for the signed-in employee
-- ---------------------------------------------------------------------
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

  insert into public.attendance (employee_id, branch_id, work_date, clock_in, source)
  values (v_employee_id, v_branch_id, v_work_date, v_now, 'self')
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------
-- clock_out(): end the signed-in employee's open shift
-- ---------------------------------------------------------------------
create or replace function public.clock_out()
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now         timestamptz := clock_timestamp();
  v_employee_id uuid;
  v_max_hours   integer;
  v_row         public.attendance;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  v_employee_id := app.my_employee_id();
  if v_employee_id is null then
    raise exception 'no_employee' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  select max_shift_hours into v_max_hours from public.company_settings where id = 1;

  -- A shift open longer than the limit is a missed time-out, not closable here.
  update public.attendance
  set missed_timeout = true
  where employee_id = v_employee_id
    and clock_out is null
    and not missed_timeout
    and clock_in < v_now - make_interval(hours => v_max_hours);

  select * into v_row
  from public.attendance
  where employee_id = v_employee_id and clock_out is null and not missed_timeout
  for update;

  if not found then
    raise exception 'not_clocked_in' using errcode = 'P0001';
  end if;

  update public.attendance
  set clock_out = v_now
  where id = v_row.id
  returning * into v_row;

  return v_row;
end
$$;

-- Signed-in users only. No arguments exist, so nobody can act for someone else.
revoke all on function public.clock_in()  from public, anon;
revoke all on function public.clock_out() from public, anon;
grant execute on function public.clock_in()  to authenticated;
grant execute on function public.clock_out() to authenticated;

-- ---------------------------------------------------------------------
-- An employee's email cannot change while they have a login.
-- (Their login email and employee email must stay the same.)
-- ---------------------------------------------------------------------
create or replace function app.protect_login_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     and exists (select 1 from public.profiles p where p.employee_id = old.id) then
    raise exception 'email_locked' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke execute on function app.protect_login_email() from public;

drop trigger if exists employees_protect_login_email on public.employees;
create trigger employees_protect_login_email
  before update of email on public.employees
  for each row execute function app.protect_login_email();