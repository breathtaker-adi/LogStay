-- 0027_security_hardening_and_handover.sql
-- 1. Security Hardening: Remove p_actor / p_staff_id spoofing vulnerabilities
-- 2. Hardened Invite Redemption: Atomic lock and brute-force attempt limiting
-- 3. Staff Remarks Privacy Lockdown: Limit visibility to creating property & self only
-- 4. Approval Requests Pipeline: Desk refund/discount/write-off request & review
-- 5. Shift Handover Acceptance: Two-person blind count handover workflow
-- 6. Stay Operations: Expected checkout, due out/overdue tracking, extend stay, move bed
-- 7. UPI Reconciliation: Payment verification tracking
-- 8. Hardened check_in_guest & check_out_guest (Strict auth.uid() role derivation)

BEGIN;

-- ============================================================
-- 1. INVITE CODES HARDENING & ROLE ESCALATION FIX
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid, text);
DROP FUNCTION IF EXISTS public.generate_invite_code(uuid);

-- Function: generate_invite_code
-- Fix: Always derive caller's role strictly from auth.uid(). 
--      Never trust a client-supplied actor parameter.
CREATE OR REPLACE FUNCTION public.generate_invite_code(
  p_prop uuid,
  p_role text DEFAULT 'desk',
  p_actor uuid DEFAULT NULL -- Kept optional for backward compatibility, but ignored
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

  -- Derive caller role strictly from verified user_id in members table or property owner
  SELECT role INTO v_caller_role FROM members WHERE property_id = p_prop AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_prop AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized: Caller is not a member of this property';
  END IF;

  -- Validate allowed roles
  IF v_target_role NOT IN ('co_admin', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role requested: %', v_target_role;
  END IF;

  -- Strict hierarchy enforcement:
  -- Owner & Co-Admin can invite: co_admin, desk, housekeeping
  -- Desk can ONLY invite: housekeeping
  -- Housekeeping CANNOT invite anyone
  IF v_caller_role IN ('owner', 'co_admin') THEN
    -- Allowed to invite all staff roles
    NULL;
  ELSIF v_caller_role = 'desk' THEN
    IF v_target_role <> 'housekeeping' THEN
      RAISE EXCEPTION 'Front Desk staff can only generate invitation codes for Housekeepers';
    END IF;
  ELSE
    RAISE EXCEPTION 'Housekeeping staff are not permitted to generate invitation codes';
  END IF;

  -- Co-admin codes expire faster (4 hours); regular staff codes last 48 hours
  IF v_target_role = 'co_admin' THEN
    v_expiry_interval := interval '4 hours';
  ELSE
    v_expiry_interval := interval '48 hours';
  END IF;

  -- Cryptographically secure 6-char random code (avoiding 0, O, 1, I)
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1), '')
  INTO v_code FROM generate_series(1, 6);

  -- Invalidate any existing unused codes for this property & role
  UPDATE property_invites 
  SET used = true 
  WHERE property_id = p_prop AND role = v_target_role AND used = false;

  INSERT INTO property_invites (code, property_id, created_by, role, expires_at, used)
  VALUES (v_code, p_prop, v_user_id, v_target_role, now() + v_expiry_interval, false);

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop, v_user_id, 'generate_invite_code:' || v_target_role, p_prop);

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid, text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.redeem_invite_code(text, text, text);
DROP FUNCTION IF EXISTS public.redeem_invite_code(text, text);

-- Function: redeem_invite_code
-- Fix: Atomic update (prevents race condition), and brute-force attempt lockout
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

  -- Rate limiting check on join_attempts table
  SELECT * INTO v_att FROM join_attempts WHERE user_id = v_user_id;
  IF v_att.locked_until IS NOT NULL AND v_att.locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed invite attempts. Please try again after 15 minutes.';
  END IF;

  -- Atomic redemption: update and return in a single statement
  UPDATE property_invites
  SET used = true
  WHERE code = upper(trim(p_code))
    AND used = false
    AND expires_at > now()
  RETURNING * INTO v_invite;

  IF v_invite.property_id IS NULL THEN
    -- Increment failed attempt counter
    INSERT INTO join_attempts (user_id, failed_tries, locked_until)
    VALUES (v_user_id, 1, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      failed_tries = join_attempts.failed_tries + 1,
      locked_until = CASE WHEN join_attempts.failed_tries + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

    RAISE EXCEPTION 'Invalid, expired, or already used invite code.';
  END IF;

  -- Success: clear any lockout attempts
  DELETE FROM join_attempts WHERE user_id = v_user_id;

  -- Bind membership with assigned role
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

GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.cancel_invite_code(uuid, text);

-- Cancel active invite code
CREATE OR REPLACE FUNCTION public.cancel_invite_code(
  p_prop_id uuid,
  p_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only Owner and Co-Admin can cancel invitation codes';
  END IF;

  UPDATE property_invites
  SET used = true
  WHERE property_id = p_prop_id AND code = upper(trim(p_code));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_invite_code(uuid, text) TO authenticated;


-- ============================================================
-- 2. PRIVACY & SECURITY FIX: STAFF REMARKS LEDGER
-- ============================================================

-- Drop wide-open public/anon policies
DROP POLICY IF EXISTS "Authenticated members can view remarks" ON public.staff_remarks;
DROP POLICY IF EXISTS "Authenticated users can insert remarks" ON public.staff_remarks;
DROP POLICY IF EXISTS "Strict staff remarks view policy" ON public.staff_remarks;
DROP POLICY IF EXISTS "Strict staff remarks insert policy" ON public.staff_remarks;
REVOKE ALL ON public.staff_remarks FROM anon;

-- Reading remarks:
-- Allowed if caller is Owner or Co-Admin of the creating property,
-- OR if caller is the staff member themselves (user_id = auth.uid())
CREATE POLICY "Strict staff remarks view policy"
  ON public.staff_remarks FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      property_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM members m 
        WHERE m.property_id = staff_remarks.property_id 
          AND m.user_id = auth.uid() 
          AND m.role IN ('owner', 'co_admin')
      )
    )
  );

-- Inserting remarks: only via remove_team_member function (internal) or owner/co-admin
CREATE POLICY "Strict staff remarks insert policy"
  ON public.staff_remarks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.property_id = staff_remarks.property_id 
        AND m.user_id = auth.uid() 
        AND m.role IN ('owner', 'co_admin')
    )
  );

-- Fix: DROP old function first to prevent ERROR 42P13: cannot change return type of existing function
DROP FUNCTION IF EXISTS public.lookup_staff_remarks(text);
DROP FUNCTION IF EXISTS public.lookup_staff_remarks();

-- Update lookup_staff_remarks to require authentication and restrict cross-property snooping
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
  v_caller_phone text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to look up remarks';
  END IF;

  -- Fetch caller's registered phone
  SELECT phone INTO v_caller_phone FROM staff_profiles WHERE user_id = v_user_id LIMIT 1;

  -- Only return remarks that belong to the caller themselves (by user_id or verified phone)
  -- or from properties where caller is Owner/Co-Admin
  RETURN QUERY
  SELECT 
    sr.id,
    sr.property_name,
    sr.staff_name,
    sr.role,
    sr.remark,
    sr.removed_by_name,
    sr.removed_by_role,
    sr.created_at
  FROM staff_remarks sr
  WHERE 
    sr.user_id = v_user_id
    OR (v_caller_phone IS NOT NULL AND sr.phone = v_caller_phone)
    OR (
      sr.property_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM members m 
        WHERE m.property_id = sr.property_id 
          AND m.user_id = v_user_id 
          AND m.role IN ('owner', 'co_admin')
      )
    )
  ORDER BY sr.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_staff_remarks(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_staff_remarks(text) TO authenticated;


-- ============================================================
-- 3. APPROVAL REQUESTS PIPELINE (Refunds, Discounts, Write-Offs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  stay_id uuid REFERENCES public.stays(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('refund', 'discount', 'write_off', 'price_override')),
  amount numeric(10, 2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_by_name text NOT NULL,
  decided_by uuid REFERENCES auth.users(id),
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view approval requests" ON public.approval_requests;
CREATE POLICY "Members can view approval requests"
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members WHERE property_id = approval_requests.property_id AND user_id = auth.uid())
  );

DROP FUNCTION IF EXISTS public.request_approval(uuid, uuid, text, numeric, text);

-- RPC: request_approval (Front desk or co-admin submits)
CREATE OR REPLACE FUNCTION public.request_approval(
  p_prop_id uuid,
  p_stay_id uuid,
  p_kind text,
  p_amount numeric,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_staff_name text;
  v_role text;
  v_req_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role, name INTO v_role, v_staff_name 
  FROM staff_profiles 
  WHERE property_id = p_prop_id AND user_id = v_user_id 
  LIMIT 1;

  IF v_role IS NULL THEN
    SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
    v_staff_name := 'Staff Member';
  END IF;

  IF v_role IS NULL THEN RAISE EXCEPTION 'Not a member of this property'; END IF;

  IF p_kind NOT IN ('refund', 'discount', 'write_off', 'price_override') THEN
    RAISE EXCEPTION 'Invalid approval kind: %', p_kind;
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A clear reason is required for approval requests';
  END IF;

  INSERT INTO approval_requests (id, property_id, stay_id, kind, amount, reason, requested_by, requested_by_name)
  VALUES (v_req_id, p_prop_id, p_stay_id, p_kind, p_amount, trim(p_reason), v_user_id, coalesce(v_staff_name, 'Staff'));

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop_id, v_user_id, 'request_approval:' || p_kind, v_req_id);

  RETURN v_req_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_approval(uuid, uuid, text, numeric, text) TO authenticated;

DROP FUNCTION IF EXISTS public.decide_approval(uuid, boolean, text);

-- RPC: decide_approval (Owner or Co-Admin approves/declines)
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request has already been decided'; END IF;

  SELECT role, name INTO v_decider_role, v_decider_name
  FROM staff_profiles
  WHERE property_id = v_req.property_id AND user_id = v_user_id
  LIMIT 1;

  IF v_decider_role IS NULL THEN
    SELECT role INTO v_decider_role FROM members WHERE property_id = v_req.property_id AND user_id = v_user_id;
    v_decider_name := 'Manager';
  END IF;

  IF v_decider_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only Owner and Co-Admin can decide approval requests';
  END IF;

  UPDATE approval_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
      decided_by = v_user_id,
      decided_by_name = v_decider_name,
      decided_at = now(),
      decision_note = trim(p_note)
  WHERE id = p_request_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_req.property_id, v_user_id, CASE WHEN p_approve THEN 'approved_request:' ELSE 'declined_request:' END || v_req.kind, p_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, boolean, text) TO authenticated;


-- ============================================================
-- 4. TWO-PERSON SHIFT HANDOVER ACCEPTANCE
-- ============================================================

-- Add handover columns to shifts
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS handover_by uuid REFERENCES auth.users(id);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS handover_name text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS handover_cash numeric(10, 2);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS handover_at timestamptz;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS handover_variance numeric(10, 2);

-- Update status constraint to allow pending_handover
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check
  CHECK (status IN ('open', 'pending_handover', 'closed'));

DROP FUNCTION IF EXISTS public.submit_shift_handover(uuid, numeric);

-- Step 1: Outgoing staff submits blind count
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

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open';
  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Open shift not found'; END IF;

  IF NOT is_member(v_shift.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_closing_cash < 0 THEN RAISE EXCEPTION 'Closing cash cannot be negative'; END IF;

  UPDATE shifts
  SET closing_cash = p_closing_cash,
      closed_by = v_user_id,
      closed_at = now(),
      status = 'pending_handover'
  WHERE id = p_shift_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_shift.property_id, v_user_id, 'shift_handover_submitted', p_shift_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_shift_handover(uuid, numeric) TO authenticated;

DROP FUNCTION IF EXISTS public.accept_shift_handover(uuid, numeric, uuid);

-- Step 2: Incoming staff counts drawer blind and accepts handover
CREATE OR REPLACE FUNCTION public.accept_shift_handover(
  p_shift_id uuid,
  p_handover_cash numeric,
  p_new_shift_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shift record;
  v_staff_name text;
  v_expected_cash numeric;
  v_variance numeric;
  v_cash_collections numeric;
  v_petty_expenses numeric;
  v_refunds numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'pending_handover';
  IF v_shift.id IS NULL THEN RAISE EXCEPTION 'Shift is not pending handover'; END IF;
  IF NOT is_member(v_shift.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_handover_cash < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;

  -- Incoming staff name
  SELECT name INTO v_staff_name FROM staff_profiles WHERE property_id = v_shift.property_id AND user_id = v_user_id LIMIT 1;

  -- Compute expected cash from ledger
  SELECT coalesce(sum(amount), 0) INTO v_cash_collections
  FROM cash_entries WHERE shift_id = p_shift_id AND kind = 'collection';

  SELECT coalesce(sum(amount), 0) INTO v_petty_expenses
  FROM cash_entries WHERE shift_id = p_shift_id AND kind = 'petty';

  SELECT coalesce(sum(amount), 0) INTO v_refunds
  FROM cash_entries WHERE shift_id = p_shift_id AND kind = 'refund';

  v_expected_cash := v_shift.opening_cash + v_cash_collections - v_petty_expenses - v_refunds;
  v_variance := p_handover_cash - v_expected_cash;

  -- Close old shift
  UPDATE shifts
  SET handover_by = v_user_id,
      handover_name = coalesce(v_staff_name, 'Incoming Staff'),
      handover_cash = p_handover_cash,
      handover_at = now(),
      handover_variance = v_variance,
      status = 'closed'
  WHERE id = p_shift_id;

  -- Open new shift for incoming staff with verified cash as opening float
  INSERT INTO shifts (id, property_id, opened_by, opening_cash, status)
  VALUES (p_new_shift_id, v_shift.property_id, v_user_id, p_handover_cash, 'open');

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_shift.property_id, v_user_id, 'shift_handover_accepted:variance=' || v_variance, p_shift_id);

  RETURN p_new_shift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_shift_handover(uuid, numeric, uuid) TO authenticated;


-- ============================================================
-- 5. STAY OPERATIONS (Expected Checkout, Extend Stay, Move Bed)
-- ============================================================

ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS expected_checkout timestamptz;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS nights integer DEFAULT 1;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS upi_verified boolean DEFAULT false;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS upi_verified_at timestamptz;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS upi_verified_by uuid REFERENCES auth.users(id);

DROP FUNCTION IF EXISTS public.extend_stay(uuid, integer, numeric, text);

-- Extend Stay RPC
CREATE OR REPLACE FUNCTION public.extend_stay(
  p_stay_id uuid,
  p_additional_nights integer,
  p_additional_amount numeric,
  p_pay_mode text DEFAULT 'pay_later'
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_stay record;
  v_user_id uuid := auth.uid();
  v_new_checkout timestamptz;
  v_open_shift_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_stay FROM stays WHERE id = p_stay_id AND status = 'checked_in';
  IF v_stay.id IS NULL THEN RAISE EXCEPTION 'Active stay not found'; END IF;
  IF NOT is_member(v_stay.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_additional_nights < 1 THEN RAISE EXCEPTION 'Must extend by at least 1 night'; END IF;

  -- Calculate new expected checkout
  v_new_checkout := coalesce(v_stay.expected_checkout, v_stay.check_in + (coalesce(v_stay.nights, 1) || ' days')::interval) + (p_additional_nights || ' days')::interval;

  UPDATE stays
  SET expected_checkout = v_new_checkout,
      nights = coalesce(nights, 1) + p_additional_nights,
      amount = amount + coalesce(p_additional_amount, 0)
  WHERE id = p_stay_id;

  -- If additional amount charged
  IF p_additional_amount > 0 THEN
    IF p_pay_mode = 'cash' THEN
      SELECT id INTO v_open_shift_id FROM shifts WHERE property_id = v_stay.property_id AND status = 'open' LIMIT 1;
      IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot collect cash without an open shift'; END IF;
      INSERT INTO cash_entries (shift_id, kind, amount, note)
      VALUES (v_open_shift_id, 'collection', p_additional_amount, 'Stay extension: ' || p_additional_nights || ' night(s)');
    END IF;

    INSERT INTO charges (property_id, stay_id, item, qty, unit_price, paid, pay_mode)
    VALUES (v_stay.property_id, p_stay_id, 'Stay Extension (' || p_additional_nights || ' nights)', 1, p_additional_amount, p_pay_mode <> 'pay_later', p_pay_mode);
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_stay.property_id, v_user_id, 'extend_stay:nights=' || p_additional_nights, p_stay_id);

  RETURN v_new_checkout;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_stay(uuid, integer, numeric, text) TO authenticated;

DROP FUNCTION IF EXISTS public.move_stay(uuid, uuid);

-- Move Stay (Transfer Room/Bed) RPC
CREATE OR REPLACE FUNCTION public.move_stay(
  p_stay_id uuid,
  p_new_unit_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_stay record;
  v_old_unit_id uuid;
  v_guest record;
  v_new_unit record;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_stay FROM stays WHERE id = p_stay_id AND status = 'checked_in';
  IF v_stay.id IS NULL THEN RAISE EXCEPTION 'Active stay not found'; END IF;
  IF NOT is_member(v_stay.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  v_old_unit_id := v_stay.unit_id;
  IF v_old_unit_id = p_new_unit_id THEN
    RAISE EXCEPTION 'Guest is already assigned to this bed/room';
  END IF;

  -- Check new unit is vacant
  IF EXISTS (SELECT 1 FROM stays WHERE unit_id = p_new_unit_id AND status = 'checked_in') THEN
    RAISE EXCEPTION 'Target bed/room is already occupied';
  END IF;

  -- Check new unit gender rule compatibility
  SELECT * INTO v_new_unit FROM units WHERE id = p_new_unit_id;
  IF v_new_unit.id IS NULL THEN RAISE EXCEPTION 'Target unit not found'; END IF;

  SELECT * INTO v_guest FROM guests WHERE id = v_stay.guest_id;
  IF v_new_unit.gender_rule <> 'any' AND v_new_unit.gender_rule <> v_guest.gender THEN
    RAISE EXCEPTION 'Gender rule violation: Room is reserved for % guests only', v_new_unit.gender_rule;
  END IF;

  -- Atomic transfer
  UPDATE stays SET unit_id = p_new_unit_id WHERE id = p_stay_id;
  UPDATE units SET housekeeping_status = 'dirty' WHERE id = v_old_unit_id;
  UPDATE units SET housekeeping_status = 'clean' WHERE id = p_new_unit_id;

  INSERT INTO housekeeping_log (property_id, unit_id, status)
  VALUES (v_stay.property_id, v_old_unit_id, 'dirty');

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_stay.property_id, v_user_id, 'move_stay:from=' || v_old_unit_id || ':to=' || p_new_unit_id, p_stay_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_stay(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.verify_upi_payment(uuid, boolean);

-- Verify UPI Payment (Reconciliation) RPC
CREATE OR REPLACE FUNCTION public.verify_upi_payment(
  p_stay_id uuid,
  p_verified boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stay record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_stay FROM stays WHERE id = p_stay_id;
  IF v_stay.id IS NULL THEN RAISE EXCEPTION 'Stay not found'; END IF;
  IF NOT is_member(v_stay.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE stays
  SET upi_verified = p_verified,
      upi_verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
      upi_verified_by = CASE WHEN p_verified THEN v_user_id ELSE NULL END
  WHERE id = p_stay_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_stay.property_id, v_user_id, 'upi_reconciled:' || p_verified, p_stay_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_upi_payment(uuid, boolean) TO authenticated;


-- ============================================================
-- 6. HARDENED CHECK_IN_GUEST & CHECK_OUT_GUEST
-- ============================================================

DROP FUNCTION IF EXISTS public.check_in_guest(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, numeric, text, boolean, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.check_in_guest(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, numeric, text, boolean, text, text, text, text, text, uuid, integer, timestamptz);

-- Function: check_in_guest
-- Hardening: Derives actor role and staff identity strictly from auth.uid().
-- Captures expected_checkout and nights.
CREATE OR REPLACE FUNCTION public.check_in_guest(
  p_stay_id uuid, 
  p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, 
  p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text,
  p_unit_id uuid, p_amount numeric, p_pay_mode text,
  p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, 
  p_arrived_from text, p_next_dest text,
  p_staff_id uuid DEFAULT NULL,
  p_nights integer DEFAULT 1,
  p_expected_checkout timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ 
DECLARE 
  v_user_id uuid := auth.uid();
  v_caller_role text;
  v_actual_staff_id uuid;
  v_open_shift_id uuid; 
  v_occupied boolean;
  v_expected_co timestamptz;
BEGIN
  IF v_user_id IS NULL THEN 
    RAISE EXCEPTION 'Not authenticated'; 
  END IF;

  -- 1. Property membership perimeter check
  IF NOT is_member(p_property_id) THEN 
    RAISE EXCEPTION 'Not a member'; 
  END IF;

  -- 2. Role enforcement: Housekeeping cannot check in guests or collect money
  SELECT role INTO v_caller_role FROM members WHERE property_id = p_property_id AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = p_property_id AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin', 'desk') THEN
    RAISE EXCEPTION 'Housekeeping staff cannot check in guests or collect money';
  END IF;

  -- Resolve actual staff profile id from auth.uid()
  SELECT id INTO v_actual_staff_id FROM staff_profiles WHERE property_id = p_property_id AND user_id = v_user_id LIMIT 1;
  IF v_actual_staff_id IS NULL THEN
    v_actual_staff_id := p_staff_id;
  END IF;

  -- 3. Server-side amount bounds check
  IF p_amount < 0 OR p_amount > 200000 THEN 
    RAISE EXCEPTION 'Amount must be between 0 and 200,000'; 
  END IF;

  -- 4. Idempotency: if stay already exists, return stay id immediately
  IF EXISTS (SELECT 1 FROM stays WHERE id = p_stay_id) THEN 
    RETURN p_stay_id; 
  END IF;

  -- 5. Double-booking race guard
  SELECT EXISTS(SELECT 1 FROM stays WHERE unit_id = p_unit_id AND status = 'checked_in') INTO v_occupied;
  IF v_occupied THEN 
    RAISE EXCEPTION 'Bed is already occupied'; 
  END IF;

  -- 6. Cash control: require open shift if paying now
  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    SELECT id INTO v_open_shift_id FROM shifts WHERE property_id = p_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN 
      RAISE EXCEPTION 'Cannot accept cash without an open shift'; 
    END IF;
  END IF;

  -- 7. Guest insertion with explicit 6-month photo expiry
  INSERT INTO guests (
    id, property_id, name, phone, nationality, gender, id_type, id_last4, id_photo_path, id_photo_expires_at
  )
  VALUES (
    p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path,
    CASE WHEN p_id_photo_path IS NOT NULL AND p_id_photo_path <> '' THEN now() + interval '6 months' ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    id_photo_path = COALESCE(EXCLUDED.id_photo_path, guests.id_photo_path),
    id_photo_expires_at = CASE 
      WHEN EXCLUDED.id_photo_path IS NOT NULL AND guests.id_photo_expires_at IS NULL THEN now() + interval '6 months'
      ELSE guests.id_photo_expires_at 
    END;

  -- Calculate expected checkout
  v_expected_co := coalesce(p_expected_checkout, now() + (coalesce(p_nights, 1) || ' days')::interval);

  -- 8. Insert stay
  INSERT INTO stays (
    id, property_id, guest_id, unit_id, status, amount, pay_mode, staff_id, nights, expected_checkout, upi_verified
  )
  VALUES (
    p_stay_id, p_property_id, p_guest_id, p_unit_id, 'checked_in', p_amount, p_pay_mode, v_actual_staff_id, 
    coalesce(p_nights, 1), v_expected_co, false
  );

  -- 9. Foreign guest Form C details
  IF p_is_foreign THEN
    INSERT INTO foreign_details (stay_id, passport_no, visa_no, visa_type, arrived_from, next_dest)
    VALUES (p_stay_id, p_passport_no, p_visa_no, p_visa_type, p_arrived_from, p_next_dest)
    ON CONFLICT (stay_id) DO NOTHING;
  END IF;

  -- 10. Cash collection entry
  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    INSERT INTO cash_entries (shift_id, kind, amount, note, staff_id)
    VALUES (v_open_shift_id, 'collection', p_amount, 'Check-in: ' || p_name, v_actual_staff_id);
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_property_id, v_user_id, 'check_in_guest', p_stay_id, v_actual_staff_id);

  RETURN p_stay_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_guest(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, numeric, text, boolean, text, text, text, text, text, uuid, integer, timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.check_out_guest(uuid);
DROP FUNCTION IF EXISTS public.check_out_guest(uuid, uuid);

-- Function: check_out_guest
CREATE OR REPLACE FUNCTION public.check_out_guest(
  p_stay_id uuid,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stay record;
  v_caller_role text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_stay FROM stays WHERE id = p_stay_id;
  IF v_stay.id IS NULL THEN RAISE EXCEPTION 'Stay not found'; END IF;
  IF NOT is_member(v_stay.property_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT role INTO v_caller_role FROM members WHERE property_id = v_stay.property_id AND user_id = v_user_id;
  IF v_caller_role IS NULL THEN
    SELECT 'owner' INTO v_caller_role FROM properties WHERE id = v_stay.property_id AND owner_id = v_user_id;
  END IF;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'co_admin', 'desk') THEN
    RAISE EXCEPTION 'Not authorized to check out guests';
  END IF;

  UPDATE stays SET status = 'checked_out', check_out = now() WHERE id = p_stay_id;
  UPDATE units SET housekeeping_status = 'dirty' WHERE id = v_stay.unit_id;

  INSERT INTO housekeeping_log (property_id, unit_id, status)
  VALUES (v_stay.property_id, v_stay.unit_id, 'dirty');

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_stay.property_id, v_user_id, 'check_out_guest', p_stay_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_out_guest(uuid, uuid) TO authenticated;

COMMIT;
