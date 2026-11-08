-- 0024_staff_remarks_and_complete_team.sql
-- 1. Creates staff_remarks table for tracking exit / removal performance notes across properties
-- 2. get_property_team RPC ensuring all members (Owner, Co-Admin, Front Desk, Housekeeper) are displayed
-- 3. remove_team_member RPC enforcing strict removal hierarchy (Owner supreme; Co-Admin by Owner only; Desk by Owner/Co-Admin; Housekeeper by anyone)
-- 4. get_staff_remarks RPC allowing owners/managers to see remarks history for a member

BEGIN;

-- 1. Create staff_remarks table
CREATE TABLE IF NOT EXISTS public.staff_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone text,
  staff_name text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  property_name text,
  role text,
  remark text NOT NULL,
  removed_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_by_name text,
  removed_by_role text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_remarks_staff_id ON public.staff_remarks(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_remarks_user_id ON public.staff_remarks(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_remarks_phone ON public.staff_remarks(phone);
CREATE INDEX IF NOT EXISTS idx_staff_remarks_property_id ON public.staff_remarks(property_id);

ALTER TABLE public.staff_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated members can view remarks" ON public.staff_remarks;
CREATE POLICY "Authenticated members can view remarks"
  ON public.staff_remarks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert remarks" ON public.staff_remarks;
CREATE POLICY "Authenticated users can insert remarks"
  ON public.staff_remarks FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. get_property_team RPC
-- Returns all members of a property (owner, co_admin, desk, housekeeping)
-- Synthesizes/upserts missing staff_profiles for existing members (especially owner) so everyone is shown!
CREATE OR REPLACE FUNCTION public.get_property_team(p_prop_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  property_id uuid,
  name text,
  phone text,
  role text,
  active boolean,
  joined_on date,
  created_at timestamptz,
  remarks_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_prop_name text;
  v_mem record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user belongs to property
  IF NOT EXISTS (
    SELECT 1 FROM members WHERE property_id = p_prop_id AND user_id = v_user_id
    UNION
    SELECT 1 FROM properties WHERE id = p_prop_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this property';
  END IF;

  -- Ensure property owner has a staff_profiles record
  SELECT owner_id, name INTO v_owner_id, v_prop_name FROM properties WHERE id = p_prop_id;
  IF v_owner_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff_profiles WHERE property_id = p_prop_id AND role = 'owner'
    ) THEN
      INSERT INTO staff_profiles (id, property_id, user_id, name, role, active, pin_hash)
      VALUES (gen_random_uuid(), p_prop_id, v_owner_id, 'Owner', 'owner', true, '');
    END IF;
  END IF;

  -- Ensure any member with co_admin, desk, housekeeping in members table has a staff_profile
  FOR v_mem IN 
    SELECT m.user_id, m.role 
    FROM members m
    WHERE m.property_id = p_prop_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM staff_profiles sp 
      WHERE sp.property_id = p_prop_id AND (sp.user_id = v_mem.user_id OR (v_mem.role = 'owner' AND sp.role = 'owner'))
    ) THEN
      INSERT INTO staff_profiles (id, property_id, user_id, name, role, active, pin_hash)
      VALUES (
        gen_random_uuid(),
        p_prop_id,
        v_mem.user_id, 
        CASE 
          WHEN v_mem.role = 'owner' THEN 'Owner'
          WHEN v_mem.role = 'co_admin' THEN 'Co-Admin'
          WHEN v_mem.role = 'desk' THEN 'Front Desk'
          WHEN v_mem.role = 'housekeeping' THEN 'Housekeeper'
          ELSE 'Staff Member'
        END,
        v_mem.role,
        true,
        ''
      );
    END IF;
  END LOOP;

  -- Return combined view ordered by hierarchy
  RETURN QUERY
  SELECT 
    sp.id,
    sp.user_id,
    sp.property_id,
    sp.name,
    sp.phone,
    sp.role,
    sp.active,
    sp.joined_on,
    sp.created_at,
    (
      SELECT count(*) 
      FROM staff_remarks sr 
      WHERE sr.staff_id = sp.id 
         OR (sp.user_id IS NOT NULL AND sr.user_id = sp.user_id)
         OR (sp.phone IS NOT NULL AND length(sp.phone) > 4 AND sr.phone = sp.phone)
    ) AS remarks_count
  FROM staff_profiles sp
  WHERE sp.property_id = p_prop_id
  ORDER BY 
    CASE sp.role
      WHEN 'owner' THEN 1
      WHEN 'co_admin' THEN 2
      WHEN 'desk' THEN 3
      WHEN 'housekeeping' THEN 4
      ELSE 5
    END ASC,
    sp.active DESC,
    sp.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_property_team(uuid) TO authenticated;

-- 3. remove_team_member RPC with strict hierarchy and optional remark
-- Hierarchy rules:
-- - Owner: SUPREME (cannot be removed by anyone).
-- - Co-Admin: Removed by Owner only.
-- - Front Desk: Removed by Owner & Co-Admin.
-- - Housekeeper: Removed by Owner, Co-Admin, and Front Desk.
-- - Self removal disallowed.
CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_prop_id uuid,
  p_target_staff_id uuid,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
  v_target record;
  v_prop_name text;
  v_clean_remark text := NULLIF(trim(p_remark), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Determine actor role & name
  SELECT role INTO v_actor_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_actor_role IS NULL THEN
    SELECT role, name INTO v_actor_role, v_actor_name FROM staff_profiles WHERE property_id = p_prop_id AND user_id = v_user_id LIMIT 1;
  ELSE
    SELECT name INTO v_actor_name FROM staff_profiles WHERE property_id = p_prop_id AND user_id = v_user_id LIMIT 1;
  END IF;

  IF v_actor_role IS NULL THEN
    -- Check if property owner
    IF EXISTS (SELECT 1 FROM properties WHERE id = p_prop_id AND owner_id = v_user_id) THEN
      v_actor_role := 'owner';
      v_actor_name := 'Owner';
    ELSE
      RAISE EXCEPTION 'Unauthorized: Caller is not a member of this property';
    END IF;
  END IF;

  IF v_actor_name IS NULL THEN
    v_actor_name := v_actor_role;
  END IF;

  -- Fetch target profile
  SELECT * INTO v_target FROM staff_profiles WHERE id = p_target_staff_id AND property_id = p_prop_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Target staff member not found in this property.';
  END IF;

  -- 1. Self removal check
  IF (v_target.user_id IS NOT NULL AND v_target.user_id = v_user_id) THEN
    RAISE EXCEPTION 'You cannot remove yourself from the team.';
  END IF;

  -- 2. Owner cannot be removed
  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'The Owner is supreme and cannot be removed.';
  END IF;

  -- 3. Co-Admin: Removed by Owner only
  IF v_target.role = 'co_admin' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'A Co-Admin can only be removed by the property Owner.';
  END IF;

  -- 4. Front Desk: Removed by Owner & Co-Admin only
  IF v_target.role = 'desk' AND v_actor_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Front Desk staff can only be removed by the Owner or Co-Admin.';
  END IF;

  -- 5. Housekeeper: Removed by Owner, Co-Admin, or Front Desk
  IF v_target.role = 'housekeeping' AND v_actor_role NOT IN ('owner', 'co_admin', 'desk') THEN
    RAISE EXCEPTION 'Housekeepers can only be removed by the Owner, Co-Admin, or Front Desk.';
  END IF;

  -- Get property name
  SELECT name INTO v_prop_name FROM properties WHERE id = p_prop_id;

  -- Perform deactivation & disconnection
  UPDATE staff_profiles
  SET active = false,
      deactivated_at = now()
  WHERE id = v_target.id;

  -- Remove from members table so they can no longer access this property
  IF v_target.user_id IS NOT NULL THEN
    DELETE FROM members
    WHERE property_id = p_prop_id AND user_id = v_target.user_id;
  END IF;

  -- Record remark in staff_remarks ledger if provided
  IF v_clean_remark IS NOT NULL THEN
    INSERT INTO staff_remarks (
      staff_id,
      user_id,
      phone,
      staff_name,
      property_id,
      property_name,
      role,
      remark,
      removed_by_id,
      removed_by_name,
      removed_by_role
    ) VALUES (
      v_target.id,
      v_target.user_id,
      v_target.phone,
      v_target.name,
      p_prop_id,
      v_prop_name,
      v_target.role,
      v_clean_remark,
      v_user_id,
      v_actor_name,
      v_actor_role
    );
  END IF;

  -- Log into audit_log
  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (
    p_prop_id,
    v_user_id,
    'remove_team_member',
    v_target.id,
    (SELECT id FROM staff_profiles WHERE property_id = p_prop_id AND user_id = v_user_id LIMIT 1)
  );

  RETURN jsonb_build_object(
    'success', true,
    'removed_staff_id', v_target.id,
    'name', v_target.name,
    'role', v_target.role,
    'has_remark', (v_clean_remark IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid, text) TO authenticated;

-- 4. get_staff_remarks RPC
-- Retrieves prior remarks across properties for a given staff profile / user / phone
CREATE OR REPLACE FUNCTION public.get_staff_remarks(
  p_staff_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  property_name text,
  role text,
  remark text,
  removed_by_name text,
  removed_by_role text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_phone text := NULLIF(trim(p_phone), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If phone was not explicitly provided but staff_id is given, resolve phone from staff_profiles
  IF v_target_phone IS NULL AND p_staff_id IS NOT NULL THEN
    SELECT phone, user_id INTO v_target_phone, p_user_id FROM staff_profiles WHERE id = p_staff_id;
  END IF;

  RETURN QUERY
  SELECT 
    sr.id,
    coalesce(sr.property_name, 'LogStay Property') as property_name,
    coalesce(sr.role, 'staff') as role,
    sr.remark,
    coalesce(sr.removed_by_name, 'Manager') as removed_by_name,
    coalesce(sr.removed_by_role, 'owner') as removed_by_role,
    sr.created_at
  FROM staff_remarks sr
  WHERE (p_staff_id IS NOT NULL AND sr.staff_id = p_staff_id)
     OR (p_user_id IS NOT NULL AND sr.user_id = p_user_id)
     OR (v_target_phone IS NOT NULL AND length(v_target_phone) > 4 AND sr.phone = v_target_phone)
  ORDER BY sr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_remarks(uuid, uuid, text) TO authenticated;

-- 5. lookup_staff_remarks RPC
-- Allows a departed staff member to look up their previous remarks using phone number, code, or user_id
CREATE OR REPLACE FUNCTION public.lookup_staff_remarks(p_query text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  property_name text,
  staff_name text,
  role text,
  remark text,
  removed_by_name text,
  removed_by_role text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean text := NULLIF(trim(p_query), '');
  v_digits text := regexp_replace(coalesce(v_clean, ''), '[^0-9]', '', 'g');
BEGIN
  RETURN QUERY
  SELECT 
    sr.id,
    coalesce(sr.property_name, 'LogStay Property') as property_name,
    sr.staff_name,
    coalesce(sr.role, 'staff') as role,
    sr.remark,
    coalesce(sr.removed_by_name, 'Manager') as removed_by_name,
    coalesce(sr.removed_by_role, 'owner') as removed_by_role,
    sr.created_at
  FROM staff_remarks sr
  WHERE 
    -- 1. Matched by authenticated user ID if logged in
    (v_user_id IS NOT NULL AND sr.user_id = v_user_id)
    -- 2. Matched by phone digits (last 6-10 digits)
    OR (length(v_digits) >= 6 AND regexp_replace(coalesce(sr.phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
    -- 3. Matched by ID or exact code string
    OR (v_clean IS NOT NULL AND (sr.id::text ILIKE v_clean || '%' OR sr.staff_id::text ILIKE v_clean || '%'))
  ORDER BY sr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_staff_remarks(text) TO authenticated, anon;

COMMIT;

