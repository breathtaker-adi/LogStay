-- 20261015000008_remove_pins_and_hierarchical_invites.sql
-- 1. Adds position/role to property_invites
-- 2. Removes PIN requirement across staff and properties
-- 3. Enables hierarchical code generation (Owner/Co-Admin -> Co-Admin/Desk/Housekeeper; Desk -> Housekeeper only)
-- 4. Automatically joins staff with assigned position and activates them directly into Home

BEGIN;

-- 1. Support role in property_invites
ALTER TABLE public.property_invites ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'desk';

-- 2. Update staff_profiles table: add user_id, drop pin_hash NOT NULL, allow co_admin
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.staff_profiles ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE public.staff_profiles ALTER COLUMN pin_hash SET DEFAULT '';

-- Update constraints on staff_profiles and members to include co_admin
ALTER TABLE public.staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_role_check 
  CHECK (role = ANY (ARRAY['owner'::text, 'co_admin'::text, 'desk'::text, 'housekeeping'::text]));

-- 3. Update staff_profiles_safe view to expose user_id and new roles
DROP VIEW IF EXISTS public.staff_profiles_safe CASCADE;
CREATE VIEW public.staff_profiles_safe WITH (security_invoker = true) AS
SELECT 
  id,
  property_id,
  name,
  phone,
  role,
  active,
  joined_on,
  created_at,
  user_id
FROM public.staff_profiles;

GRANT SELECT ON public.staff_profiles_safe TO authenticated;

-- 4. Update create_property to remove PIN requirement
CREATE OR REPLACE FUNCTION public.create_property(
  p_name text,
  p_type text,
  p_state text,
  p_pin text DEFAULT NULL,
  p_owner_name text DEFAULT 'Owner'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop_id uuid := gen_random_uuid();
  v_user_id uuid := auth.uid();
  v_staff_id uuid := gen_random_uuid();
  v_owner_name text := COALESCE(NULLIF(trim(p_owner_name), ''), 'Owner');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Property name required';
  END IF;

  IF p_state IS NULL OR length(trim(p_state)) < 1 THEN
    RAISE EXCEPTION 'State required';
  END IF;

  INSERT INTO properties (id, name, type, state, owner_id)
  VALUES (v_prop_id, trim(p_name), coalesce(p_type, 'hostel'), trim(p_state), v_user_id);

  INSERT INTO members (property_id, user_id, role)
  VALUES (v_prop_id, v_user_id, 'owner');

  INSERT INTO staff_profiles (id, property_id, user_id, name, role, pin_hash, active)
  VALUES (v_staff_id, v_prop_id, v_user_id, v_owner_name, 'owner', '', true);

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop_id, v_user_id, 'create_property', v_prop_id, v_staff_id);

  RETURN v_prop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_property(text, text, text, text, text) TO authenticated;

-- 5. Updated generate_invite_code with position hierarchy
-- Hierarchy:
--   Owner & Co-Admin can generate for: co_admin, desk, housekeeping
--   Desk can generate ONLY for: housekeeping
CREATE OR REPLACE FUNCTION public.generate_invite_code(
  p_prop uuid,
  p_actor uuid DEFAULT NULL,
  p_role text DEFAULT 'desk'
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_actor_role text;
  v_user_id uuid := auth.uid();
  v_target_role text := lower(trim(coalesce(p_role, 'desk')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Determine caller's role
  SELECT role INTO v_actor_role
  FROM members
  WHERE property_id = p_prop AND user_id = v_user_id;

  IF v_actor_role IS NULL AND p_actor IS NOT NULL THEN
    SELECT role INTO v_actor_role
    FROM staff_profiles
    WHERE id = p_actor AND property_id = p_prop;
  END IF;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not a member of this property';
  END IF;

  -- Validate Role Hierarchy:
  IF v_actor_role IN ('owner', 'co_admin') THEN
    IF v_target_role NOT IN ('co_admin', 'desk', 'housekeeping') THEN
      RAISE EXCEPTION 'Invalid role. Owner/Co-Admin can invite co_admin, desk, or housekeeping.';
    END IF;
  ELSIF v_actor_role = 'desk' THEN
    IF v_target_role != 'housekeeping' THEN
      RAISE EXCEPTION 'Front desk staff can only generate invite codes for Housekeepers.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Housekeeping staff cannot generate invite codes.';
  END IF;

  -- Generate 6-char code
  v_code := '';
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
  END LOOP;

  INSERT INTO property_invites (property_id, code, role, expires_at, created_by)
  VALUES (p_prop, v_code, v_target_role, now() + interval '48 hours', v_user_id);

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid, uuid, text) TO authenticated;

-- 6. RPC: join_property_with_invite (Claims invite, binds role, activates profile, NO PIN required)
CREATE OR REPLACE FUNCTION public.join_property_with_invite(
  p_code text,
  p_name text,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invite record;
  v_staff_id uuid;
  v_prop_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Please provide your full name.';
  END IF;

  -- Find valid invite
  SELECT * INTO v_invite
  FROM property_invites
  WHERE code = upper(trim(p_code))
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code.';
  END IF;

  -- Upsert member role
  DELETE FROM members WHERE property_id = v_invite.property_id AND user_id = v_user_id;
  INSERT INTO members (property_id, user_id, role)
  VALUES (v_invite.property_id, v_user_id, v_invite.role);

  -- Upsert staff profile
  SELECT id INTO v_staff_id
  FROM staff_profiles
  WHERE property_id = v_invite.property_id AND (user_id = v_user_id OR (phone IS NOT NULL AND phone = trim(p_phone)))
  LIMIT 1;

  IF v_staff_id IS NOT NULL THEN
    UPDATE staff_profiles
    SET name = trim(p_name),
        phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
        role = v_invite.role,
        user_id = v_user_id,
        active = true,
        pin_hash = ''
    WHERE id = v_staff_id;
  ELSE
    v_staff_id := gen_random_uuid();
    INSERT INTO staff_profiles (id, property_id, user_id, name, phone, role, active, pin_hash)
    VALUES (v_staff_id, v_invite.property_id, v_user_id, trim(p_name), trim(p_phone), v_invite.role, true, '');
  END IF;

  SELECT name INTO v_prop_name FROM properties WHERE id = v_invite.property_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_invite.property_id, v_user_id, 'joined_via_invite_code', v_staff_id, v_staff_id);

  RETURN jsonb_build_object(
    'property_id', v_invite.property_id,
    'property_name', v_prop_name,
    'staff_id', v_staff_id,
    'name', trim(p_name),
    'role', v_invite.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_property_with_invite(text, text, text) TO authenticated;

-- 7. RPC: resolve_user_profile (Called on login to directly resolve staff identity)
CREATE OR REPLACE FUNCTION public.resolve_user_profile()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member record;
  v_profile record;
  v_prop_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_member
  FROM members
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_member.property_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Look up staff profile by user_id or by role/property
  SELECT * INTO v_profile
  FROM staff_profiles
  WHERE property_id = v_member.property_id
    AND (user_id = v_user_id OR (v_member.role = 'owner' AND role = 'owner'))
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_profile.id IS NOT NULL THEN
    -- Backfill user_id if missing
    IF v_profile.user_id IS NULL THEN
      UPDATE staff_profiles SET user_id = v_user_id WHERE id = v_profile.id;
    END IF;
  ELSE
    -- Auto-create profile if missing
    v_profile.id := gen_random_uuid();
    v_profile.name := coalesce(v_member.role, 'Staff');
    v_profile.role := v_member.role;
    INSERT INTO staff_profiles (id, property_id, user_id, name, role, active, pin_hash)
    VALUES (v_profile.id, v_member.property_id, v_user_id, v_profile.name, v_member.role, true, '');
  END IF;

  SELECT name INTO v_prop_name FROM properties WHERE id = v_member.property_id;

  RETURN jsonb_build_object(
    'property_id', v_member.property_id,
    'property_name', v_prop_name,
    'staff_id', v_profile.id,
    'name', v_profile.name,
    'role', coalesce(v_profile.role, v_member.role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_user_profile() TO authenticated;

COMMIT;

