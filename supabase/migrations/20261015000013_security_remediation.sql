-- Migration: 20261015000013_security_remediation.sql
-- Comprehensive Security Remediation (Findings #1, #2, #3, #4, #5, #12, #15)
-- 
-- 1. Finding #1 (Critical): Drop legacy world-open RLS policies on units table
-- 2. Finding #2 (Critical): Enforce auth.uid() role derivation across all staff management RPCs
-- 3. Finding #3 (Critical): Revoke execute on delete_expired_id_photos() from authenticated
-- 4. Finding #4 (High): Add is_member authorization check to resolve_issue RPC
-- 5. Finding #5 (High): Define storage.objects RLS policies for id_photos bucket
-- 6. Finding #12 (High): Implement missing verify_owner_pin RPC for Step-Up Auth
-- 7. Finding #15 (Medium): Revoke TRUNCATE on sensitive tables from anon and authenticated

-- ============================================================
-- 1. Drop World-Open RLS Policies on units table (Finding #1)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert units" ON public.units;
DROP POLICY IF EXISTS "Users can read units" ON public.units;

-- ============================================================
-- 2. Define verify_owner_pin (Finding #12)
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_owner_pin(
  p_prop uuid,
  p_actor uuid DEFAULT NULL,
  p_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_caller_role text;
  v_hash text;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is property owner
  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_caller_uid;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_caller_uid;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Not authorized: Only property owners can perform this action';
  END IF;

  -- Optional PIN check for legacy step-up callers
  IF p_pin IS NOT NULL AND trim(p_pin) <> '' THEN
    -- Lookup owner's pin_hash from staff_profiles if present
    SELECT pin_hash INTO v_hash
    FROM staff_profiles
    WHERE property_id = p_prop 
      AND role = 'owner' 
      AND active
      AND (user_id = v_caller_uid OR (p_actor IS NOT NULL AND id = p_actor))
    ORDER BY (user_id = v_caller_uid) DESC
    LIMIT 1;

    -- Fallback to member_pins if exists
    IF v_hash IS NULL THEN
      SELECT pin_hash INTO v_hash
      FROM member_pins
      WHERE property_id = p_prop AND user_id = v_caller_uid;
    END IF;

    IF v_hash IS NOT NULL AND v_hash <> '' AND v_hash <> crypt(p_pin, v_hash) THEN
      RAISE EXCEPTION 'Invalid owner PIN';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_owner_pin(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_owner_pin(uuid, uuid, text) TO service_role;

-- ============================================================
-- 3. Hardened require_role (Finding #2)
-- Strictly derives actor's role from auth.uid(), ignoring spoofed parameters
-- ============================================================
CREATE OR REPLACE FUNCTION public.require_role(
  p_prop uuid, 
  p_staff uuid, 
  p_roles text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_member(p_prop) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Derive caller role strictly from members table or properties.owner_id
  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL THEN
    SELECT role INTO v_caller_role FROM staff_profiles WHERE property_id = p_prop AND user_id = v_user_id AND active LIMIT 1;
  END IF;

  IF v_caller_role IS NULL OR NOT (v_caller_role = ANY(p_roles)) THEN
    RAISE EXCEPTION 'Not allowed for this role';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.require_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_role(uuid, uuid, text[]) TO service_role;

-- ============================================================
-- 4. Hardened reset_staff_pin (Finding #2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_staff_pin(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_new_pin text,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Not allowed for this role';
  END IF;

  IF v_caller_role = 'owner' AND p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
  END IF;

  IF p_new_pin IS NULL OR length(trim(p_new_pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  UPDATE staff_profiles 
  SET pin_hash = crypt(trim(p_new_pin), gen_salt('bf', 10)), 
      failed_tries = 0, 
      locked_until = null 
  WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, v_user_id, 'reset_staff_pin', p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_staff_pin(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_new_pin text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.reset_staff_pin(p_prop, p_actor, p_target, p_new_pin, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, uuid, uuid, text) TO service_role;

-- ============================================================
-- 5. Hardened update_staff_role (Finding #2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_staff_role(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_new_role text,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_clean_role text := lower(trim(coalesce(p_new_role, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Not allowed for this role: Only owners can modify staff roles';
  END IF;

  PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);

  IF v_clean_role NOT IN ('owner', 'co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role. Role must be owner, co_admin, desk, or housekeeping.';
  END IF;

  IF staff_role(p_prop, p_target) = 'owner' AND v_clean_role <> 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff_profiles 
      WHERE property_id = p_prop AND role = 'owner' AND active AND id <> p_target
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last remaining active owner.';
    END IF;
  END IF;

  UPDATE staff_profiles SET role = v_clean_role WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, v_user_id, 'update_staff_role:' || v_clean_role, p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, uuid, uuid, text, text) TO service_role;

-- ============================================================
-- 6. Hardened approve_staff (Finding #2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_staff(
  p_prop uuid,
  p_actor uuid,
  p_target uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Not allowed for this role: Only owner or co-admin can approve staff';
  END IF;

  IF v_caller_role = 'owner' AND p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
  END IF;

  UPDATE staff_profiles
  SET active = true
  WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, v_user_id, 'approve_staff', p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_staff(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_staff(uuid, uuid, uuid, text) TO service_role;

-- ============================================================
-- 7. Hardened owner_add_staff (Finding #2)
-- ============================================================
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
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_new_id uuid := gen_random_uuid();
  v_is_first boolean;
  v_is_active boolean := true;
  v_clean_role text := lower(trim(coalesce(p_role, 'desk')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM staff_profiles WHERE property_id = p_prop AND role = 'owner' AND active) INTO v_is_first;

  IF NOT v_is_first THEN
    -- Derive caller role strictly from verified user
    SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
    IF v_caller_role IS NULL THEN
      SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
    END IF;

    IF v_caller_role = 'owner' THEN
      IF p_owner_pin IS NOT NULL THEN
        PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
      END IF;
      v_is_active := true;
    ELSIF v_caller_role = 'co_admin' THEN
      v_is_active := true;
    ELSIF v_caller_role = 'desk' THEN
      IF v_clean_role IN ('owner', 'co_admin') THEN
        RAISE EXCEPTION 'Front desk cannot create owner or co-admin accounts';
      END IF;
      v_is_active := false; -- requires owner approval
    ELSE
      RAISE EXCEPTION 'Not allowed for this role';
    END IF;
  END IF;

  IF v_clean_role NOT IN ('owner', 'co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_pin IS NULL OR length(trim(p_pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  INSERT INTO staff_profiles (id, property_id, name, phone, role, pin_hash, active)
  VALUES (v_new_id, p_prop, trim(p_name), trim(p_phone), v_clean_role, crypt(trim(p_pin), gen_salt('bf', 10)), v_is_active);

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (
    p_prop, 
    v_user_id, 
    CASE WHEN v_is_active THEN 'owner_add_staff' ELSE 'desk_request_add_staff' END, 
    v_new_id, 
    p_actor
  );

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_add_staff(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_add_staff(uuid, uuid, text, text, text, text, text) TO service_role;

-- ============================================================
-- 8. Hardened update_room (Finding #2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_room(
  p_room_id uuid,
  p_label text,
  p_floor text,
  p_gender_rule text,
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL,
  p_floor_no smallint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_prop uuid;
  v_floor_no smallint;
  v_floor_str text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT property_id INTO v_prop FROM rooms WHERE id = p_room_id AND archived_at IS NULL;
  IF v_prop IS NULL THEN 
    RAISE EXCEPTION 'Room not found or archived'; 
  END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = v_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = v_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Not allowed for this role: Only owner or co-admin can update rooms';
  END IF;

  IF v_caller_role = 'owner' AND p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  -- Resolve floor_no and floor string
  IF p_floor_no IS NOT NULL THEN
    v_floor_no := p_floor_no;
    v_floor_str := CASE
      WHEN p_floor_no < 0 THEN 'Basement'
      WHEN p_floor_no = 0 THEN 'Ground'
      ELSE p_floor_no::text
    END;
  ELSIF p_floor IS NOT NULL AND trim(p_floor) <> '' THEN
    v_floor_str := trim(p_floor);
    IF v_floor_str ~ '^-?[0-9]+$' THEN
      v_floor_no := v_floor_str::smallint;
    ELSIF lower(v_floor_str) IN ('g','gf','ground','ground floor','groundfloor') THEN
      v_floor_no := 0;
    ELSIF lower(v_floor_str) IN ('b','basement') THEN
      v_floor_no := -1;
    ELSE
      v_floor_no := NULL;
    END IF;
  ELSE
    v_floor_str := 'Ground';
    v_floor_no := 0;
  END IF;

  UPDATE rooms
  SET label = trim(p_label),
      floor = v_floor_str,
      floor_no = v_floor_no
  WHERE id = p_room_id;

  UPDATE units
  SET gender_rule = coalesce(p_gender_rule, 'any')
  WHERE room_id = p_room_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, v_user_id, 'update_room', p_room_id, p_staff_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_room(uuid, text, text, text, uuid, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_room(uuid, text, text, text, uuid, text, smallint) TO service_role;

-- ============================================================
-- 9. Hardened deactivate_staff (Finding #2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_staff(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_target_staff_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Not allowed for this role: Only owner or co-admin can deactivate staff';
  END IF;

  -- Check if caller is attempting to deactivate themselves
  SELECT id INTO v_target_staff_id FROM staff_profiles WHERE property_id = p_prop AND user_id = v_user_id AND id = p_target;
  IF v_target_staff_id IS NOT NULL OR p_actor = p_target THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  IF staff_role(p_prop, p_target) = 'owner' AND NOT EXISTS (
    SELECT 1 FROM staff_profiles 
    WHERE property_id = p_prop AND role = 'owner' AND active AND id <> p_target
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last owner';
  END IF;

  UPDATE staff_attendance SET clock_out = now()
  WHERE staff_id = p_target AND clock_out IS NULL;

  UPDATE staff_profiles 
  SET active = false, 
      deactivated_at = now(),
      deactivated_by = coalesce(p_actor, v_user_id),
      pin_hash = crypt(gen_random_uuid()::text, gen_salt('bf', 10))
  WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, v_user_id, 'deactivate_staff:' || coalesce(p_reason, ''), p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_staff(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_staff(uuid, uuid, uuid, text) TO service_role;

-- ============================================================
-- 10. Lock down delete_expired_id_photos (Finding #3)
-- Create if missing, and revoke execute from authenticated and public; only service_role (cron) can execute
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_expired_id_photos() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, id_photo_path FROM guests WHERE id_photo_expires_at < now() AND id_deleted_at IS NULL LOOP
    UPDATE guests SET id_deleted_at = now(), id_photo_path = null WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_id_photos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expired_id_photos() FROM anon;
REVOKE ALL ON FUNCTION public.delete_expired_id_photos() FROM authenticated;
GRANT ALL ON FUNCTION public.delete_expired_id_photos() TO service_role;

-- ============================================================
-- 11. Hardened resolve_issue (Finding #4)
-- Enforces property membership and safe actor derivation
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_issue(
  p_issue_id uuid,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prop uuid;
  v_caller_staff_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT property_id INTO v_prop FROM issues WHERE id = p_issue_id;
  IF v_prop IS NULL THEN
    RAISE EXCEPTION 'Issue not found';
  END IF;

  IF NOT is_member(v_prop) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a member of this property';
  END IF;

  SELECT id INTO v_caller_staff_id 
  FROM staff_profiles 
  WHERE property_id = v_prop AND user_id = v_user_id AND active
  LIMIT 1;

  UPDATE issues
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = coalesce(v_caller_staff_id, p_staff_id, v_user_id)
  WHERE id = p_issue_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, v_user_id, 'resolve_issue', p_issue_id, coalesce(v_caller_staff_id, p_staff_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_issue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_issue(uuid, uuid) TO service_role;

-- ============================================================
-- 12. Storage Bucket RLS Policies for id_photos (Finding #5)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('id_photos', 'id_photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop any existing conflicting policies on storage.objects for id_photos
DROP POLICY IF EXISTS "Staff can upload ID photos for their property" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read ID photos for their property" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete ID photos for their property" ON storage.objects;

-- Allow upload only if caller is an active member or owner of the property (matching folder name)
CREATE POLICY "Staff can upload ID photos for their property"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'id_photos' AND (
      EXISTS (
        SELECT 1 FROM public.members m 
        WHERE m.property_id::text = (storage.foldername(name))[1] 
          AND m.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.properties p 
        WHERE p.id::text = (storage.foldername(name))[1] 
          AND p.owner_id = auth.uid()
      )
    )
  );

-- Allow read only if caller is an active member or owner of the property
CREATE POLICY "Staff can read ID photos for their property"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'id_photos' AND (
      EXISTS (
        SELECT 1 FROM public.members m 
        WHERE m.property_id::text = (storage.foldername(name))[1] 
          AND m.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.properties p 
        WHERE p.id::text = (storage.foldername(name))[1] 
          AND p.owner_id = auth.uid()
      )
    )
  );

-- Allow deletion only by property owner, co-admin, or service_role
CREATE POLICY "Staff can delete ID photos for their property"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'id_photos' AND (
      EXISTS (
        SELECT 1 FROM public.members m 
        WHERE m.property_id::text = (storage.foldername(name))[1] 
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'co_admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.properties p 
        WHERE p.id::text = (storage.foldername(name))[1] 
          AND p.owner_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 13. Revoke TRUNCATE Privileges on All Sensitive Tables (Finding #15)
-- TRUNCATE bypasses row-level security and must never be permitted to client roles
-- ============================================================
REVOKE TRUNCATE ON TABLE public.members FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.member_pins FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.cosign_attempts FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.units FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.rooms FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.stays FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.guests FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.audit_log FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.shifts FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.cash_entries FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.charges FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE public.payments FROM anon, authenticated;

