-- 0017_join_rate_limiting.sql
-- Dedicated Rate Limiting for Join Property to prevent invite code guessing

BEGIN;

CREATE TABLE IF NOT EXISTS public.join_attempts (
  user_id uuid PRIMARY KEY,
  failed_tries int NOT NULL DEFAULT 0,
  locked_until timestamptz
);

REVOKE ALL ON public.join_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_property(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_user_id uuid := auth.uid();
  v_att join_attempts%rowtype;
BEGIN
  IF v_user_id IS NULL THEN 
    RAISE EXCEPTION 'Not authenticated'; 
  END IF;

  SELECT * INTO v_att FROM join_attempts WHERE user_id = v_user_id;

  IF v_att.locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed join attempts. Please try again after 15 minutes.';
  END IF;

  -- Validate invite code
  SELECT property_id INTO v_property_id 
  FROM property_invites 
  WHERE code = upper(trim(p_code)) 
  AND expires_at > now();
  
  IF v_property_id IS NULL THEN
    INSERT INTO join_attempts (user_id, failed_tries, locked_until)
    VALUES (v_user_id, 1, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      failed_tries = join_attempts.failed_tries + 1,
      locked_until = CASE WHEN join_attempts.failed_tries + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

    RETURN NULL;
  END IF;

  -- Reset failed attempts on success
  DELETE FROM join_attempts WHERE user_id = v_user_id;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM members WHERE property_id = v_property_id AND user_id = v_user_id) THEN
    RETURN v_property_id;
  END IF;

  -- Insert as staff
  INSERT INTO members (property_id, user_id, role)
  VALUES (v_property_id, v_user_id, 'staff');

  RETURN v_property_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_property(text) TO authenticated;

COMMIT;
