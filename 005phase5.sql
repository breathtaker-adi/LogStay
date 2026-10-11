-- 0005_phase5_rbac.sql

-- A. Staff table: no direct writes, no pin_hash reads
drop policy if exists "staff profiles rw" on staff_profiles;
revoke all on staff_profiles from authenticated, anon;
grant select (id, property_id, name, phone, role, active, joined_on)
  on staff_profiles to authenticated;
create policy staff_read on staff_profiles for select to authenticated
  using (is_member(property_id));
alter table staff_profiles
  add column if not exists failed_tries int default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid;

drop view if exists staff_profiles_safe;
create view staff_profiles_safe with (security_invoker = true) as
  select id, property_id, name, phone, role, active, joined_on from staff_profiles;
grant select on staff_profiles_safe to authenticated;

-- B. PIN functions: closed to clients; use staff_login instead
revoke execute on function set_staff_pin(uuid, text), verify_staff_pin(uuid, text)
  from public, anon, authenticated;

-- C. Role helpers
create or replace function staff_role(p_prop uuid, p_staff uuid) returns text
language sql security definer stable set search_path = public as
 $$ select role from staff_profiles
   where id = p_staff and property_id = p_prop and active $$;

create or replace function require_role(p_prop uuid, p_staff uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = public as $$ begin
  if not is_member(p_prop) then raise exception 'Not a member'; end if;
  if not coalesce(staff_role(p_prop, p_staff) = any(p_roles), false) then
    raise exception 'Not allowed for this role'; end if;
end $$;

-- D. PIN login with lockout
create or replace function staff_login(p_staff uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$ declare s staff_profiles%rowtype;
begin
  select * into s from staff_profiles where id = p_staff and active;
  if not found or not is_member(s.property_id) then return false; end if;
  if s.locked_until > now() then raise exception 'Locked, try later'; end if;
  if s.pin_hash = crypt(p_pin, s.pin_hash) then
    update staff_profiles set failed_tries = 0, locked_until = null where id = p_staff;
    return true;
  end if;
  update staff_profiles set failed_tries = failed_tries + 1,
    locked_until = case when failed_tries + 1 >= 5
      then now() + interval '5 minutes' end where id = p_staff;
  return false;
end $$;

-- E. Deactivate (owner only)
create or replace function deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$ begin
  perform require_role(p_prop, p_actor, array['owner']);
  if p_actor = p_target then raise exception 'Cannot remove yourself'; end if;
  if staff_role(p_prop, p_target) = 'owner' and not exists
    (select 1 from staff_profiles where property_id = p_prop and role = 'owner'
       and active and id <> p_target) then
    raise exception 'Cannot remove the last owner'; end if;
  update staff_attendance set clock_out = now()
    where staff_id = p_target and clock_out is null;
  update staff_profiles set active = false, deactivated_at = now(),
    deactivated_by = p_actor,
    pin_hash = crypt(gen_random_uuid()::text, gen_salt('bf'))
    where id = p_target and property_id = p_prop;
  insert into audit_log (property_id, user_id, action, record_id)
    values (p_prop, auth.uid(), 'deactivate_staff:' || coalesce(p_reason, ''), p_target);
end $$;

-- F. Audit log: insert and read only
drop policy if exists "audit_log rw" on audit_log;
revoke update, delete on audit_log from authenticated;
alter table audit_log add column if not exists staff_id uuid;
create policy audit_ins on audit_log for insert to authenticated
  with check (is_member(property_id));
create policy audit_sel on audit_log for select to authenticated
  using (is_member(property_id));

-- G. Owner Add Staff (with first-owner bypass)
create or replace function owner_add_staff(
  p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$ declare
  v_new_id uuid := gen_random_uuid();
  v_is_first boolean;
begin
  select not exists (select 1 from staff_profiles where property_id = p_prop and role = 'owner' and active) into v_is_first;
  if not v_is_first then
    perform require_role(p_prop, p_actor, array['owner']);
  end if;
  
  insert into staff_profiles (id, property_id, name, phone, role, pin_hash)
  values (v_new_id, p_prop, p_name, p_phone, p_role, crypt(p_pin, gen_salt('bf')));
  return v_new_id;
end;
 $$;

-- H. Update mark_unit_clean with require_role
create or replace function mark_unit_clean(p_unit_id uuid, p_staff_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$ declare
  v_property_id uuid;
begin
  select r.property_id into v_property_id
  from units u
  join rooms r on u.room_id = r.id
  where u.id = p_unit_id;
  if v_property_id is null then raise exception 'Unit not found'; end if;
  perform require_role(v_property_id, p_staff_id, array['owner', 'desk', 'housekeeping']);
  update units set housekeeping_status = 'clean', last_cleaned_at = now(), last_cleaned_by = p_staff_id where id = p_unit_id;
  insert into housekeeping_log (property_id, unit_id, status, staff_id)
  values (v_property_id, p_unit_id, 'clean', p_staff_id);
end;
 $$;

-- I. Update check_out_guest with require_role and p_staff_id
create or replace function check_out_guest(p_stay_id uuid, p_staff_id uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$ declare
  v_property_id uuid;
  v_unit_id uuid;
begin
  select property_id, unit_id into v_property_id, v_unit_id
  from stays where id = p_stay_id;

  if not found then raise exception 'Stay not found'; end if;
  if not is_member(v_property_id) then raise exception 'Not a member of this property'; end if;
  if p_staff_id is not null then
    perform require_role(v_property_id, p_staff_id, array['owner', 'desk']);
  end if;

  update stays set status = 'checked_out', check_out = now() where id = p_stay_id;
  update units set housekeeping_status = 'dirty' where id = v_unit_id;
  if p_staff_id is not null then
    insert into audit_log (property_id, user_id, action, record_id, staff_id)
    values (v_property_id, auth.uid(), 'checkout', p_stay_id, p_staff_id);
  end if;
end;
$$;

-- J. Reset Staff PIN (owner only)
create or replace function reset_staff_pin(
  p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text
) returns void language plpgsql security definer set search_path = public, extensions as $$ begin
  perform require_role(p_prop, p_actor, array['owner']);
  update staff_profiles set pin_hash = crypt(p_new_pin, gen_salt('bf')),
    failed_tries = 0, locked_until = null
    where id = p_target and property_id = p_prop;
  insert into audit_log (property_id, user_id, action, record_id, staff_id)
    values (p_prop, auth.uid(), 'reset_staff_pin', p_target, p_actor);
end;
$$;