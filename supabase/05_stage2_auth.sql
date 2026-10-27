-- =====================================================================
-- Hirara attendance: Stage 2, support for admin-created logins
-- Run AFTER 01 to 04. Safe to run more than once.
--
-- Adds:
--   * access for the server role (service_role) that the manage-logins
--     function needs. Without it the function cannot even check who is an
--     administrator.
--   * profiles.must_change_password: set when an admin creates a login or
--     resets a password, so the person must choose their own password.
--   * finish_password_change(): lets a signed-in person clear THEIR OWN
--     flag after they changed their password. Nobody can clear the flag
--     with a plain update, and nobody can clear someone else's.
-- =====================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.finish_password_change()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid()
$$;

-- Not callable by signed-out visitors; callable by signed-in users.
revoke all on function public.finish_password_change() from public, anon;
grant execute on function public.finish_password_change() to authenticated;

-- ---------------------------------------------------------------------
-- The SERVER role (service_role)
-- Server code such as the manage-logins function connects with the secret
-- key, which maps to this role. It is never used by the browser. New
-- Supabase projects do not give it access to your own tables
-- automatically, so grant it explicitly.
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Tables you add later get the same access.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;