-- supabase/migrations/20261015000004_pin_recovery_and_stepup.sql
-- Owner forgot PIN recovery, self-service PIN change, and owner step-up PIN authorization

-- 1. Owner Master Account Forgot PIN Recovery
CREATE OR REPLACE FUNCTION public.owner_reset_forgotten_pin(
  p_owner_id uuid,
  p_new_pin text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_staff staff_profiles%rowtype;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_staff FROM staff_profiles WHERE id = p_owner_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or inactive';
  END IF;

  SELECT (role = 'owner') INTO v_is_owner 
  FROM members 
  WHERE property_id = v_staff.property_id AND user_id = auth.uid();

  IF v_is_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the verified property owner can recover an owner PIN';
  END IF;

  IF v_staff.role <> 'owner' THEN
    RAISE EXCEPTION 'Target profile is not an owner profile';
  END IF;

  IF p_new_pin IS NULL OR length(p_new_pin) < 4 THEN
    RAISE EXCEPTION 'New PIN must be at least 4 digits';
  END IF;

  UPDATE staff_profiles
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
      failed_tries = 0,
      locked_until = NULL
  WHERE id = p_owner_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_staff.property_id, auth.uid(), 'owner_reset_forgotten_pin', p_owner_id, p_owner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_reset_forgotten_pin(uuid, text) TO authenticated;

-- 2. Staff Self-Service PIN Change
CREATE OR REPLACE FUNCTION public.change_my_pin(
  p_staff_id uuid,
  p_current_pin text,
  p_new_pin text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_staff staff_profiles%rowtype;
BEGIN
  SELECT * INTO v_staff FROM staff_profiles WHERE id = p_staff_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or inactive';
  END IF;

  IF v_staff.locked_until IS NOT NULL AND v_staff.locked_until > now() THEN
    RAISE EXCEPTION 'Account is temporarily locked';
  END IF;

  IF v_staff.pin_hash <> crypt(p_current_pin, v_staff.pin_hash) THEN
    UPDATE staff_profiles
    SET failed_tries = failed_tries + 1,
        locked_until = CASE WHEN failed_tries + 1 >= 5 THEN now() + interval '5 minutes' ELSE NULL END
    WHERE id = p_staff_id;
    RAISE EXCEPTION 'Incorrect current PIN';
  END IF;

  IF p_new_pin IS NULL OR length(p_new_pin) < 4 THEN
    RAISE EXCEPTION 'New PIN must be at least 4 digits';
  END IF;

  UPDATE staff_profiles
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
      failed_tries = 0,
      locked_until = NULL
  WHERE id = p_staff_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_staff.property_id, auth.uid(), 'change_my_pin', p_staff_id, p_staff_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_my_pin(uuid, text, text) TO authenticated;

-- 3. Reload Schema Cache Immediately
NOTIFY pgrst, 'reload schema';
