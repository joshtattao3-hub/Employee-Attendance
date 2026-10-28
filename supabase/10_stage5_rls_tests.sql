-- =====================================================================
-- Hirara attendance: Stage 5 security and rules tests
-- Run in the Supabase SQL Editor. Choose "Run without RLS" on the warning
-- (it creates a temporary table, same as 04 and 07).
--
-- What it proves:
--   * employees cannot create, change or delete schedules or shift templates
--   * a manager can schedule only their own branch, and cannot edit templates
--   * an admin can schedule any branch
--   * set_schedule() builds times from the BRANCH time zone and copies the
--     template's break
--   * past days, overnight shifts, switched-off templates, unknown
--     templates, inactive employees and missing dates are refused
--   * overlapping and over-16-hour shifts are blocked by the database
--   * clock_in() links today's scheduled shift (or none), a linked shift
--     is locked, and the older clock-in rules still hold
--
-- It CHANGES NOTHING. Every attempt runs inside a sub-block that is rolled
-- back, so it is safe to re-run at any time. (Some scenarios delete
-- Maria's attendance for today INSIDE that sub-block; the rollback restores
-- it.)
--
-- Before running, make sure (the first checks confirm this):
--   admin@hirara.demo is the admin
--   paolo@hirara.demo is a manager (Downtown Store)
--   maria@hirara.demo is an employee (Downtown Store)
--   john@hirara.demo is an employee (Riverside Mall), active
--   at least one active same-day shift template exists
--
-- Expected result: the first row says ALL PASS.
-- =====================================================================

drop table if exists pg_temp.stage5_results;
create temp table stage5_results (
  n          serial,
  check_name text,
  expected   text,
  actual     text,
  ok         boolean
);

-- Record one check
create or replace function pg_temp.s5_chk(p_name text, p_expected text, p_actual text)
returns void
language plpgsql
as $f$
begin
  insert into stage5_results (check_name, expected, actual, ok)
  values (p_name, p_expected, p_actual, coalesce(p_expected = p_actual, false));
end
$f$;

-- Try ONE write as a given user. Returns 'rows:N' or 'error:<sqlstate>'.
create or replace function pg_temp.s5_rows_as(p_uid uuid, p_sql text)
returns text
language plpgsql
as $f$
declare
  n   bigint;
  msg text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    execute p_sql;
    get diagnostics n = row_count;
    msg := 'rows:' || n;
    raise exception 'undo';
  exception when others then
    if sqlerrm = 'undo' then
      return msg;
    end if;
    return 'error:' || sqlstate;
  end;
  return 'unexpected';
end
$f$;

-- Count what a given user can see. Returns 'count:N' or 'error:<sqlstate>'.
create or replace function pg_temp.s5_count_as(p_uid uuid, p_sql text)
returns text
language plpgsql
as $f$
declare
  n   bigint;
  msg text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    execute p_sql into n;
    msg := 'count:' || n;
    raise exception 'undo';
  exception when others then
    if sqlerrm = 'undo' then
      return msg;
    end if;
    return 'error:' || sqlstate;
  end;
  return 'unexpected';
end
$f$;

-- Run several steps in order, each as its own user (a NULL user means
-- "as the database owner", used only for test setup). Everything is undone.
-- The LAST step is the one being tested:
--   * if it succeeds: returns 'ok', or the result of p_value_sql if given
--   * if it fails:    returns 'error:<message>' for our own rules, or
--                     'error:<sqlstate>' for anything else
-- If an EARLIER step fails, the setup was wrong: 'setup_failed(step N): ...'
create or replace function pg_temp.s5_seq_as(
  p_uids uuid[], p_sqls text[], p_value_sql text default null)
returns text
language plpgsql
as $f$
declare
  i   int;
  n   int := array_length(p_sqls, 1);
  cur int := 0;
  res text := 'unexpected';
begin
  begin
    for i in 1..n loop
      cur := i;
      reset role;
      if p_uids[i] is not null then
        perform set_config('request.jwt.claims',
          json_build_object('sub', p_uids[i], 'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;
      execute p_sqls[i];
    end loop;

    reset role;
    res := 'ok';
    if p_value_sql is not null then
      execute p_value_sql into res;
    end if;
    raise exception 'undo';
  exception when others then
    if sqlerrm = 'undo' then
      return res;
    end if;
    if cur < n then
      return 'setup_failed(step ' || cur || '): ' || sqlerrm;
    end if;
    return case when sqlstate = 'P0001'
                then 'error:' || sqlerrm
                else 'error:' || sqlstate end;
  end;
  return 'unexpected';
end
$f$;

-- SQL text builders, so the checks below stay short
create or replace function pg_temp.s5_set(p_emp uuid, p_date date, p_tpl uuid)
returns text language sql as $f$
  select format('select public.set_schedule(%L, %L, %L)', p_emp, p_date, p_tpl)
$f$;

create or replace function pg_temp.s5_clear(p_emp uuid, p_date date)
returns text language sql as $f$
  select format('select public.clear_schedule(%L, %L)', p_emp, p_date)
$f$;

do $test$
declare
  admin_id   uuid;
  paolo_id   uuid;
  maria_id   uuid;
  maria_emp  uuid;
  john_emp   uuid;
  dt         uuid;          -- Downtown Store (Paolo's and Maria's branch)
  rv         uuid;          -- Riverside Mall (John's branch)
  tz         text;          -- Downtown's time zone
  today      date;          -- today on Downtown's calendar
  future     date;
  past       date;
  future_ts  timestamptz;
  tpl        uuid;          -- an active same-day template
  tpl_start  time;
  tpl_break  integer;
  tpl_night  uuid := gen_random_uuid();
  tpl_off    uuid := gen_random_uuid();
  clock_sql  text := 'select public.clock_in()';
  del_att    text;          -- clears Maria's attendance (undone afterwards)
  ins_sql    text;
begin
  select id into admin_id  from auth.users where email = 'admin@hirara.demo';
  select id into paolo_id  from auth.users where email = 'paolo@hirara.demo';
  select id into maria_id  from auth.users where email = 'maria@hirara.demo';
  select id into maria_emp from public.employees where email = 'maria@hirara.demo';
  select id, branch_id into john_emp, rv from public.employees where email = 'john@hirara.demo';
  select e.branch_id, b.timezone into dt, tz
    from public.employees e join public.branches b on b.id = e.branch_id
    where e.email = 'paolo@hirara.demo';

  today     := (clock_timestamp() at time zone tz)::date;
  future    := today + 3;
  past      := today - 1;
  future_ts := (future + time '09:00') at time zone tz;

  select id, start_time, break_minutes into tpl, tpl_start, tpl_break
    from public.shift_templates
    where active and not crosses_midnight
    order by start_time, name limit 1;

  del_att := format(
    'delete from public.attendance where employee_id = %L and (work_date = %L or clock_out is null)',
    maria_emp, today);

  -- ---- Setup ----
  perform pg_temp.s5_chk('Setup: admin login has role admin', 'admin',
    (select role from public.profiles where id = admin_id));
  perform pg_temp.s5_chk('Setup: Paolo is a manager', 'manager',
    (select role from public.profiles where id = paolo_id));
  perform pg_temp.s5_chk('Setup: Maria is an employee', 'employee',
    (select role from public.profiles where id = maria_id));
  perform pg_temp.s5_chk('Setup: Maria and Paolo share a branch, John is active elsewhere', 'true',
    (dt is not null and rv is not null and dt <> rv
     and (select branch_id from public.employees where id = maria_emp) = dt
     and (select active from public.employees where id = john_emp))::text);
  perform pg_temp.s5_chk('Setup: an active same-day shift template exists', 'true',
    (tpl is not null)::text);

  -- ---- Employee (Maria) ----
  perform pg_temp.s5_chk('Employee sees no one else''s schedules', 'count:0',
    pg_temp.s5_count_as(maria_id,
      format('select count(*) from public.schedules where employee_id <> %L', maria_emp)));
  perform pg_temp.s5_chk('Employee sees their own schedules',
    'count:' || (select count(*) from public.schedules where employee_id = maria_emp),
    pg_temp.s5_count_as(maria_id,
      format('select count(*) from public.schedules where employee_id = %L', maria_emp)));
  perform pg_temp.s5_chk('Employee cannot add a schedule directly', 'error:42501',
    pg_temp.s5_rows_as(maria_id,
      format('insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) values (%L, %L, %L, %L, %L)',
             maria_emp, dt, future, future_ts, future_ts + interval '8 hours')));
  perform pg_temp.s5_chk('Employee cannot edit a schedule', 'rows:0',
    pg_temp.s5_rows_as(maria_id,
      format('update public.schedules set break_minutes = 0 where employee_id = %L', maria_emp)));
  perform pg_temp.s5_chk('Employee cannot delete a schedule', 'rows:0',
    pg_temp.s5_rows_as(maria_id,
      format('delete from public.schedules where employee_id = %L', maria_emp)));
  perform pg_temp.s5_chk('Employee cannot call set_schedule', 'error:not_allowed',
    pg_temp.s5_seq_as(array[maria_id], array[pg_temp.s5_set(maria_emp, future, tpl)]));
  perform pg_temp.s5_chk('Employee cannot call clear_schedule', 'error:not_allowed',
    pg_temp.s5_seq_as(array[maria_id], array[pg_temp.s5_clear(maria_emp, future)]));
  perform pg_temp.s5_chk('Employee can read shift templates',
    'count:' || (select count(*) from public.shift_templates),
    pg_temp.s5_count_as(maria_id, 'select count(*) from public.shift_templates'));
  perform pg_temp.s5_chk('Employee cannot add a shift template', 'error:42501',
    pg_temp.s5_rows_as(maria_id,
      format('insert into public.shift_templates (name, start_time, end_time) values (%L, %L, %L)',
             'Hacked', '09:00', '17:00')));
  perform pg_temp.s5_chk('Employee cannot edit a shift template', 'rows:0',
    pg_temp.s5_rows_as(maria_id, 'update public.shift_templates set name = name'));

  -- ---- Manager (Paolo) ----
  perform pg_temp.s5_chk('Manager sees no schedules outside their branch', 'count:0',
    pg_temp.s5_count_as(paolo_id,
      format('select count(*) from public.schedules where branch_id <> %L', dt)));
  perform pg_temp.s5_chk('Manager sees all schedules of their branch',
    'count:' || (select count(*) from public.schedules where branch_id = dt),
    pg_temp.s5_count_as(paolo_id,
      format('select count(*) from public.schedules where branch_id = %L', dt)));
  perform pg_temp.s5_chk('Manager can read shift templates',
    'count:' || (select count(*) from public.shift_templates),
    pg_temp.s5_count_as(paolo_id, 'select count(*) from public.shift_templates'));
  perform pg_temp.s5_chk('Manager cannot add a shift template', 'error:42501',
    pg_temp.s5_rows_as(paolo_id,
      format('insert into public.shift_templates (name, start_time, end_time) values (%L, %L, %L)',
             'Hacked', '09:00', '17:00')));
  perform pg_temp.s5_chk('Manager cannot edit a shift template', 'rows:0',
    pg_temp.s5_rows_as(paolo_id, 'update public.shift_templates set name = name'));
  perform pg_temp.s5_chk('Manager can schedule an employee of their branch', 'ok',
    pg_temp.s5_seq_as(array[paolo_id], array[pg_temp.s5_set(maria_emp, future, tpl)]));
  perform pg_temp.s5_chk('Manager cannot schedule another branch''s employee', 'error:employee_not_found',
    pg_temp.s5_seq_as(array[paolo_id], array[pg_temp.s5_set(john_emp, future, tpl)]));
  perform pg_temp.s5_chk('Manager cannot clear another branch''s schedule', 'error:employee_not_found',
    pg_temp.s5_seq_as(array[paolo_id], array[pg_temp.s5_clear(john_emp, future)]));
  perform pg_temp.s5_chk('Manager cannot add a schedule for another branch directly', 'error:42501',
    pg_temp.s5_rows_as(paolo_id,
      format('insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) values (%L, %L, %L, %L, %L)',
             john_emp, rv, future, future_ts, future_ts + interval '8 hours')));
  perform pg_temp.s5_chk('Manager cannot file a schedule under another branch''s id', 'error:42501',
    pg_temp.s5_rows_as(paolo_id,
      format('insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) values (%L, %L, %L, %L, %L)',
             maria_emp, rv, future, future_ts, future_ts + interval '8 hours')));
  perform pg_temp.s5_chk('Manager can set and then clear a shift', 'ok',
    pg_temp.s5_seq_as(array[paolo_id, paolo_id],
      array[pg_temp.s5_set(maria_emp, future, tpl), pg_temp.s5_clear(maria_emp, future)]));

  -- ---- Admin ----
  perform pg_temp.s5_chk('Admin sees all schedules',
    'count:' || (select count(*) from public.schedules),
    pg_temp.s5_count_as(admin_id, 'select count(*) from public.schedules'));
  perform pg_temp.s5_chk('Admin can schedule an employee in any branch', 'ok',
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(john_emp, future, tpl)]));
  perform pg_temp.s5_chk('Stored start time follows the BRANCH time zone',
    tpl_start::text,
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(maria_emp, future, tpl)],
      format('select (start_at at time zone %L)::time::text from public.schedules where employee_id = %L and work_date = %L order by start_at limit 1',
             tz, maria_emp, future)));
  perform pg_temp.s5_chk('Stored work date is the date that was chosen',
    future::text,
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(maria_emp, future, tpl)],
      format('select work_date::text from public.schedules where employee_id = %L and work_date = %L limit 1',
             maria_emp, future)));
  perform pg_temp.s5_chk('The template''s break is copied onto the shift',
    tpl_break::text,
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(maria_emp, future, tpl)],
      format('select break_minutes::text from public.schedules where employee_id = %L and work_date = %L limit 1',
             maria_emp, future)));
  perform pg_temp.s5_chk('Setting a day twice replaces the shift, not duplicates it', '1',
    pg_temp.s5_seq_as(array[admin_id, admin_id],
      array[pg_temp.s5_set(maria_emp, future, tpl), pg_temp.s5_set(maria_emp, future, tpl)],
      format('select count(*)::text from public.schedules where employee_id = %L and work_date = %L',
             maria_emp, future)));
  perform pg_temp.s5_chk('Clearing a day removes the shift', '0',
    pg_temp.s5_seq_as(array[admin_id, admin_id],
      array[pg_temp.s5_set(maria_emp, future, tpl), pg_temp.s5_clear(maria_emp, future)],
      format('select count(*)::text from public.schedules where employee_id = %L and work_date = %L',
             maria_emp, future)));
  perform pg_temp.s5_chk('Clearing a day that has no shift is harmless', 'ok',
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_clear(maria_emp, future)]));

  -- ---- Rules enforced by set_schedule / clear_schedule / the table ----
  perform pg_temp.s5_chk('A past day cannot be scheduled', 'error:date_in_past',
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(maria_emp, past, tpl)]));
  perform pg_temp.s5_chk('A past day cannot be cleared', 'error:date_in_past',
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_clear(maria_emp, past)]));
  perform pg_temp.s5_chk('An overnight template is refused', 'error:overnight_not_supported',
    pg_temp.s5_seq_as(array[null, admin_id],
      array[format('insert into public.shift_templates (id, name, start_time, end_time) values (%L, %L, %L, %L)',
                   tpl_night, 'zz_test_night', '22:00', '06:00'),
            pg_temp.s5_set(maria_emp, future, tpl_night)]));
  perform pg_temp.s5_chk('A switched-off template is refused', 'error:template_inactive',
    pg_temp.s5_seq_as(array[null, admin_id],
      array[format('insert into public.shift_templates (id, name, start_time, end_time, active) values (%L, %L, %L, %L, false)',
                   tpl_off, 'zz_test_off', '09:00', '17:00'),
            pg_temp.s5_set(maria_emp, future, tpl_off)]));
  perform pg_temp.s5_chk('An unknown template is refused', 'error:template_not_found',
    pg_temp.s5_seq_as(array[admin_id],
      array[pg_temp.s5_set(maria_emp, future, gen_random_uuid())]));
  perform pg_temp.s5_chk('An inactive employee cannot be scheduled', 'error:employee_inactive',
    pg_temp.s5_seq_as(array[null, admin_id],
      array[format('update public.employees set active = false where id = %L', maria_emp),
            pg_temp.s5_set(maria_emp, future, tpl)]));
  perform pg_temp.s5_chk('A missing date is refused', 'error:invalid_date',
    pg_temp.s5_seq_as(array[admin_id], array[pg_temp.s5_set(maria_emp, null, tpl)]));
  perform pg_temp.s5_chk('Overlapping shifts for one person are blocked', 'error:23P01',
    pg_temp.s5_seq_as(array[admin_id, null],
      array[pg_temp.s5_set(maria_emp, future, tpl),
            format('insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) select employee_id, branch_id, work_date, start_at + interval ''1 hour'', end_at from public.schedules where employee_id = %L and work_date = %L',
                   maria_emp, future)]));
  perform pg_temp.s5_chk('A shift longer than 16 hours is blocked', 'error:23514',
    pg_temp.s5_seq_as(array[null::uuid],
      array[format('insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) values (%L, %L, %L, %L, %L)',
                   maria_emp, dt, future, future_ts, future_ts + interval '17 hours')]));

  -- ---- Clock-in and the schedule ----
  perform pg_temp.s5_chk('Clock-in links today''s scheduled shift', 'true',
    pg_temp.s5_seq_as(array[null, admin_id, maria_id],
      array[del_att, pg_temp.s5_set(maria_emp, today, tpl), clock_sql],
      format('select (a.schedule_id = s.id)::text from public.attendance a join public.schedules s on s.employee_id = a.employee_id and s.work_date = a.work_date where a.employee_id = %L and a.work_date = %L',
             maria_emp, today)));
  perform pg_temp.s5_chk('Clock-in works with no scheduled shift (no link)', 'true',
    pg_temp.s5_seq_as(array[null, null, maria_id],
      array[del_att,
            format('delete from public.schedules where employee_id = %L and work_date = %L', maria_emp, today),
            clock_sql],
      format('select (schedule_id is null)::text from public.attendance where employee_id = %L and work_date = %L',
             maria_emp, today)));
  perform pg_temp.s5_chk('A shift already clocked into cannot be changed', 'error:shift_in_use',
    pg_temp.s5_seq_as(array[null, admin_id, maria_id, admin_id],
      array[del_att, pg_temp.s5_set(maria_emp, today, tpl), clock_sql,
            pg_temp.s5_set(maria_emp, today, tpl)]));
  perform pg_temp.s5_chk('A shift already clocked into cannot be cleared', 'error:shift_in_use',
    pg_temp.s5_seq_as(array[null, admin_id, maria_id, admin_id],
      array[del_att, pg_temp.s5_set(maria_emp, today, tpl), clock_sql,
            pg_temp.s5_clear(maria_emp, today)]));
  perform pg_temp.s5_chk('A second clock-in is still refused', 'error:already_clocked_in',
    pg_temp.s5_seq_as(array[null, maria_id, maria_id],
      array[del_att, clock_sql, clock_sql]));
end
$test$;

-- One summary row first, then every check
select *
from (
  select 0 as n,
         'SUMMARY' as check_name,
         '' as expected,
         '' as actual,
         case when bool_and(ok) then 'ALL PASS'
              else (count(*) filter (where not ok))::text || ' FAILED' end as result
  from stage5_results
  union all
  select n, check_name, expected, actual,
         case when ok then 'PASS' else 'FAIL' end
  from stage5_results
) t
order by n;