-- 0003_phase3_rooms.sql

BEGIN;

-- 1. ADD MAINTENANCE STATUS & CLEAN TRACKING TO UNITS
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_housekeeping_status_check;
ALTER TABLE units ADD CONSTRAINT units_housekeeping_status_check 
  CHECK (housekeeping_status IN ('clean', 'dirty', 'maintenance'));

ALTER TABLE units ADD COLUMN IF NOT EXISTS last_cleaned_at timestamptz;
ALTER TABLE units ADD COLUMN IF NOT EXISTS last_cleaned_by uuid REFERENCES staff_profiles(id);

-- 2. HOUSEKEEPING LOG TABLE
CREATE TABLE IF NOT EXISTS housekeeping_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  unit_id uuid references units(id) on delete cascade not null,
  status text not null,
  staff_id uuid references staff_profiles(id),
  created_at timestamptz default now()
);

ALTER TABLE housekeeping_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "housekeeping log rw" ON housekeeping_log FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 3. ISSUES TABLE
CREATE TABLE IF NOT EXISTS issues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  unit_id uuid references units(id) on delete cascade,
  stay_id uuid references stays(id) on delete cascade,
  category text check (category in ('ac', 'water', 'noise', 'cleanliness', 'electrical', 'other')),
  note text,
  status text default 'open' check (status in ('open', 'resolved')),
  reported_by uuid references staff_profiles(id),
  resolved_by uuid references staff_profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "issues rw" ON issues FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 4. ATOMIC MARK CLEAN FUNCTION
CREATE OR REPLACE FUNCTION mark_unit_clean(p_unit_id uuid, p_staff_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
BEGIN
  -- Get property_id for the log entry
  SELECT r.property_id INTO v_property_id
  FROM units u
  JOIN rooms r ON u.room_id = r.id
  WHERE u.id = p_unit_id;

  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  -- Update the unit
  UPDATE units 
  SET housekeeping_status = 'clean', 
      last_cleaned_at = now(), 
      last_cleaned_by = p_staff_id 
  WHERE id = p_unit_id;

  -- Write to the log
  INSERT INTO housekeeping_log (property_id, unit_id, status, staff_id)
  VALUES (v_property_id, p_unit_id, 'clean', p_staff_id);
END;
 $$;

COMMIT;