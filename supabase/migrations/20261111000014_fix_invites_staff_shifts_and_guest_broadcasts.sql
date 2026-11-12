-- 20261111000014_fix_invites_staff_shifts_and_guest_broadcasts.sql
-- Resolves live production SQL errors and adds RBAC-gated Guest Broadcast messaging:
-- 1. property_invites: adds missing `used`, `used_at`, `used_by` columns; cleans up duplicate generate_invite_code overloads; aligns join_property_with_invite with redeem_invite_code
-- 2. staff_profiles / get_property_team: fixes 42702 ambiguous `property_id` in get_property_team and 42501 permission denied on staff_profiles_safe without exposing pin_hash; adds pre_register_staff RPC & syncs update_staff_role
-- 3. shifts: adds missing `closing_cash` column and keeps counted_cash aligned during handover
-- 4. guest_broadcasts: adds checked-in guest broadcast table, approval pipeline integration (owner/co_admin direct, desk requires approval), and dispatch RPCs

BEGIN;

-- ============================================================
-- 1. FIX property_invites (42703: column "used" does not exist)
-- ============================================================
ALTER TABLE public.property_invites
  ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_property_invites_code_active
  ON public.property_invites (code)
  WHERE used = false;

-- Remove stale 2-arg overload from initial schema and unify 3-arg signature
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, uuid);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, text);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid);

CREATE OR REPLACE FUNCTION public.generate_invite_code(
  p_prop uuid,
  p_role text DEFAULT 'desk',
  p_actor uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_code text;
  v_caller_role text;
  v_user_id uuid := auth.uid();
  v_target_role text := lower(trim(coalesce(p_role, 'desk')));
  v_expiry_interval interval;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.role INTO v_caller_role
  FROM public.members m
  WHERE m.property_id = p_prop AND m.user_id = v_user_id
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role
    FROM public.properties p
    WHERE p.id = p_prop AND p.owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized: Caller is not a member of this property';
  END IF;

  IF v_target_role NOT IN ('co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role requested: %', v_target_role;
  END IF;

  IF v_caller_role IN ('owner', 'co_admin') THEN
    NULL;
  ELSIF v_caller_role = 'desk' THEN
    IF v_target_role <> 'housekeeping' THEN
      RAISE EXCEPTION 'Front Desk staff can only generate invitation codes for Housekeepers';
    END IF;
  ELSE
    RAISE EXCEPTION 'Housekeeping staff are not permitted to generate invitation codes';
  END IF;

  IF v_target_role = 'co_admin' THEN
    v_expiry_interval := interval '4 hours';
  ELSE
    v_expiry_interval := interval '48 hours';
  END IF;

  -- Cryptographically secure 6-char code avoiding ambiguous glyphs (0, O, 1, I)
  SELECT string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1),
    ''
  )
  INTO v_code
  FROM generate_series(1, 6);

  UPDATE public.property_invites
  SET used = true,
      used_at = COALESCE(used_at, now())
  WHERE property_id = p_prop
    AND role = v_target_role
    AND used = false;

  INSERT INTO public.property_invites (code, property_id, created_by, role, expires_at, used)
  VALUES (v_code, p_prop, v_user_id, v_target_role, now() + v_expiry_interval, false);

  INSERT INTO public.audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop, v_user_id, 'generate_invite_code:' || v_target_role, p_prop);

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid, text, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.redeem_invite_code(text, text, text);
DROP FUNCTION IF EXISTS public.redeem_invite_code(text, text);

CREATE OR REPLACE FUNCTION public.redeem_invite_code(
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
  v_att record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Please provide your full name.';
  END IF;

  SELECT * INTO v_att FROM public.join_attempts WHERE user_id = v_user_id;
  IF v_att.locked_until IS NOT NULL AND v_att.locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed invite attempts. Please try again after 15 minutes.';
  END IF;

  UPDATE public.property_invites
  SET used = true,
      used_at = now(),
      used_by = v_user_id
  WHERE code = upper(trim(coalesce(p_code, '')))
    AND used = false
    AND expires_at > now()
  RETURNING * INTO v_invite;

  IF v_invite.property_id IS NULL THEN
    INSERT INTO public.join_attempts (user_id, failed_tries, locked_until)
    VALUES (v_user_id, 1, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      failed_tries = join_attempts.failed_tries + 1,
      locked_until = CASE
        WHEN join_attempts.failed_tries + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE NULL
      END;

    RAISE EXCEPTION 'Invalid, expired, or already used invite code.';
  END IF;

  DELETE FROM public.join_attempts WHERE user_id = v_user_id;

  DELETE FROM public.members WHERE property_id = v_invite.property_id AND user_id = v_user_id;
  INSERT INTO public.members (property_id, user_id, role)
  VALUES (v_invite.property_id, v_user_id, v_invite.role);

  SELECT sp.id INTO v_staff_id
  FROM public.staff_profiles sp
  WHERE sp.property_id = v_invite.property_id
    AND (
      sp.user_id = v_user_id
      OR (NULLIF(trim(coalesce(p_phone, '')), '') IS NOT NULL AND sp.phone = trim(p_phone))
    )
  LIMIT 1;

  IF v_staff_id IS NOT NULL THEN
    UPDATE public.staff_profiles
    SET name = trim(p_name),
        phone = COALESCE(NULLIF(trim(coalesce(p_phone, '')), ''), phone),
        role = v_invite.role,
        user_id = v_user_id,
        active = true,
        pin_hash = ''
    WHERE id = v_staff_id;
  ELSE
    v_staff_id := gen_random_uuid();
    INSERT INTO public.staff_profiles (id, property_id, user_id, name, phone, role, active, pin_hash)
    VALUES (v_staff_id, v_invite.property_id, v_user_id, trim(p_name), NULLIF(trim(coalesce(p_phone, '')), ''), v_invite.role, true, '');
  END IF;

  SELECT p.name INTO v_prop_name FROM public.properties p WHERE p.id = v_invite.property_id;

  INSERT INTO public.audit_log (property_id, user_id, action, record_id, staff_id)
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

GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text, text, text) TO service_role;

-- Keep legacy client RPC name join_property_with_invite routed through the atomic hardened implementation
CREATE OR REPLACE FUNCTION public.join_property_with_invite(
  p_code text,
  p_name text,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  RETURN public.redeem_invite_code(p_code, p_name, p_phone);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_property_with_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_property_with_invite(text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.cancel_invite_code(uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_invite_code(
  p_prop_id uuid,
  p_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.role INTO v_role
  FROM public.members m
  WHERE m.property_id = p_prop_id AND m.user_id = v_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    SELECT 'owner' INTO v_role
    FROM public.properties p
    WHERE p.id = p_prop_id AND p.owner_id = v_user_id;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only Owner and Co-Admin can cancel invitation codes';
  END IF;

  UPDATE public.property_invites
  SET used = true,
      used_at = COALESCE(used_at, now())
  WHERE property_id = p_prop_id AND code = upper(trim(coalesce(p_code, '')));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_invite_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invite_code(uuid, text) TO service_role;


-- ============================================================
-- 2. FIX staff_profiles (42501) & get_property_team (42702)
-- ============================================================

-- Lock down anon and grant SELECT ONLY on non-secret columns so security_invoker staff_profiles_safe works
REVOKE ALL ON TABLE public.staff_profiles FROM anon;
REVOKE ALL ON TABLE public.staff_profiles_safe FROM anon;

GRANT SELECT (
  id,
  property_id,
  user_id,
  name,
  phone,
  role,
  active,
  joined_on,
  created_at,
  deactivated_at,
  deactivated_by
) ON TABLE public.staff_profiles TO authenticated;

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

GRANT SELECT ON TABLE public.staff_profiles_safe TO authenticated;
GRANT ALL ON TABLE public.staff_profiles_safe TO service_role;

-- Fix 42702 ambiguous `property_id` in get_property_team by qualifying every column reference
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
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_prop_name text;
  v_mem record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.property_id = p_prop_id AND m.user_id = v_user_id
    UNION
    SELECT 1 FROM public.properties p WHERE p.id = p_prop_id AND p.owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this property';
  END IF;

  SELECT p.owner_id, p.name INTO v_owner_id, v_prop_name
  FROM public.properties p
  WHERE p.id = p_prop_id;

  IF v_owner_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.property_id = p_prop_id AND sp.role = 'owner'
    ) THEN
      INSERT INTO public.staff_profiles (id, property_id, user_id, name, role, active, pin_hash)
      VALUES (gen_random_uuid(), p_prop_id, v_owner_id, 'Owner', 'owner', true, '');
    END IF;
  END IF;

  FOR v_mem IN
    SELECT m.user_id AS mem_user_id, m.role AS mem_role
    FROM public.members m
    WHERE m.property_id = p_prop_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.property_id = p_prop_id
        AND (sp.user_id = v_mem.mem_user_id OR (v_mem.mem_role = 'owner' AND sp.role = 'owner'))
    ) THEN
      INSERT INTO public.staff_profiles (id, property_id, user_id, name, role, active, pin_hash)
      VALUES (
        gen_random_uuid(),
        p_prop_id,
        v_mem.mem_user_id,
        CASE
          WHEN v_mem.mem_role = 'owner' THEN 'Owner'
          WHEN v_mem.mem_role = 'co_admin' THEN 'Co-Admin'
          WHEN v_mem.mem_role = 'desk' THEN 'Front Desk'
          WHEN v_mem.mem_role = 'housekeeping' THEN 'Housekeeper'
          ELSE 'Staff Member'
        END,
        v_mem.mem_role,
        true,
        ''
      );
    END IF;
  END LOOP;

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
      FROM public.staff_remarks sr
      WHERE sr.staff_id = sp.id
         OR (sp.user_id IS NOT NULL AND sr.user_id = sp.user_id)
         OR (sp.phone IS NOT NULL AND length(sp.phone) > 4 AND sr.phone = sp.phone)
    ) AS remarks_count
  FROM public.staff_profiles sp
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
GRANT EXECUTE ON FUNCTION public.get_property_team(uuid) TO service_role;

-- Hardened RPC to pre-register a staff profile without granting direct INSERT on staff_profiles
CREATE OR REPLACE FUNCTION public.pre_register_staff(
  p_prop uuid,
  p_name text,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'desk'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_clean_role text := lower(trim(coalesce(p_role, 'desk')));
  v_new_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Please enter the staff member''s full name.';
  END IF;

  SELECT m.role INTO v_caller_role
  FROM public.members m
  WHERE m.property_id = p_prop AND m.user_id = v_user_id
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role
    FROM public.properties p
    WHERE p.id = p_prop AND p.owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized: Caller is not a member of this property';
  END IF;

  IF v_clean_role NOT IN ('co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role for staff registration: %', v_clean_role;
  END IF;

  IF v_caller_role = 'desk' AND v_clean_role <> 'housekeeping' THEN
    RAISE EXCEPTION 'Front Desk can only register Housekeepers.';
  ELSIF v_caller_role = 'housekeeping' THEN
    RAISE EXCEPTION 'Housekeeping staff cannot add team members.';
  END IF;

  INSERT INTO public.staff_profiles (id, property_id, name, phone, role, active, pin_hash)
  VALUES (v_new_id, p_prop, trim(p_name), NULLIF(trim(coalesce(p_phone, '')), ''), v_clean_role, true, '');

  INSERT INTO public.audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop, v_user_id, 'pre_register_staff:' || v_clean_role, v_new_id);

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pre_register_staff(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pre_register_staff(uuid, text, text, text) TO service_role;

-- Keep update_staff_role synchronized with members.role as well
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
  v_target_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.role INTO v_caller_role FROM public.members m WHERE m.property_id = p_prop AND m.user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM public.properties p WHERE p.id = p_prop AND p.owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Not allowed for this role: Only owners or co-admins can modify staff roles';
  END IF;

  IF v_caller_role = 'co_admin' AND v_clean_role IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only property owners can promote staff to Owner or Co-Admin';
  END IF;

  IF p_owner_pin IS NOT NULL AND trim(p_owner_pin) <> '' THEN
    PERFORM public.verify_owner_pin(p_prop, p_actor, p_owner_pin);
  END IF;

  IF v_clean_role NOT IN ('owner', 'co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role. Role must be owner, co_admin, desk, or housekeeping.';
  END IF;

  IF public.staff_role(p_prop, p_target) = 'owner' THEN
    IF v_caller_role <> 'owner' THEN
      RAISE EXCEPTION 'Only an owner can modify another owner role';
    END IF;
    IF v_clean_role <> 'owner' AND NOT EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.property_id = p_prop AND sp.role = 'owner' AND sp.active AND sp.id <> p_target
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last remaining active owner.';
    END IF;
  END IF;

  UPDATE public.staff_profiles
  SET role = v_clean_role
  WHERE id = p_target AND property_id = p_prop
  RETURNING user_id INTO v_target_user_id;

  IF v_target_user_id IS NOT NULL THEN
    UPDATE public.members
    SET role = v_clean_role
    WHERE property_id = p_prop AND user_id = v_target_user_id;
  END IF;

  INSERT INTO public.audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, v_user_id, 'update_staff_role:' || v_clean_role, p_target, p_actor);
END;
$$;


-- ============================================================
-- 3. FIX shifts.closing_cash (42703: column shifts.closing_cash does not exist)
-- ============================================================
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS closing_cash numeric(10, 2);

UPDATE public.shifts
SET closing_cash = counted_cash
WHERE closing_cash IS NULL AND counted_cash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_shift_handover(
  p_shift_id uuid,
  p_closing_cash numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shift record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id AND status = 'open';
  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Open shift not found'; END IF;

  IF NOT public.is_member(v_shift.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_closing_cash < 0 THEN RAISE EXCEPTION 'Closing cash cannot be negative'; END IF;

  UPDATE public.shifts
  SET closing_cash = p_closing_cash,
      counted_cash = p_closing_cash,
      closed_by = v_user_id,
      closed_at = now(),
      status = 'pending_handover'
  WHERE id = p_shift_id;

  INSERT INTO public.audit_log (property_id, user_id, action, record_id)
  VALUES (v_shift.property_id, v_user_id, 'shift_handover_submitted', p_shift_id);
END;
$$;


-- ============================================================
-- 4. GUEST BROADCAST MESSAGING & APPROVAL PIPELINE
-- ============================================================

-- Expand approval_requests kind check to include 'guest_broadcast'
ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_kind_check;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_kind_check
  CHECK (kind IN ('refund', 'discount', 'write_off', 'price_override', 'guest_broadcast'));

CREATE TABLE IF NOT EXISTS public.guest_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('emergency', 'update', 'housekeeping', 'checkout_reminder')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_approval', 'approved', 'sent', 'declined')),
  recipient_count integer NOT NULL DEFAULT 0,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_request_id uuid REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_by_name text NOT NULL,
  requested_by_role text NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_by_name text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_broadcasts_prop_created
  ON public.guest_broadcasts (property_id, created_at DESC);

ALTER TABLE public.guest_broadcasts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guest_broadcasts FROM anon;
REVOKE TRUNCATE ON TABLE public.guest_broadcasts FROM anon, authenticated;

DROP POLICY IF EXISTS "Members can view guest broadcasts" ON public.guest_broadcasts;
CREATE POLICY "Members can view guest broadcasts"
  ON public.guest_broadcasts FOR SELECT TO authenticated
  USING (public.is_member(property_id));

-- Helper to snapshot all currently checked-in guests & their assigned room/bed
CREATE OR REPLACE FUNCTION public.get_checked_in_broadcast_recipients(
  p_prop_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_recipients jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.role INTO v_role FROM public.members m WHERE m.property_id = p_prop_id AND m.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL THEN
    SELECT 'owner' INTO v_role FROM public.properties p WHERE p.id = p_prop_id AND p.owner_id = v_user_id;
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this property';
  END IF;

  IF v_role = 'housekeeping' THEN
    RAISE EXCEPTION 'Guest phone directory is restricted to Front Desk, Co-Admin, and Owner';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stay_id', s.id,
        'guest_id', g.id,
        'name', coalesce(g.name, 'Guest'),
        'phone', g.phone,
        'unit_label', coalesce(r.label || ' · ' || u.label, u.label, 'Room')
      )
      ORDER BY r.label, u.label, g.name
    ),
    '[]'::jsonb
  )
  INTO v_recipients
  FROM public.stays s
  JOIN public.guests g ON g.id = s.guest_id
  LEFT JOIN public.units u ON u.id = s.unit_id
  LEFT JOIN public.rooms r ON r.id = u.room_id
  WHERE s.property_id = p_prop_id
    AND s.status = 'checked_in';

  RETURN v_recipients;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_checked_in_broadcast_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_checked_in_broadcast_recipients(uuid) TO service_role;

-- Submit broadcast:
-- * Owner / Co-Admin -> created as 'sent' immediately with recipient payload for dispatch
-- * Front Desk -> created as 'pending_approval' + linked approval_requests row for Owner/Co-Admin decision
CREATE OR REPLACE FUNCTION public.submit_guest_broadcast(
  p_prop_id uuid,
  p_category text,
  p_title text,
  p_message text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_staff_name text;
  v_clean_cat text := lower(trim(coalesce(p_category, 'update')));
  v_clean_title text := trim(coalesce(p_title, ''));
  v_clean_msg text := trim(coalesce(p_message, ''));
  v_recipients jsonb;
  v_count integer;
  v_broadcast_id uuid := gen_random_uuid();
  v_approval_id uuid := NULL;
  v_status text;
  v_requires_approval boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT m.role INTO v_role FROM public.members m WHERE m.property_id = p_prop_id AND m.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL THEN
    SELECT 'owner' INTO v_role FROM public.properties p WHERE p.id = p_prop_id AND p.owner_id = v_user_id;
  END IF;

  IF v_role IS NULL THEN RAISE EXCEPTION 'Not a member of this property'; END IF;
  IF v_role = 'housekeeping' THEN
    RAISE EXCEPTION 'Housekeeping staff cannot send guest broadcasts.';
  END IF;

  SELECT sp.name INTO v_staff_name
  FROM public.staff_profiles sp
  WHERE sp.property_id = p_prop_id AND sp.user_id = v_user_id
  LIMIT 1;
  v_staff_name := coalesce(nullif(trim(v_staff_name), ''), initcap(replace(v_role, '_', ' ')));

  IF v_clean_cat NOT IN ('emergency', 'update', 'housekeeping', 'checkout_reminder') THEN
    RAISE EXCEPTION 'Invalid broadcast category: %', v_clean_cat;
  END IF;
  IF length(v_clean_title) < 2 THEN
    RAISE EXCEPTION 'Please provide a broadcast title.';
  END IF;
  IF length(v_clean_msg) < 5 THEN
    RAISE EXCEPTION 'Please enter a message for checked-in guests.';
  END IF;

  v_recipients := public.get_checked_in_broadcast_recipients(p_prop_id);
  v_count := jsonb_array_length(v_recipients);

  IF v_role IN ('owner', 'co_admin') THEN
    v_requires_approval := false;
    v_status := 'sent';

    INSERT INTO public.guest_broadcasts (
      id, property_id, category, title, message, status, recipient_count, recipients,
      requested_by, requested_by_name, requested_by_role,
      approved_by, approved_by_name, approved_at, sent_at
    ) VALUES (
      v_broadcast_id, p_prop_id, v_clean_cat, v_clean_title, v_clean_msg,
      'sent', v_count, v_recipients,
      v_user_id, v_staff_name, v_role,
      v_user_id, v_staff_name, now(), now()
    );

    INSERT INTO public.audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'guest_broadcast_sent:' || v_clean_cat, v_broadcast_id);
  ELSE
    v_requires_approval := true;
    v_status := 'pending_approval';
    v_approval_id := gen_random_uuid();

    INSERT INTO public.approval_requests (
      id, property_id, stay_id, kind, amount, reason, status, requested_by, requested_by_name
    ) VALUES (
      v_approval_id,
      p_prop_id,
      NULL,
      'guest_broadcast',
      0,
      '[' || upper(v_clean_cat) || '] ' || v_clean_title || ' — ' || v_clean_msg,
      'pending',
      v_user_id,
      v_staff_name
    );

    INSERT INTO public.guest_broadcasts (
      id, property_id, category, title, message, status, recipient_count, recipients,
      approval_request_id, requested_by, requested_by_name, requested_by_role
    ) VALUES (
      v_broadcast_id, p_prop_id, v_clean_cat, v_clean_title, v_clean_msg,
      'pending_approval', v_count, v_recipients,
      v_approval_id, v_user_id, v_staff_name, v_role
    );

    INSERT INTO public.audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'guest_broadcast_requested:' || v_clean_cat, v_broadcast_id);
  END IF;

  RETURN jsonb_build_object(
    'broadcast_id', v_broadcast_id,
    'approval_request_id', v_approval_id,
    'status', v_status,
    'requires_approval', v_requires_approval,
    'recipient_count', v_count,
    'recipients', v_recipients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_guest_broadcast(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_broadcast(uuid, text, text, text) TO service_role;

-- Update decide_approval so approving/declining a guest_broadcast approval request
-- transitions the linked guest_broadcasts record & refreshes checked-in recipients
CREATE OR REPLACE FUNCTION public.decide_approval(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req record;
  v_decider_role text;
  v_decider_name text;
  v_recipients jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.approval_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request has already been decided'; END IF;

  SELECT m.role INTO v_decider_role
  FROM public.members m
  WHERE m.property_id = v_req.property_id AND m.user_id = v_user_id
  LIMIT 1;

  IF v_decider_role IS NULL THEN
    SELECT 'owner' INTO v_decider_role
    FROM public.properties p
    WHERE p.id = v_req.property_id AND p.owner_id = v_user_id;
  END IF;

  SELECT sp.name INTO v_decider_name
  FROM public.staff_profiles sp
  WHERE sp.property_id = v_req.property_id AND sp.user_id = v_user_id
  LIMIT 1;
  v_decider_name := coalesce(nullif(trim(v_decider_name), ''), 'Manager');

  IF v_decider_role IS NULL OR v_decider_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only Owner and Co-Admin can decide approval requests';
  END IF;

  UPDATE public.approval_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
      decided_by = v_user_id,
      decided_by_name = v_decider_name,
      decided_at = now(),
      decision_note = trim(p_note)
  WHERE id = p_request_id;

  IF v_req.kind = 'guest_broadcast' THEN
    IF p_approve THEN
      v_recipients := public.get_checked_in_broadcast_recipients(v_req.property_id);
      UPDATE public.guest_broadcasts
      SET status = 'approved',
          recipients = v_recipients,
          recipient_count = jsonb_array_length(v_recipients),
          approved_by = v_user_id,
          approved_by_name = v_decider_name,
          approved_at = now()
      WHERE approval_request_id = p_request_id;
    ELSE
      UPDATE public.guest_broadcasts
      SET status = 'declined',
          approved_by = v_user_id,
          approved_by_name = v_decider_name,
          approved_at = now()
      WHERE approval_request_id = p_request_id;
    END IF;
  END IF;

  INSERT INTO public.audit_log (property_id, user_id, action, record_id)
  VALUES (
    v_req.property_id,
    v_user_id,
    CASE WHEN p_approve THEN 'approved_request:' ELSE 'declined_request:' END || v_req.kind,
    p_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, boolean, text) TO service_role;

-- Mark an approved (or owner-sent) broadcast as dispatched & refresh current checked-in recipients
CREATE OR REPLACE FUNCTION public.mark_guest_broadcast_sent(
  p_broadcast_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_b record;
  v_role text;
  v_recipients jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_b FROM public.guest_broadcasts WHERE id = p_broadcast_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Broadcast not found'; END IF;

  SELECT m.role INTO v_role FROM public.members m WHERE m.property_id = v_b.property_id AND m.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL THEN
    SELECT 'owner' INTO v_role FROM public.properties p WHERE p.id = v_b.property_id AND p.owner_id = v_user_id;
  END IF;

  IF v_role IS NULL OR v_role = 'housekeeping' THEN
    RAISE EXCEPTION 'Unauthorized to dispatch guest broadcasts';
  END IF;

  IF v_b.status NOT IN ('approved', 'sent') THEN
    RAISE EXCEPTION 'Broadcast must be approved by Owner or Co-Admin before sending';
  END IF;

  v_recipients := public.get_checked_in_broadcast_recipients(v_b.property_id);

  UPDATE public.guest_broadcasts
  SET status = 'sent',
      recipients = v_recipients,
      recipient_count = jsonb_array_length(v_recipients),
      sent_at = coalesce(sent_at, now())
  WHERE id = p_broadcast_id;

  INSERT INTO public.audit_log (property_id, user_id, action, record_id)
  VALUES (v_b.property_id, v_user_id, 'guest_broadcast_dispatched', p_broadcast_id);

  RETURN jsonb_build_object(
    'broadcast_id', p_broadcast_id,
    'status', 'sent',
    'recipient_count', jsonb_array_length(v_recipients),
    'recipients', v_recipients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_guest_broadcast_sent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_guest_broadcast_sent(uuid) TO service_role;

COMMIT;

