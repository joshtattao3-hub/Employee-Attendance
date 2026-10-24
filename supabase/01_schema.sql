-- =====================================================================
-- Hirara attendance: Stage 1, database schema
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
--
-- What this creates:
--   * 9 tables (branches, employees, profiles, shifts, attendance, ...)
--   * rules the database enforces by itself (no double clock-ins, etc.)
--   * Row Level Security (RLS): who may read or change which rows
--   * an audit log that records every change
--
-- Safety notes:
--   * Every table has RLS ON. A table with RLS on and no policy is
--     locked, so anything not allowed below is denied.
--   * The "anon" role (not signed in) gets no access at all.
--   * Clock in/out will go through server functions (Stage 3), so the
--     attendance table has NO insert/update/delete access from the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions and a private schema for helper functions
-- ---------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

-- "app" holds helper functions used by the policies. It is NOT exposed
-- through the API (only "public" is), so the app cannot call them directly.
create schema if not exists app;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- A store / location. Each branch has its own time zone.
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  timezone    text not null default 'Asia/Manila',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint branches_name_not_blank check (btrim(name) <> '')
);
create unique index branches_name_key on public.branches (lower(name));

-- Company-wide rules. Exactly one row (id is forced to 1).
create table public.company_settings (
  id                    integer primary key default 1,
  company_name          text not null default 'Hirara',
  grace_minutes         integer not null default 10  check (grace_minutes between 0 and 120),
  break_minutes         integer not null default 60  check (break_minutes between 0 and 240),
  overtime_after_hours  numeric(4,2) not null default 8 check (overtime_after_hours between 1 and 24),
  max_shift_hours       integer not null default 16  check (max_shift_hours between 4 and 24),
  updated_at            timestamptz not null default now(),
  constraint company_settings_single_row check (id = 1)
);
insert into public.company_settings default values;

-- Human-friendly employee codes: EMP001, EMP002, ...
create sequence public.employee_code_seq;

-- The HR record for a person. Not the same thing as a login (see profiles).
create table public.employees (
  id             uuid primary key default gen_random_uuid(),
  employee_code  text not null unique
                   default ('EMP' || lpad(nextval('public.employee_code_seq')::text, 3, '0')),
  full_name      text not null,
  email          text not null,
  branch_id      uuid not null references public.branches(id) on delete restrict,
  job_title      text,
  active         boolean not null default true,
  hired_on       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint employees_name_not_blank check (btrim(full_name) <> ''),
  constraint employees_email_lowercase check (email = lower(btrim(email)) and position('@' in email) > 1)
);
create unique index employees_email_key on public.employees (email);
create index employees_branch_idx on public.employees (branch_id);

-- A login (Supabase Auth user) plus its role. This is what the database
-- checks on every request. Admins have no employee record.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  role         text not null default 'employee' check (role in ('admin', 'manager', 'employee')),
  employee_id  uuid unique references public.employees(id) on delete restrict,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint profiles_staff_need_employee check (role = 'admin' or employee_id is not null)
);

-- Reusable shift definitions, e.g. "Opening 08:00 to 17:00".
create table public.shift_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  start_time      time not null,
  end_time        time not null,
  break_minutes   integer not null default 60 check (break_minutes between 0 and 240),
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint shift_templates_name_not_blank check (btrim(name) <> '')
);
create unique index shift_templates_name_key on public.shift_templates (lower(name));

-- A concrete scheduled shift for one employee on one day.
create table public.schedules (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete restrict,
  branch_id      uuid not null references public.branches(id) on delete restrict,
  template_id    uuid references public.shift_templates(id) on delete set null,
  work_date      date not null,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  break_minutes  integer check (break_minutes between 0 and 240),
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint schedules_end_after_start check (end_at > start_at),
  constraint schedules_max_length check (end_at - start_at <= interval '16 hours'),
  -- one person cannot be scheduled for two overlapping shifts
  constraint schedules_no_overlap exclude using gist (
    employee_id with =,
    tstzrange(start_at, end_at) with &&
  )
);
create index schedules_branch_date_idx on public.schedules (branch_id, work_date);

-- One row per worked shift. Times are real UTC timestamps.
-- An open shift has clock_out = null. A shift that was never closed in
-- time gets missed_timeout = true (set by a server function in Stage 3).
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete restrict,
  branch_id       uuid not null references public.branches(id) on delete restrict,
  schedule_id     uuid references public.schedules(id) on delete set null,
  work_date       date not null,
  clock_in        timestamptz not null default now(),
  clock_out       timestamptz,
  missed_timeout  boolean not null default false,
  source          text not null default 'self' check (source in ('self', 'correction', 'admin')),
  note            text,
  created_at      timestamptz not null default now(),
  constraint attendance_out_after_in check (clock_out is null or clock_out > clock_in),
  constraint attendance_missed_is_open check (not (missed_timeout and clock_out is not null)),
  -- no overlapping shifts for one person. A "missed" record counts as
  -- zero length so it never blocks the next clock-in.
  constraint attendance_no_overlap exclude using gist (
    employee_id with =,
    tstzrange(
      clock_in,
      coalesce(clock_out, case when missed_timeout then clock_in else 'infinity'::timestamptz end)
    ) with &&
  )
);
-- at most one open (not yet closed, not missed) shift per employee
create unique index attendance_one_open_per_employee
  on public.attendance (employee_id)
  where clock_out is null and not missed_timeout;
create index attendance_employee_idx on public.attendance (employee_id, clock_in desc);
create index attendance_branch_date_idx on public.attendance (branch_id, work_date);

-- A request to fix a record (for example a forgotten time-out).
create table public.corrections (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id) on delete restrict,
  attendance_id        uuid references public.attendance(id) on delete set null,
  requested_clock_in   timestamptz not null,
  requested_clock_out  timestamptz,
  reason               text not null,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at         timestamptz not null default now(),
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  review_note          text,
  constraint corrections_reason_length check (char_length(btrim(reason)) between 3 and 500),
  constraint corrections_times check (requested_clock_out is null or requested_clock_out > requested_clock_in)
);
create index corrections_employee_idx on public.corrections (employee_id);
create index corrections_status_idx on public.corrections (status);

-- Who changed what, and when. Filled automatically by triggers.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------
-- 2. Helper functions used by the policies
--    SECURITY DEFINER = they read tables with the owner's rights, which
--    avoids policies that call themselves forever. search_path is locked
--    so nobody can swap in look-alike tables.
-- ---------------------------------------------------------------------

-- The signed-in user's role, or null if they are signed out, have no
-- profile, or were deactivated (profile or employee record).
create function app.my_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.role
  from public.profiles p
  left join public.employees e on e.id = p.employee_id
  where p.id = auth.uid()
    and p.active
    and (p.employee_id is null or e.active)
$$;

-- The signed-in user's employee record (null for admins / deactivated).
create function app.my_employee_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.employee_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where p.id = auth.uid() and p.active and e.active
$$;

-- The branch of the signed-in employee or manager.
create function app.my_branch_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select e.branch_id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where p.id = auth.uid() and p.active and e.active
$$;

create function app.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(app.my_role() = 'admin', false) $$;

create function app.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(app.my_role() = 'manager', false) $$;

-- Which branch an employee belongs to.
create function app.branch_of(p_employee_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select branch_id from public.employees where id = p_employee_id $$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

create function app.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function app.set_updated_at();

-- Reject made-up time zones, which would break date calculations later.
create function app.validate_timezone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
end
$$;

create trigger branches_validate_timezone
  before insert or update of timezone on public.branches
  for each row execute function app.validate_timezone();

-- When a login is created, link it to the employee with the same email.
-- No matching employee = no profile = no access (RLS denies everything).
create function app.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee_id uuid;
begin
  select e.id into v_employee_id
  from public.employees e
  where lower(e.email) = lower(new.email)
    and not exists (select 1 from public.profiles p where p.employee_id = e.id)
  limit 1;

  if v_employee_id is not null then
    insert into public.profiles (id, email, role, employee_id)
    values (new.id, lower(new.email), 'employee', v_employee_id);
  end if;

  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Record every insert / update / delete in audit_log.
create function app.log_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'company_settings', 'employees', 'profiles',
    'shift_templates', 'schedules', 'attendance', 'corrections'
  ]
  loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function app.log_change()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.branches         enable row level security;
alter table public.company_settings enable row level security;
alter table public.employees        enable row level security;
alter table public.profiles         enable row level security;
alter table public.shift_templates  enable row level security;
alter table public.schedules        enable row level security;
alter table public.attendance       enable row level security;
alter table public.corrections      enable row level security;
alter table public.audit_log        enable row level security;

-- branches: every active user can read; only admins change them
create policy branches_select on public.branches
  for select to authenticated
  using (app.my_role() is not null);
create policy branches_insert on public.branches
  for insert to authenticated with check (app.is_admin());
create policy branches_update on public.branches
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy branches_delete on public.branches
  for delete to authenticated using (app.is_admin());

-- company_settings: every active user can read; only admins change
create policy settings_select on public.company_settings
  for select to authenticated
  using (app.my_role() is not null);
create policy settings_update on public.company_settings
  for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- employees: admin sees all, manager sees own branch, employee sees self
create policy employees_select on public.employees
  for select to authenticated
  using (
    app.is_admin()
    or id = app.my_employee_id()
    or (app.is_manager() and branch_id = app.my_branch_id())
  );
create policy employees_insert on public.employees
  for insert to authenticated with check (app.is_admin());
create policy employees_update on public.employees
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy employees_delete on public.employees
  for delete to authenticated using (app.is_admin());

-- profiles: you see your own; admins see and edit all. Nobody inserts or
-- deletes from the app (the signup trigger and Auth do that).
create policy profiles_select on public.profiles
  for select to authenticated
  using (app.is_admin() or (id = auth.uid() and app.my_role() is not null));
create policy profiles_update on public.profiles
  for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- shift_templates: every active user can read; only admins change
create policy templates_select on public.shift_templates
  for select to authenticated
  using (app.my_role() is not null);
create policy templates_insert on public.shift_templates
  for insert to authenticated with check (app.is_admin());
create policy templates_update on public.shift_templates
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy templates_delete on public.shift_templates
  for delete to authenticated using (app.is_admin());

-- schedules: admin all; manager their own branch; employee reads own
create policy schedules_select on public.schedules
  for select to authenticated
  using (
    app.is_admin()
    or employee_id = app.my_employee_id()
    or (app.is_manager() and branch_id = app.my_branch_id())
  );
create policy schedules_insert on public.schedules
  for insert to authenticated
  with check (
    app.is_admin()
    or (app.is_manager()
        and branch_id = app.my_branch_id()
        and app.branch_of(employee_id) = branch_id)
  );
create policy schedules_update on public.schedules
  for update to authenticated
  using (app.is_admin() or (app.is_manager() and branch_id = app.my_branch_id()))
  with check (
    app.is_admin()
    or (app.is_manager()
        and branch_id = app.my_branch_id()
        and app.branch_of(employee_id) = branch_id)
  );
create policy schedules_delete on public.schedules
  for delete to authenticated
  using (app.is_admin() or (app.is_manager() and branch_id = app.my_branch_id()));

-- attendance: READ ONLY from the app. Writes happen through server
-- functions (Stage 3), which use the database clock.
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    app.is_admin()
    or employee_id = app.my_employee_id()
    or (app.is_manager() and branch_id = app.my_branch_id())
  );

-- corrections: employees file requests for themselves; approvals go
-- through server functions (Stage 7).
create policy corrections_select on public.corrections
  for select to authenticated
  using (
    app.is_admin()
    or employee_id = app.my_employee_id()
    or (app.is_manager() and app.branch_of(employee_id) = app.my_branch_id())
  );
create policy corrections_insert on public.corrections
  for insert to authenticated
  with check (
    employee_id = app.my_employee_id()
    and (
      attendance_id is null
      or exists (
        select 1 from public.attendance a
        where a.id = attendance_id and a.employee_id = corrections.employee_id
      )
    )
  );

-- audit_log: admins can read. Nobody can write from the app.
create policy audit_select on public.audit_log
  for select to authenticated
  using (app.is_admin());

-- ---------------------------------------------------------------------
-- 5. Privileges (the first gate; RLS is the second)
--    Start from nothing, then grant only what is needed.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Tables created later in "public" are NOT auto-exposed to the API.
-- Each new table must get explicit grants and RLS policies.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

grant select on
  public.branches, public.company_settings, public.employees, public.profiles,
  public.shift_templates, public.schedules, public.attendance,
  public.corrections, public.audit_log
to authenticated;

grant insert, update, delete on
  public.branches, public.employees, public.shift_templates, public.schedules
to authenticated;

grant update on public.company_settings to authenticated;

-- Admins may change only these profile columns (never id or email).
grant update (role, employee_id, active) on public.profiles to authenticated;

-- Employees choose only these fields when filing a correction. Status,
-- reviewer, and timestamps can never be set from the app.
grant insert (employee_id, attendance_id, requested_clock_in, requested_clock_out, reason)
  on public.corrections to authenticated;

-- Needed so admins can add employees (the code default uses this sequence).
grant usage on sequence public.employee_code_seq to authenticated;

-- Policies call the helper functions as the signed-in user.
revoke all on schema app from public;
grant usage on schema app to authenticated;
revoke execute on all functions in schema app from public;
grant execute on function
  app.my_role(), app.my_employee_id(), app.my_branch_id(),
  app.is_admin(), app.is_manager(), app.branch_of(uuid)
to authenticated;
