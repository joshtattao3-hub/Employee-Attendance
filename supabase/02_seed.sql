-- =====================================================================
-- Hirara attendance: Stage 1, sample data for development
-- Run AFTER 01_schema.sql. Safe to run once; it refuses to run twice.
--
-- Creates 2 stores, 8 employees (a manager and 3 staff per store),
-- 4 shift templates, and 3 days of attendance history, including one
-- absence and one forgotten time-out so those cases can be tested.
-- Replace or delete this data before a real company goes live.
-- =====================================================================

do $$
begin
  if exists (select 1 from public.employees) or exists (select 1 from public.branches) then
    raise exception 'Seed data already exists. This script is meant to run once on an empty database.';
  end if;
end
$$;

-- Stores
insert into public.branches (name, address, timezone) values
  ('Downtown Store',  '12 Rizal Avenue',   'Asia/Manila'),
  ('Riverside Mall',  '88 Riverside Road', 'Asia/Manila');

-- Employees. Codes (EMP001...) follow the "ord" column below.
insert into public.employees (full_name, email, branch_id, job_title, hired_on)
select v.full_name, v.email, b.id, v.job_title, v.hired_on
from (values
  (1, 'Maria Santos',    'maria@hirara.demo',  'Downtown Store', 'Cashier',          date '2025-03-03'),
  (2, 'John Reyes',      'john@hirara.demo',   'Riverside Mall', 'Cashier',          date '2025-02-10'),
  (3, 'Angela Cruz',     'angela@hirara.demo', 'Downtown Store', 'Sales Associate',  date '2025-05-12'),
  (4, 'Mark Dela Cruz',  'mark@hirara.demo',   'Downtown Store', 'Stock Clerk',      date '2025-08-18'),
  (5, 'Sofia Garcia',    'sofia@hirara.demo',  'Riverside Mall', 'Sales Associate',  date '2025-06-23'),
  (6, 'Daniel Lim',      'daniel@hirara.demo', 'Riverside Mall', 'Stock Clerk',      date '2025-09-01'),
  (7, 'Paolo Rivera',    'paolo@hirara.demo',  'Downtown Store', 'Store Manager',    date '2024-11-04'),
  (8, 'Lena Torres',     'lena@hirara.demo',   'Riverside Mall', 'Store Manager',    date '2024-10-14')
) as v(ord, full_name, email, branch_name, job_title, hired_on)
join public.branches b on b.name = v.branch_name
order by v.ord;

-- Shift templates (the last one runs past midnight)
insert into public.shift_templates (name, start_time, end_time, break_minutes) values
  ('Opening',              time '08:00', time '17:00', 60),
  ('Mid',                  time '10:00', time '19:00', 60),
  ('Closing',              time '14:00', time '23:00', 60),
  ('Overnight stocktake',  time '22:00', time '06:00', 30);

-- Three past days of attendance, in each store's local time.
--   * Daniel was absent two days ago.
--   * John forgot to clock out yesterday (a "missed time-out").
insert into public.attendance
  (employee_id, branch_id, work_date, clock_in, clock_out, missed_timeout)
select
  e.id,
  e.branch_id,
  d.work_date,
  (d.work_date + time '08:00' + ((e.n * 7)  % 40) * interval '1 minute') at time zone b.timezone,
  case when e.email = 'john@hirara.demo' and d.offset_days = 1 then null
       else (d.work_date + time '17:00' + ((e.n * 11) % 50) * interval '1 minute') at time zone b.timezone
  end,
  (e.email = 'john@hirara.demo' and d.offset_days = 1)
from (
  select emp.*, row_number() over (order by emp.employee_code) as n
  from public.employees emp
) e
join public.branches b on b.id = e.branch_id
cross join (
  select n as offset_days, (current_date - n) as work_date
  from generate_series(1, 3) as n
) d
where not (e.email = 'daniel@hirara.demo' and d.offset_days = 2);

-- Setting up the sample data should not clutter the audit trail.
delete from public.audit_log;
