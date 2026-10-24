-- =====================================================================
-- Hirara attendance: Stage 1, connect logins to roles
-- Run AFTER you created the test logins in Supabase:
--   Authentication -> Users -> Add user -> Create new user
--   (tick "Auto Confirm User")
--
-- Test logins to create (use a strong password of your own for each):
--   admin@hirara.demo   -> will become the Administrator
--   paolo@hirara.demo   -> Downtown Store manager
--   maria@hirara.demo   -> Downtown Store cashier (employee)
--   john@hirara.demo    -> Riverside Mall cashier (employee)
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Link any existing login to the employee with the same email.
--    (Normally a trigger does this when the login is created. This covers
--    logins created before the seed data existed.)
insert into public.profiles (id, email, role, employee_id)
select u.id, lower(u.email), 'employee', e.id
from auth.users u
join public.employees e on lower(e.email) = lower(u.email)
where not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where p.employee_id = e.id);

-- 2. The administrator has no employee record.
--    For a real company, change this email to the owner's real address.
insert into public.profiles (id, email, role, employee_id)
select u.id, lower(u.email), 'admin', null
from auth.users u
where lower(u.email) = 'admin@hirara.demo'
on conflict (id) do update
  set role = 'admin', employee_id = null, active = true;

-- 3. Store managers
update public.profiles
set role = 'manager'
where email in ('paolo@hirara.demo', 'lena@hirara.demo');

-- Result: who can sign in, and as what
select p.email, p.role, e.employee_code, b.name as branch, p.active
from public.profiles p
left join public.employees e on e.id = p.employee_id
left join public.branches b on b.id = e.branch_id
order by p.role, p.email;
