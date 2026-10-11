-- 0002_phase2_staff.sql

BEGIN;

-- 1. STAFF PROFILES TABLE
CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  name text not null,
  phone text,
  role text check (role in ('owner', 'desk', 'housekeeping')) default 'desk',
  pin_hash text not null,
  active boolean default true,
  joined_on date default current_date,
  created_at timestamptz default now()
);

ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff profiles rw" ON staff_profiles FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 2. SAFE VIEW (Hides pin_hash from the client)
CREATE OR REPLACE VIEW staff_profiles_safe AS
SELECT id, property_id, name, phone, role, active, joined_on, created_at
FROM staff_profiles;

ALTER VIEW staff_profiles_safe OWNER TO postgres;
GRANT SELECT ON staff_profiles_safe TO authenticated;

-- 3. STAFF ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff_profiles(id) on delete cascade not null,
  clock_in timestamptz default now(),
  clock_out timestamptz
);

ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance rw" ON staff_attendance FOR ALL TO authenticated 
  USING (
    EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.id = staff_id AND is_member(sp.property_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.id = staff_id AND is_member(sp.property_id))
  );

-- 4. SECURE PIN FUNCTIONS FOR STAFF
CREATE OR REPLACE FUNCTION set_staff_pin(p_staff_id uuid, p_pin text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$   UPDATE staff_profiles SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = p_staff_id;
 $$;

CREATE OR REPLACE FUNCTION verify_staff_pin(p_staff_id uuid, p_pin text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$   SELECT EXISTS (SELECT 1 FROM staff_profiles WHERE id = p_staff_id AND pin_hash = crypt(p_pin, pin_hash));
 $$;

COMMIT;