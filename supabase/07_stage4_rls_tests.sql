-- =====================================================================
-- Hirara attendance: Stage 4 security tests
-- Run in the Supabase SQL Editor. Choose "Run without RLS" on the warning
-- (it creates a temporary table, same as 04_rls_tests.sql).
--
-- What it proves: a manager sees only their own branch and cannot change
-- branches, roles or employees; an employee sees only themselves; an admin
-- can manage branches and roles, but cannot demote themselves.
--
-- It CHANGES NOTHING. Every write attempt runs inside a sub-block that is
-- rolled back, so it is safe to re-run at any time.
--
-- Before running, make sure:
--   admin@hirara.demo is the admin
--   paolo@hirara.demo is a manager (Downtown Store)
--   maria@hirara.demo is an employee (Downtown Store)
--   john@hirara.demo is an employee (Riverside Mall)
-- (the first checks in the result confirm this)
--
-- Expected result: the first row says ALL PASS.
-- =====================================================================

drop table if exists pg_temp.stage4_results;
create temp table stage4_results (
  n          serial,
  check_name text,
  expected   text,
  actual     text,
  ok         boolean
);

-- Record one check
create or replace function pg_temp.chk(p_name text, p_expected text, p_actual text)
returns void
language plpgsql
as $f$
begin
  insert into stage4_results (check_name, expected, actual, ok)
  values (p_name, p_expected, p_actual, coalesce(p_expected = p_actual, false));
end
$f$;

-- Try a write as a given user. Returns 'rows:N' or 'error:<sqlstate>'.
-- The attempt is always undone (the exception rolls the sub-block back).
create or replace function pg_temp.rows_as(p_uid uuid, p_sql text)
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
create or replace function pg_temp.count_as(p_uid uuid, p_sql text)
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

do $test$
declare
  admin_id  uuid;
  paolo_id  uuid;
  maria_id  uuid;
  maria_emp uuid;
  dt        uuid;   -- Downtown Store (Paolo's branch)
  rv        uuid;   -- Riverside Mall (John's branch)
  dt_name   text;
begin
  select id into admin_id from auth.users where email = 'admin@hirara.demo';
  select id into paolo_id from auth.users where email = 'paolo@hirara.demo';
  select id into maria_id from auth.users where email = 'maria@hirara.demo';
  select id into maria_emp from public.employees where email = 'maria@hirara.demo';
  select branch_id into dt from public.employees where email = 'paolo@hirara.demo';
  select branch_id into rv from public.employees where email = 'john@hirara.demo';
  select name into dt_name from public.branches where id = dt;

  -- ---- Setup: the accounts are in the roles these tests expect ----
  perform pg_temp.chk('Setup: admin login has role admin', 'admin',
    (select role from public.profiles where id = admin_id));
  perform pg_temp.chk('Setup: Paolo is a manager', 'manager',
    (select role from public.profiles where id = paolo_id));
  perform pg_temp.chk('Setup: Maria is an employee', 'employee',
    (select role from public.profiles where id = maria_id));
  perform pg_temp.chk('Setup: Downtown and Riverside are different branches', 'true',
    (dt is not null and rv is not null and dt <> rv)::text);

  -- ---- Manager (Paolo) ----
  perform pg_temp.chk('Manager sees no employees outside their branch', 'count:0',
    pg_temp.count_as(paolo_id,
      format('select count(*) from public.employees where branch_id <> %L', dt)));
  perform pg_temp.chk('Manager sees all employees of their branch',
    'count:' || (select count(*) from public.employees where branch_id = dt),
    pg_temp.count_as(paolo_id,
      format('select count(*) from public.employees where branch_id = %L', dt)));
  perform pg_temp.chk('Manager sees no attendance outside their branch', 'count:0',
    pg_temp.count_as(paolo_id,
      format('select count(*) from public.attendance where branch_id <> %L', dt)));
  perform pg_temp.chk('Manager sees all attendance of their branch',
    'count:' || (select count(*) from public.attendance where branch_id = dt),
    pg_temp.count_as(paolo_id,
      format('select count(*) from public.attendance where branch_id = %L', dt)));
  perform pg_temp.chk('Manager sees only their own login row', 'count:1',
    pg_temp.count_as(paolo_id, 'select count(*) from public.profiles'));
  perform pg_temp.chk('Manager cannot read the audit log', 'count:0',
    pg_temp.count_as(paolo_id, 'select count(*) from public.audit_log'));
  perform pg_temp.chk('Manager can read the branch list',
    'count:' || (select count(*) from public.branches),
    pg_temp.count_as(paolo_id, 'select count(*) from public.branches'));
  perform pg_temp.chk('Manager cannot add a branch', 'error:42501',
    pg_temp.rows_as(paolo_id,
      format('insert into public.branches (name) values (%L)', 'Hacked Branch')));
  perform pg_temp.chk('Manager cannot edit a branch', 'rows:0',
    pg_temp.rows_as(paolo_id,
      format('update public.branches set name = %L where id = %L', 'Hacked', dt)));
  perform pg_temp.chk('Manager cannot edit employees', 'rows:0',
    pg_temp.rows_as(paolo_id,
      format('update public.employees set job_title = %L where branch_id = %L', 'Hacked', dt)));
  perform pg_temp.chk('Manager cannot delete employees', 'rows:0',
    pg_temp.rows_as(paolo_id,
      format('delete from public.employees where branch_id = %L', dt)));
  perform pg_temp.chk('Manager cannot change another login''s role', 'rows:0',
    pg_temp.rows_as(paolo_id,
      format('update public.profiles set role = %L where id = %L', 'manager', maria_id)));
  perform pg_temp.chk('Manager cannot make themselves admin', 'rows:0',
    pg_temp.rows_as(paolo_id,
      format('update public.profiles set role = %L where id = %L', 'admin', paolo_id)));
  perform pg_temp.chk('Manager cannot write attendance directly', 'error:42501',
    pg_temp.rows_as(paolo_id,
      format('insert into public.attendance (employee_id, branch_id, work_date) values (%L, %L, current_date)',
             maria_emp, dt)));

  -- ---- Employee (Maria) ----
  perform pg_temp.chk('Employee sees only themselves in employees', 'count:1',
    pg_temp.count_as(maria_id, 'select count(*) from public.employees'));
  perform pg_temp.chk('Employee sees no one else''s attendance', 'count:0',
    pg_temp.count_as(maria_id,
      format('select count(*) from public.attendance where employee_id <> %L', maria_emp)));
  perform pg_temp.chk('Employee cannot read the audit log', 'count:0',
    pg_temp.count_as(maria_id, 'select count(*) from public.audit_log'));
  perform pg_temp.chk('Employee cannot add a branch', 'error:42501',
    pg_temp.rows_as(maria_id,
      format('insert into public.branches (name) values (%L)', 'Hacked Branch')));
  perform pg_temp.chk('Employee cannot change their own role', 'rows:0',
    pg_temp.rows_as(maria_id,
      format('update public.profiles set role = %L where id = %L', 'manager', maria_id)));

  -- ---- Admin ----
  perform pg_temp.chk('Admin sees all employees',
    'count:' || (select count(*) from public.employees),
    pg_temp.count_as(admin_id, 'select count(*) from public.employees'));
  perform pg_temp.chk('Admin sees all attendance',
    'count:' || (select count(*) from public.attendance),
    pg_temp.count_as(admin_id, 'select count(*) from public.attendance'));
  perform pg_temp.chk('Admin can read the audit log',
    'count:' || (select count(*) from public.audit_log),
    pg_temp.count_as(admin_id, 'select count(*) from public.audit_log'));
  perform pg_temp.chk('Admin can edit a branch', 'rows:1',
    pg_temp.rows_as(admin_id,
      format('update public.branches set name = name where id = %L', dt)));
  perform pg_temp.chk('Admin can add a branch with a real time zone', 'rows:1',
    pg_temp.rows_as(admin_id,
      format('insert into public.branches (name, timezone) values (%L, %L)', 'Zone Ok', 'Asia/Tokyo')));
  perform pg_temp.chk('Admin cannot add a duplicate branch name', 'error:23505',
    pg_temp.rows_as(admin_id,
      format('insert into public.branches (name) values (%L)', lower(dt_name))));
  perform pg_temp.chk('Admin cannot save a made-up time zone', 'error:22023',
    pg_temp.rows_as(admin_id,
      format('insert into public.branches (name, timezone) values (%L, %L)', 'Zone Test', 'Mars/Olympus')));
  perform pg_temp.chk('Admin can switch an employee to manager', 'rows:1',
    pg_temp.rows_as(admin_id,
      format('update public.profiles set role = %L where id = %L and role in (%L, %L)',
             'manager', maria_id, 'employee', 'manager')));
  perform pg_temp.chk('Admin cannot demote their own login', 'error:23514',
    pg_temp.rows_as(admin_id,
      format('update public.profiles set role = %L where id = %L', 'manager', admin_id)));
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
  from stage4_results
  union all
  select n, check_name, expected, actual,
         case when ok then 'PASS' else 'FAIL' end
  from stage4_results
) t
order by n;
