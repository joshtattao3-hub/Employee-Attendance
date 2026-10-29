-- =====================================================================
-- Hirara attendance: Stage 1, security and rules tests
-- Run AFTER 01 to 03, 05 and 06, with the 4 test logins in place.
--
-- It acts as each test user (admin, manager, two employees, and a
-- signed-out visitor), tries things they should and should not be able
-- to do, and prints a PASS / FAIL table at the end.
--
-- Every test change is undone automatically. The only thing left behind
-- is ONE harmless audit-log row per run (from the admin audit test).
-- Re-run it any time you change a policy.
-- =====================================================================

create temp table if not exists results (
  n     serial primary key,
  area  text,
  label text,
  pass  boolean
);
truncate results restart identity;

-- ---------- helpers (they disappear when the session ends) ----------

-- Pretend to be a signed-in user, the way the API does.
create or replace function pg_temp.act_as(p_email text) returns void
language plpgsql as $fn$
declare v_id uuid;
begin
  perform set_config('role', 'none', true);          -- back to full rights to look the user up
  select id into v_id from auth.users where email = p_email;
  if v_id is null then
    raise exception 'Test login % was not found. Create it under Authentication -> Users first.', p_email;
  end if;
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end
$fn$;

-- Record one result. Switches to full rights just to save it, then back.
create or replace function pg_temp.t(p_area text, p_label text, p_ok boolean) returns void
language plpgsql as $fn$
declare v_role text := current_user;
begin
  perform set_config('role', 'none', true);
  insert into results (area, label, pass) values (p_area, p_label, coalesce(p_ok, false));
  perform set_config('role', v_role, true);
end
$fn$;

-- Run one statement, report what happened, and always undo it.
--   'ok'          it worked and changed at least one row
--   'zero'        it ran but changed nothing (row security filtered it out)
--   'error:CODE'  it failed (42501 = not allowed, 23xxx = a rule was broken)
create or replace function pg_temp.attempt(p_sql text) returns text
language plpgsql as $fn$
declare n bigint := 0;
begin
  execute p_sql;
  get diagnostics n = row_count;
  raise exception 'rollback_marker';
exception when others then
  if sqlerrm = 'rollback_marker' then
    return case when n > 0 then 'ok' else 'zero' end;
  end if;
  return 'error:' || sqlstate;
end
$fn$;

create or replace function pg_temp.allowed(p_sql text) returns boolean
language sql as $fn$ select pg_temp.attempt(p_sql) = 'ok' $fn$;

-- "Blocked" means not allowed (42501) or silently filtered. A typo in the
-- test SQL gives a different error code and shows up as FAIL.
create or replace function pg_temp.blocked(p_sql text) returns boolean
language sql as $fn$ select pg_temp.attempt(p_sql) in ('zero', 'error:42501') $fn$;

create or replace function pg_temp.breaks_rule(p_sql text, p_code text) returns boolean
language sql as $fn$ select pg_temp.attempt(p_sql) = 'error:' || p_code $fn$;

-- ---------- 1. Rules the database enforces on its own ----------
create or replace function pg_temp.run_constraints() returns void
language plpgsql as $fn$
declare
  v_emp uuid; v_branch uuid;
begin
  perform set_config('role', 'none', true);
  select id, branch_id into v_emp, v_branch from public.employees where email = 'maria@hirara.demo';

  perform pg_temp.t('rules', 'clock-out before clock-in is rejected',
    pg_temp.breaks_rule(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in, clock_out)
      values (%L, %L, current_date + 5, now() + interval '5 days', now() + interval '5 days' - interval '1 hour')
    $q$, v_emp, v_branch), '23514'));

  -- Two guards cover this (a one-open-shift index and the overlap rule);
  -- whichever fires first is fine.
  perform pg_temp.t('rules', 'two open shifts for one employee are rejected',
    pg_temp.attempt(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in) values
        (%L, %L, current_date + 5, now() + interval '5 days'),
        (%L, %L, current_date + 5, now() + interval '5 days 1 hour')
    $q$, v_emp, v_branch, v_emp, v_branch)) in ('error:23505', 'error:23P01'));

  perform pg_temp.t('rules', 'overlapping worked shifts are rejected',
    pg_temp.breaks_rule(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in, clock_out) values
        (%L, %L, current_date + 5, now() + interval '5 days',        now() + interval '5 days 9 hours'),
        (%L, %L, current_date + 5, now() + interval '5 days 4 hours', now() + interval '5 days 12 hours')
    $q$, v_emp, v_branch, v_emp, v_branch), '23P01'));

  perform pg_temp.t('rules', 'back-to-back shifts are allowed',
    pg_temp.allowed(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in, clock_out) values
        (%L, %L, current_date + 5, now() + interval '5 days',       now() + interval '5 days 4 hours'),
        (%L, %L, current_date + 5, now() + interval '5 days 4 hours', now() + interval '5 days 9 hours')
    $q$, v_emp, v_branch, v_emp, v_branch)));

  perform pg_temp.t('rules', 'a missed time-out does not block the next clock-in',
    pg_temp.allowed(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in, clock_out, missed_timeout) values
        (%L, %L, current_date + 5, now() + interval '5 days', null, true),
        (%L, %L, current_date + 6, now() + interval '6 days', null, false)
    $q$, v_emp, v_branch, v_emp, v_branch)));

  perform pg_temp.t('rules', 'a record cannot be both missed and closed',
    pg_temp.breaks_rule(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in, clock_out, missed_timeout)
      values (%L, %L, current_date + 5, now() + interval '5 days', now() + interval '5 days 1 hour', true)
    $q$, v_emp, v_branch), '23514'));

  perform pg_temp.t('rules', 'overlapping scheduled shifts are rejected',
    pg_temp.breaks_rule(format($q$
      insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at) values
        (%L, %L, current_date + 9, now() + interval '9 days',       now() + interval '9 days 8 hours'),
        (%L, %L, current_date + 9, now() + interval '9 days 4 hours', now() + interval '9 days 12 hours')
    $q$, v_emp, v_branch, v_emp, v_branch), '23P01'));

  perform pg_temp.t('rules', 'an invalid time zone is rejected',
    pg_temp.breaks_rule($q$ insert into public.branches (name, timezone) values ('Moon Base', 'Mars/Olympus') $q$, '22023'));

  perform pg_temp.t('rules', 'only one company settings row can exist',
    pg_temp.breaks_rule($q$ insert into public.company_settings (id) values (2) $q$, '23514'));

  perform pg_temp.t('rules', 'employee emails must be lowercase',
    pg_temp.breaks_rule(format($q$
      insert into public.employees (full_name, email, branch_id) values ('Test Person', 'Upper@Example.com', %L)
    $q$, v_branch), '23514'));

  perform pg_temp.t('rules', 'two employees cannot share an email',
    pg_temp.breaks_rule(format($q$
      insert into public.employees (full_name, email, branch_id) values ('Copycat', 'maria@hirara.demo', %L)
    $q$, v_branch), '23505'));

  perform pg_temp.t('rules', 'an employee with attendance history cannot be deleted',
    pg_temp.breaks_rule(format($q$ delete from public.employees where id = %L $q$, v_emp), '23503'));

  perform pg_temp.t('rules', 'staff logins must be linked to an employee record',
    pg_temp.breaks_rule($q$ update public.profiles set employee_id = null where email = 'maria@hirara.demo' $q$, '23514'));

  perform pg_temp.t('setup', 'every table has row level security turned on',
    not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity));

  perform pg_temp.t('setup', 'signed-out users have no table access',
    not has_table_privilege('anon', 'public.employees', 'select')
    and not has_table_privilege('anon', 'public.attendance', 'select')
    and not has_table_privilege('anon', 'public.audit_log', 'select'));

  perform pg_temp.t('setup', 'the app cannot write attendance or the audit log directly',
    not has_table_privilege('authenticated', 'public.attendance', 'insert')
    and not has_table_privilege('authenticated', 'public.attendance', 'update')
    and not has_table_privilege('authenticated', 'public.attendance', 'delete')
    and not has_table_privilege('authenticated', 'public.audit_log', 'insert')
    and not has_table_privilege('authenticated', 'public.audit_log', 'update')
    and not has_table_privilege('authenticated', 'public.audit_log', 'delete'));

  perform pg_temp.t('setup', 'helper functions cannot be called by signed-out users',
    not has_function_privilege('anon', 'app.my_role()', 'execute')
    and not has_function_privilege('anon', 'app.is_admin()', 'execute'));
end
$fn$;

-- ---------- 2. The administrator ----------
create or replace function pg_temp.run_admin(p_email text) returns void
language plpgsql as $fn$
declare
  v_employees bigint; v_branches bigint; v_attendance bigint; v_profiles bigint;
  v_target uuid; v_target_profile uuid;
begin
  perform set_config('role', 'none', true);
  select count(*) into v_employees  from public.employees;
  select count(*) into v_branches   from public.branches;
  select count(*) into v_attendance from public.attendance;
  select count(*) into v_profiles   from public.profiles;
  select id into v_target from public.employees where email = 'angela@hirara.demo';
  select id into v_target_profile from public.profiles where role = 'employee' limit 1;

  perform pg_temp.act_as(p_email);

  perform pg_temp.t('admin', 'sees every employee',   (select count(*) from public.employees)  = v_employees);
  perform pg_temp.t('admin', 'sees every branch',     (select count(*) from public.branches)   = v_branches);
  perform pg_temp.t('admin', 'sees all attendance',   (select count(*) from public.attendance) = v_attendance and v_attendance > 0);
  perform pg_temp.t('admin', 'sees every login profile', (select count(*) from public.profiles) = v_profiles);
  perform pg_temp.t('admin', 'can read company settings', (select count(*) from public.company_settings) = 1);

  perform pg_temp.t('admin', 'can add a branch',
    pg_temp.allowed($q$ insert into public.branches (name) values ('Test Branch') $q$));
  perform pg_temp.t('admin', 'can edit an employee',
    pg_temp.allowed(format($q$ update public.employees set job_title = 'Test title' where id = %L $q$, v_target)));
  perform pg_temp.t('admin', 'can deactivate an employee',
    pg_temp.allowed(format($q$ update public.employees set active = false where id = %L $q$, v_target)));
  perform pg_temp.t('admin', 'can change a login role',
    pg_temp.allowed(format($q$ update public.profiles set role = 'manager' where id = %L $q$, v_target_profile)));
  perform pg_temp.t('admin', 'can change company settings',
    pg_temp.allowed($q$ update public.company_settings set grace_minutes = 15 $q$));
  perform pg_temp.t('admin', 'can add a shift template',
    pg_temp.allowed($q$ insert into public.shift_templates (name, start_time, end_time) values ('Test shift', '09:00', '18:00') $q$));

  perform pg_temp.t('admin', 'cannot write attendance directly (must use server functions)',
    pg_temp.blocked(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in)
      select id, branch_id, current_date + 20, now() + interval '20 days' from public.employees where id = %L
    $q$, v_target)));
  perform pg_temp.t('admin', 'cannot edit the audit log',
    pg_temp.blocked($q$ update public.audit_log set action = 'tampered' $q$));
  perform pg_temp.t('admin', 'cannot delete from the audit log',
    pg_temp.blocked($q$ delete from public.audit_log $q$));

  -- A real (kept) change, to prove the audit log records who did it.
  update public.company_settings set updated_at = now();
  perform pg_temp.t('admin', 'audit log records who made a change',
    exists (select 1 from public.audit_log
            where table_name = 'company_settings' and actor_id = auth.uid()));

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;

-- ---------- 3. A store manager ----------
create or replace function pg_temp.run_manager(p_email text, p_foreign_email text) returns void
language plpgsql as $fn$
declare
  v_branch uuid; v_in_branch bigint; v_att_in_branch bigint; v_other_att bigint;
  v_staff uuid; v_foreign uuid; v_foreign_branch uuid;
begin
  perform set_config('role', 'none', true);
  select branch_id into v_branch from public.employees where email = p_email;
  select count(*) into v_in_branch      from public.employees  where branch_id = v_branch;
  select count(*) into v_att_in_branch  from public.attendance where branch_id = v_branch;
  select count(*) into v_other_att      from public.attendance where branch_id <> v_branch;
  select id into v_staff from public.employees where branch_id = v_branch and email <> p_email limit 1;
  select id, branch_id into v_foreign, v_foreign_branch from public.employees where email = p_foreign_email;

  perform pg_temp.act_as(p_email);

  perform pg_temp.t('manager', 'sees only employees in their own branch',
    (select count(*) from public.employees) = v_in_branch and v_in_branch > 1);
  perform pg_temp.t('manager', 'cannot see employees of another branch',
    (select count(*) from public.employees where branch_id <> v_branch) = 0);
  perform pg_temp.t('manager', 'sees attendance of their own branch',
    (select count(*) from public.attendance) = v_att_in_branch and v_att_in_branch > 0);
  perform pg_temp.t('manager', 'cannot see attendance of another branch',
    v_other_att > 0 and (select count(*) from public.attendance where branch_id <> v_branch) = 0);
  perform pg_temp.t('manager', 'sees only their own login profile',
    (select count(*) from public.profiles) = 1);
  perform pg_temp.t('manager', 'cannot read the audit log',
    (select count(*) from public.audit_log) = 0);
  perform pg_temp.t('manager', 'can read branches and company settings',
    (select count(*) from public.branches) >= 1 and (select count(*) from public.company_settings) = 1);

  perform pg_temp.t('manager', 'cannot edit an employee',
    pg_temp.blocked(format($q$ update public.employees set job_title = 'Boss' where id = %L $q$, v_staff)));
  perform pg_temp.t('manager', 'cannot add a branch',
    pg_temp.blocked($q$ insert into public.branches (name) values ('Rogue Branch') $q$));
  perform pg_temp.t('manager', 'cannot promote themselves to admin',
    pg_temp.blocked($q$ update public.profiles set role = 'admin' where id = auth.uid() $q$));
  perform pg_temp.t('manager', 'cannot change company settings',
    pg_temp.blocked($q$ update public.company_settings set grace_minutes = 120 $q$));
  perform pg_temp.t('manager', 'cannot write attendance directly',
    pg_temp.blocked(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in)
      values (%L, %L, current_date + 20, now() + interval '20 days')
    $q$, v_staff, v_branch)));

  perform pg_temp.t('manager', 'can schedule an employee in their own branch',
    pg_temp.allowed(format($q$
      insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at)
      values (%L, %L, current_date + 30, now() + interval '30 days', now() + interval '30 days 8 hours')
    $q$, v_staff, v_branch)));
  perform pg_temp.t('manager', 'cannot schedule an employee of another branch',
    pg_temp.blocked(format($q$
      insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at)
      values (%L, %L, current_date + 30, now() + interval '30 days', now() + interval '30 days 8 hours')
    $q$, v_foreign, v_foreign_branch)));
  perform pg_temp.t('manager', 'cannot move a schedule into another branch',
    pg_temp.blocked(format($q$
      insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at)
      values (%L, %L, current_date + 30, now() + interval '30 days', now() + interval '30 days 8 hours')
    $q$, v_staff, v_foreign_branch)));

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;

-- ---------- 4. An ordinary employee ----------
create or replace function pg_temp.run_employee(p_email text, p_other_email text) returns void
language plpgsql as $fn$
declare
  v_self uuid; v_branch uuid; v_own_att bigint; v_own_att_id uuid;
  v_other uuid; v_other_att bigint;
begin
  perform set_config('role', 'none', true);
  select id, branch_id into v_self, v_branch from public.employees where email = p_email;
  select count(*) into v_own_att from public.attendance where employee_id = v_self;
  select id into v_own_att_id from public.attendance where employee_id = v_self order by clock_in limit 1;
  select id into v_other from public.employees where email = p_other_email;
  select count(*) into v_other_att from public.attendance where employee_id = v_other;

  perform pg_temp.act_as(p_email);

  perform pg_temp.t(p_email, 'sees only their own employee record',
    (select count(*) from public.employees) = 1
    and exists (select 1 from public.employees where id = v_self));
  perform pg_temp.t(p_email, 'sees only their own attendance',
    (select count(*) from public.attendance) = v_own_att and v_own_att > 0);
  perform pg_temp.t(p_email, 'cannot see a coworker''s attendance',
    v_other_att > 0 and (select count(*) from public.attendance where employee_id = v_other) = 0);
  perform pg_temp.t(p_email, 'sees only their own login profile',
    (select count(*) from public.profiles) = 1);
  perform pg_temp.t(p_email, 'cannot read the audit log',
    (select count(*) from public.audit_log) = 0);
  perform pg_temp.t(p_email, 'can read branches and company settings',
    (select count(*) from public.branches) >= 1 and (select count(*) from public.company_settings) = 1);

  perform pg_temp.t(p_email, 'cannot edit their own employee record',
    pg_temp.blocked(format($q$ update public.employees set job_title = 'Director' where id = %L $q$, v_self)));
  perform pg_temp.t(p_email, 'cannot edit a coworker''s employee record',
    pg_temp.blocked(format($q$ update public.employees set job_title = 'Intern' where id = %L $q$, v_other)));
  perform pg_temp.t(p_email, 'cannot promote themselves to admin',
    pg_temp.blocked($q$ update public.profiles set role = 'admin' where id = auth.uid() $q$));
  perform pg_temp.t(p_email, 'cannot clock in by writing attendance directly',
    pg_temp.blocked(format($q$
      insert into public.attendance (employee_id, branch_id, work_date, clock_in)
      values (%L, %L, current_date + 20, now() + interval '20 days')
    $q$, v_self, v_branch)));
  perform pg_temp.t(p_email, 'cannot edit their own attendance',
    pg_temp.blocked(format($q$ update public.attendance set clock_out = now() where id = %L $q$, v_own_att_id)));
  perform pg_temp.t(p_email, 'cannot delete their own attendance',
    pg_temp.blocked(format($q$ delete from public.attendance where id = %L $q$, v_own_att_id)));
  perform pg_temp.t(p_email, 'cannot create a schedule',
    pg_temp.blocked(format($q$
      insert into public.schedules (employee_id, branch_id, work_date, start_at, end_at)
      values (%L, %L, current_date + 30, now() + interval '30 days', now() + interval '30 days 8 hours')
    $q$, v_self, v_branch)));

  perform pg_temp.t(p_email, 'can request a correction for their own record',
    pg_temp.allowed(format($q$
      insert into public.corrections (employee_id, attendance_id, requested_clock_in, requested_clock_out, reason)
      values (%L, %L, now() - interval '9 hours', now() - interval '1 hour', 'Forgot to clock out')
    $q$, v_self, v_own_att_id)));
  perform pg_temp.t(p_email, 'cannot request a correction for someone else',
    pg_temp.blocked(format($q$
      insert into public.corrections (employee_id, requested_clock_in, reason)
      values (%L, now() - interval '9 hours', 'Not my record')
    $q$, v_other)));
  perform pg_temp.t(p_email, 'cannot approve their own correction',
    pg_temp.blocked(format($q$
      insert into public.corrections (employee_id, requested_clock_in, reason, status)
      values (%L, now() - interval '9 hours', 'Approve me', 'approved')
    $q$, v_self)));

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;

-- ---------- 5. Who can see a correction request ----------
create or replace function pg_temp.run_corrections(
  p_employee text, p_manager text, p_other_employee text, p_admin text
) returns void
language plpgsql as $fn$
declare
  v_emp uuid; v_att uuid;
  v_self bigint; v_mgr bigint; v_other bigint; v_admin bigint;
begin
  perform set_config('role', 'none', true);
  select id into v_emp from public.employees where email = p_employee;
  select id into v_att from public.attendance where employee_id = v_emp order by clock_in limit 1;

  begin
    perform pg_temp.act_as(p_employee);
    insert into public.corrections (employee_id, attendance_id, requested_clock_in, requested_clock_out, reason)
    values (v_emp, v_att, now() - interval '9 hours', now() - interval '1 hour', 'Forgot to clock out');
    select count(*) into v_self from public.corrections;

    perform pg_temp.act_as(p_manager);
    select count(*) into v_mgr from public.corrections;

    perform pg_temp.act_as(p_other_employee);
    select count(*) into v_other from public.corrections;

    perform pg_temp.act_as(p_admin);
    select count(*) into v_admin from public.corrections;

    raise exception 'rollback_marker';       -- undo the test request
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;

  perform set_config('role', 'none', true);
  perform pg_temp.t('corrections', 'the employee sees their own request',          v_self  = 1);
  perform pg_temp.t('corrections', 'their branch manager sees it',                 v_mgr   = 1);
  perform pg_temp.t('corrections', 'an employee of another branch cannot see it',  v_other = 0);
  perform pg_temp.t('corrections', 'the admin sees it',                            v_admin = 1);
end
$fn$;

-- ---------- 6. Deactivated users are locked out by the database ----------
create or replace function pg_temp.run_lockout(p_admin text, p_employee text) returns void
language plpgsql as $fn$
declare
  a_emp bigint; a_att bigint; a_branch bigint; a_prof bigint;
  b_emp bigint; b_att bigint; b_branch bigint; b_prof bigint;
  v_emp uuid;
begin
  perform set_config('role', 'none', true);
  select id into v_emp from public.employees where email = p_employee;

  -- Case A: the admin deactivates the EMPLOYEE RECORD
  begin
    perform pg_temp.act_as(p_admin);
    update public.employees set active = false where id = v_emp;
    perform pg_temp.act_as(p_employee);
    select count(*) into a_emp    from public.employees;
    select count(*) into a_att    from public.attendance;
    select count(*) into a_branch from public.branches;
    select count(*) into a_prof   from public.profiles;
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;

  -- Case B: the admin switches off the LOGIN
  begin
    perform pg_temp.act_as(p_admin);
    update public.profiles set active = false where email = p_employee;
    perform pg_temp.act_as(p_employee);
    select count(*) into b_emp    from public.employees;
    select count(*) into b_att    from public.attendance;
    select count(*) into b_branch from public.branches;
    select count(*) into b_prof   from public.profiles;
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;

  perform set_config('role', 'none', true);
  perform pg_temp.t('lockout', 'deactivated employee sees no employee data',      a_emp = 0 and a_prof = 0);
  perform pg_temp.t('lockout', 'deactivated employee sees no attendance',         a_att = 0);
  perform pg_temp.t('lockout', 'deactivated employee sees no branches',           a_branch = 0);
  perform pg_temp.t('lockout', 'a switched-off login sees no employee data',      b_emp = 0 and b_prof = 0);
  perform pg_temp.t('lockout', 'a switched-off login sees no attendance',         b_att = 0);
  perform pg_temp.t('lockout', 'a switched-off login sees no branches',           b_branch = 0);
end
$fn$;

-- ---------- 7. Someone who is not signed in ----------
create or replace function pg_temp.run_anon() returns void
language plpgsql as $fn$
begin
  perform set_config('role', 'anon', true);
  perform pg_temp.t('anonymous', 'cannot read employees',    pg_temp.blocked($q$ select * from public.employees $q$));
  perform pg_temp.t('anonymous', 'cannot read attendance',   pg_temp.blocked($q$ select * from public.attendance $q$));
  perform pg_temp.t('anonymous', 'cannot read branches',     pg_temp.blocked($q$ select * from public.branches $q$));
  perform pg_temp.t('anonymous', 'cannot read the audit log',pg_temp.blocked($q$ select * from public.audit_log $q$));
  perform pg_temp.t('anonymous', 'cannot add an employee',
    pg_temp.blocked($q$ insert into public.employees (full_name, email, branch_id) select 'X', 'x@x.com', id from public.branches limit 1 $q$));
  perform set_config('role', 'none', true);
end
$fn$;


-- ---------- 8. Stage 2: admin-created logins ----------
create or replace function pg_temp.run_stage2(
  p_admin text, p_manager text, p_employee text, p_other_employee text
) returns void
language plpgsql as $fn$
declare
  v_emp_flag boolean; v_other_flag boolean;
begin
  perform set_config('role', 'none', true);

  perform pg_temp.t('stage 2', 'profiles has a must_change_password flag',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles'
              and column_name = 'must_change_password'));
  perform pg_temp.t('stage 2', 'signed-out visitors cannot call finish_password_change',
    not has_function_privilege('anon', 'public.finish_password_change()', 'execute'));
  perform pg_temp.t('stage 2', 'signed-in users can call finish_password_change',
    has_function_privilege('authenticated', 'public.finish_password_change()', 'execute'));
  perform pg_temp.t('stage 2', 'finish_password_change runs with a locked search path',
    exists (select 1
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'finish_password_change'
              and p.prosecdef
              and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')));

  -- The server functions use the service_role key. It must be able to do its job.
  perform pg_temp.t('stage 2', 'the server role can read profiles and employees',
    has_table_privilege('service_role', 'public.profiles', 'select')
    and has_table_privilege('service_role', 'public.employees', 'select'));
  perform pg_temp.t('stage 2', 'the server role can update profiles and write the audit log',
    has_table_privilege('service_role', 'public.profiles', 'update')
    and has_table_privilege('service_role', 'public.audit_log', 'insert'));

  -- Nobody can clear the flag with a plain update, not even an admin.
  perform pg_temp.act_as(p_employee);
  perform pg_temp.t('stage 2', 'an employee cannot clear the flag with an update',
    pg_temp.blocked($q$ update public.profiles set must_change_password = false where id = auth.uid() $q$));
  perform pg_temp.act_as(p_manager);
  perform pg_temp.t('stage 2', 'a manager cannot clear the flag with an update',
    pg_temp.blocked($q$ update public.profiles set must_change_password = false where id = auth.uid() $q$));
  perform pg_temp.act_as(p_admin);
  perform pg_temp.t('stage 2', 'an admin cannot edit the flag from the app (only the server function does)',
    pg_temp.blocked($q$ update public.profiles set must_change_password = false $q$));

  -- finish_password_change clears only the caller's own flag.
  begin
    perform set_config('role', 'none', true);
    update public.profiles set must_change_password = true
      where email in (p_employee, p_other_employee);
    perform pg_temp.act_as(p_employee);
    perform public.finish_password_change();
    perform set_config('role', 'none', true);
    select must_change_password into v_emp_flag   from public.profiles where email = p_employee;
    select must_change_password into v_other_flag from public.profiles where email = p_other_employee;
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;

  perform set_config('role', 'none', true);
  perform pg_temp.t('stage 2', 'finish_password_change clears the caller''s own flag', v_emp_flag = false);
  perform pg_temp.t('stage 2', 'finish_password_change leaves other people''s flags alone', v_other_flag = true);

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;


-- ---------- 9. Stage 3: clock in / clock out run on the server ----------
-- Runs a statement and returns its error message ('ok' if it worked).
create or replace function pg_temp.msg(p_sql text) returns text
language plpgsql as $fn$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end
$fn$;

create or replace function pg_temp.run_stage3(
  p_admin text, p_manager text, p_employee text, p_other_employee text
) returns void
language plpgsql as $fn$
declare
  v_emp uuid; v_branch uuid; v_uid uuid; v_other_branch uuid;
  r_in public.attendance; r_out public.attendance;
  e_dup text; e_out2 text; e_again text; n_audit bigint;
  e_john text; e_admin_in text; e_admin_out text; r_mgr public.attendance;
  e_stale_out text; r_new public.attendance; stale_closed boolean; stale_flagged boolean;
  e_inactive text;
  r_k public.attendance; r_p public.attendance; tz_k date; tz_p date;
  e_locked text; e_free text; st_diff double precision;
begin
  perform set_config('role', 'none', true);
  select id, branch_id into v_emp, v_branch from public.employees where email = p_employee;
  select id into v_uid from auth.users where email = p_employee;

  -- Static checks
  perform pg_temp.t('stage 3', 'clock_in and clock_out take no inputs (nobody can act for someone else)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('clock_in', 'clock_out') and p.pronargs = 0) = 2);
  perform pg_temp.t('stage 3', 'clock functions are definers with a locked search path',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('clock_in', 'clock_out') and p.prosecdef
       and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 2);
  perform pg_temp.t('stage 3', 'signed-out visitors cannot clock in, clock out, or read server time',
    not has_function_privilege('anon', 'public.clock_in()', 'execute')
    and not has_function_privilege('anon', 'public.clock_out()', 'execute')
    and not has_function_privilege('anon', 'public.server_time()', 'execute'));
  perform pg_temp.t('stage 3', 'signed-in users can call the clock functions and server_time',
    has_function_privilege('authenticated', 'public.clock_in()', 'execute')
    and has_function_privilege('authenticated', 'public.clock_out()', 'execute')
    and has_function_privilege('authenticated', 'public.server_time()', 'execute'));

  -- A. The normal flow for one employee
  begin
    perform pg_temp.act_as(p_employee);
    select * into r_in from public.clock_in();
    e_dup := pg_temp.msg('select public.clock_in()');
    select * into r_out from public.clock_out();
    e_out2 := pg_temp.msg('select public.clock_out()');
    e_again := pg_temp.msg('select public.clock_in()');
    perform set_config('role', 'none', true);
    select count(*) into n_audit from public.audit_log
      where table_name = 'attendance' and action = 'INSERT'
        and actor_id = v_uid and record_id = r_in.id::text;
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.t('stage 3', 'clock_in records the signed-in employee at their branch',
    r_in.employee_id = v_emp and r_in.branch_id = v_branch and r_in.clock_out is null and r_in.source = 'self');
  perform pg_temp.t('stage 3', 'the clock-in time comes from the database clock',
    abs(extract(epoch from (r_in.clock_in - clock_timestamp()))) < 5);
  perform pg_temp.t('stage 3', 'a second clock-in is refused while a shift is open', e_dup = 'already_clocked_in');
  perform pg_temp.t('stage 3', 'clock_out closes the same shift after the clock-in',
    r_out.id = r_in.id and r_out.clock_out > r_out.clock_in);
  perform pg_temp.t('stage 3', 'a second clock-out is refused', e_out2 = 'not_clocked_in');
  perform pg_temp.t('stage 3', 'clocking in again after finishing is refused (one shift per day)',
    e_again = 'already_completed_today');
  perform pg_temp.t('stage 3', 'clock-in is written to the audit log with the employee as actor', n_audit = 1);

  -- B. Other people
  begin
    perform pg_temp.act_as(p_other_employee);
    e_john := pg_temp.msg('select public.clock_out()');
    perform pg_temp.act_as(p_admin);
    e_admin_in  := pg_temp.msg('select public.clock_in()');
    e_admin_out := pg_temp.msg('select public.clock_out()');
    perform pg_temp.act_as(p_manager);
    select * into r_mgr from public.clock_in();
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.t('stage 3', 'clocking out without a shift is refused', e_john = 'not_clocked_in');
  perform pg_temp.t('stage 3', 'an admin (no employee record) cannot clock in or out',
    e_admin_in = 'no_employee' and e_admin_out = 'no_employee');
  perform pg_temp.t('stage 3', 'a manager can clock in, for themselves only',
    r_mgr.employee_id = (select id from public.employees where email = p_manager));

  -- C. A shift open for 30 hours is a missed time-out
  begin
    delete from public.attendance where employee_id = v_emp;
    insert into public.attendance (employee_id, branch_id, work_date, clock_in)
    select v_emp, v_branch,
           ((clock_timestamp() - interval '30 hours') at time zone b.timezone)::date,
           clock_timestamp() - interval '30 hours'
    from public.branches b where b.id = v_branch;
    perform pg_temp.act_as(p_employee);
    e_stale_out := pg_temp.msg('select public.clock_out()');
    perform set_config('role', 'none', true);
    select (clock_out is not null) into stale_closed from public.attendance
      where employee_id = v_emp and clock_in < clock_timestamp() - interval '29 hours';
    perform pg_temp.act_as(p_employee);
    select * into r_new from public.clock_in();
    perform set_config('role', 'none', true);
    select missed_timeout into stale_flagged from public.attendance
      where employee_id = v_emp and clock_in < clock_timestamp() - interval '29 hours';
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.t('stage 3', 'a shift open for 30 hours cannot be closed by the employee',
    e_stale_out = 'not_clocked_in' and stale_closed = false);
  perform pg_temp.t('stage 3', 'a missed time-out is flagged and does not block the next clock-in',
    stale_flagged = true and r_new.clock_out is null and r_new.employee_id = v_emp);

  -- D. A deactivated employee
  begin
    update public.employees set active = false where id = v_emp;
    perform pg_temp.act_as(p_employee);
    e_inactive := pg_temp.msg('select public.clock_in()');
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.t('stage 3', 'a deactivated employee cannot clock in', e_inactive = 'no_employee');

  -- E. The work date is the BRANCH's calendar day (two far-apart time zones)
  begin
    delete from public.attendance where employee_id = v_emp;   -- sample history would clash with some dates
    update public.branches set timezone = 'Pacific/Kiritimati' where id = v_branch;
    perform pg_temp.act_as(p_employee);
    select * into r_k from public.clock_in();
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  begin
    delete from public.attendance where employee_id = v_emp;   -- sample history would clash with some dates
    update public.branches set timezone = 'Pacific/Pago_Pago' where id = v_branch;
    perform pg_temp.act_as(p_employee);
    select * into r_p from public.clock_in();
    raise exception 'rollback_marker';
  exception when others then
    if sqlerrm <> 'rollback_marker' then raise; end if;
  end;
  perform set_config('role', 'none', true);
  tz_k := (r_k.clock_in at time zone 'Pacific/Kiritimati')::date;
  tz_p := (r_p.clock_in at time zone 'Pacific/Pago_Pago')::date;
  perform pg_temp.t('stage 3', 'work date follows the branch time zone',
    r_k.work_date = tz_k and r_p.work_date = tz_p and r_k.work_date <> r_p.work_date);

  -- F. Email lock
  e_locked := pg_temp.msg($q$ update public.employees set email = 'changed@hirara.demo' where email = 'maria@hirara.demo' $q$);
  e_free   := pg_temp.msg($q$ update public.employees set email = 'mark.new@hirara.demo' where email = 'mark@hirara.demo' $q$);
  -- (the update on Mark is permanent unless undone)
  update public.employees set email = 'mark@hirara.demo' where email = 'mark.new@hirara.demo';
  perform pg_temp.t('stage 3', 'an email cannot change while the employee has a login', e_locked = 'email_locked');
  perform pg_temp.t('stage 3', 'an email can change when the employee has no login', e_free = 'ok');

  -- G. server_time
  perform pg_temp.act_as(p_employee);
  select abs(extract(epoch from (public.server_time() - clock_timestamp()))) into st_diff;
  perform pg_temp.t('stage 3', 'server_time returns the database clock', st_diff < 5);

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;

-- ---------- Run everything ----------
select pg_temp.run_constraints();
select pg_temp.run_admin('admin@hirara.demo');
select pg_temp.run_manager('paolo@hirara.demo', 'john@hirara.demo');
select pg_temp.run_employee('maria@hirara.demo', 'angela@hirara.demo');
select pg_temp.run_employee('john@hirara.demo', 'maria@hirara.demo');
select pg_temp.run_corrections('maria@hirara.demo', 'paolo@hirara.demo', 'john@hirara.demo', 'admin@hirara.demo');
select pg_temp.run_lockout('admin@hirara.demo', 'maria@hirara.demo');
select pg_temp.run_anon();
select pg_temp.run_stage2('admin@hirara.demo', 'paolo@hirara.demo', 'maria@hirara.demo', 'john@hirara.demo');
select pg_temp.run_stage3('admin@hirara.demo', 'paolo@hirara.demo', 'maria@hirara.demo', 'john@hirara.demo');

-- ---------- Report (the last statement, so the editor shows it) ----------
select result, area, label
from (
  select 0 as o, 0 as n,
         case when count(*) filter (where not pass) = 0 then 'ALL PASS' else 'SOME FAILED' end as result,
         'summary' as area,
         count(*) filter (where pass) || ' passed, ' || count(*) filter (where not pass) || ' failed' as label
  from results
  union all
  select 1, n, case when pass then 'PASS' else 'FAIL' end, area, label from results
) r
order by o, case when o = 1 and result = 'FAIL' then 0 else 1 end, n;