-- 20261015000005_desk_add_staff_and_approval.sql
-- 1. Support owner full name in create_property
-- 2. Allow front desk staff to add team members pending owner approval
-- 3. Dedicated approve_staff and staff_self_register RPCs
-- 4. Dedicated update_staff_name RPC

BEGIN;

DROP FUNCTION IF EXISTS public.create_property(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_property(
  p_name text, 
  p_type text, 
  p_state text, 
  p_pin text,
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

  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  INSERT INTO properties (id, name, type, state, owner_id)
  VALUES (v_prop_id, trim(p_name), coalesce(p_type, 'hostel'), trim(p_state), v_user_id);

  INSERT INTO members (property_id, user_id, role)
  VALUES (v_prop_id, v_user_id, 'owner');

  INSERT INTO staff_profiles (id, property_id, name, role, pin_hash)
  VALUES (v_staff_id, v_prop_id, v_owner_name, 'owner', crypt(p_pin, gen_salt('bf', 10)));

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop_id, v_user_id, 'create_property', v_prop_id, v_staff_id);

  RETURN v_prop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_property(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_staff_name(
  p_staff_id uuid,
  p_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
BEGIN
  IF length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;

  SELECT property_id INTO v_prop FROM staff_profiles WHERE id = p_staff_id;
  IF v_prop IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  IF NOT is_member(v_prop) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE staff_profiles
  SET name = trim(p_name)
  WHERE id = p_staff_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_add_staff(
  p_prop uuid, 
  p_actor uuid, 
  p_name text, 
  p_phone text, 
  p_role text, 
  p_pin text,
  p_owner_pin text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_is_first boolean;
  v_actor_role text;
  v_is_active boolean := true;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM staff_profiles WHERE property_id = p_prop AND role = 'owner' AND active) INTO v_is_first;

  IF NOT v_is_first THEN
    SELECT role INTO v_actor_role 
    FROM staff_profiles 
    WHERE id = p_actor AND property_id = p_prop AND active;

    IF v_actor_role = 'owner' THEN
      PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
      v_is_active := true;
    ELSIF v_actor_role = 'desk' THEN
      IF p_role = 'owner' THEN
        RAISE EXCEPTION 'Front desk cannot create owner accounts';
      END IF;
      v_is_active := false;
    ELSE
      IF EXISTS (SELECT 1 FROM members WHERE property_id = p_prop AND user_id = auth.uid() AND role = 'owner') THEN
        v_is_active := true;
      ELSE
        PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
        PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
      END IF;
    END IF;
  END IF;

  IF p_role NOT IN ('owner', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  INSERT INTO staff_profiles (id, property_id, name, phone, role, pin_hash, active)
  VALUES (v_new_id, p_prop, trim(p_name), trim(p_phone), p_role, crypt(p_pin, gen_salt('bf', 10)), v_is_active);

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (
    p_prop, 
    auth.uid(), 
    CASE WHEN v_is_active THEN 'owner_add_staff' ELSE 'desk_request_add_staff' END, 
    v_new_id, 
    p_actor
  );

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_add_staff(uuid, uuid, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_staff(
  p_prop uuid,
  p_actor uuid,
  p_target uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
  PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);

  UPDATE staff_profiles
  SET active = true
  WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, auth.uid(), 'approve_staff', p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_staff(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_self_register(
  p_code text,
  p_name text,
  p_pin text,
  p_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Staff name required';
  END IF;

  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  v_property_id := join_property(p_code);
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  INSERT INTO staff_profiles (id, property_id, name, phone, role, pin_hash, active)
  VALUES (v_new_id, v_property_id, trim(p_name), trim(p_phone), 'desk', crypt(p_pin, gen_salt('bf', 10)), false);

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_property_id, v_user_id, 'staff_self_register_pending', v_new_id, v_new_id);

  RETURN v_property_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_self_register(text, text, text, text) TO authenticated;

COMMIT;
