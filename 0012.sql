BEGIN;

DROP FUNCTION IF EXISTS verify_cosign(uuid, text);

CREATE OR REPLACE FUNCTION close_shift_secure(
  p_shift_id uuid, 
  p_counted_cash numeric, 
  p_staff_id uuid, 
  p_cosign_pin text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_shift shifts%ROWTYPE; 
  v_closer staff_profiles%ROWTYPE;
  v_cosigner staff_profiles%ROWTYPE; 
  v_cosigned boolean := false; 
  v_cosigner_name text;
BEGIN
  -- 1. Lock and validate shift
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active shift not found or already closed.'; END IF;

  -- 2. Validate property membership
  IF NOT is_member(v_shift.property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  -- 3. Validate closer profile
  SELECT * INTO v_closer FROM staff_profiles
  WHERE id = p_staff_id AND property_id = v_shift.property_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closer staff profile not found or inactive.'; END IF;

  -- 4. Validate cash range
  IF p_counted_cash IS NULL OR p_counted_cash < 0 OR p_counted_cash > 10000000 THEN
    RAISE EXCEPTION 'Counted cash out of allowed range.';
  END IF;

  -- 5. Brute-force guard: 5 failed co-signs on this shift = 15 min lockout
  IF (SELECT count(*) FROM audit_log WHERE action = 'cosign_failed'
        AND record_id = p_shift_id AND created_at > now() - interval '15 minutes') >= 5 THEN
    RAISE EXCEPTION 'Too many failed co-sign attempts. Wait 15 minutes.';
  END IF;

  -- 6. Co-sign verification logic
  IF v_closer.role = 'owner' AND (p_cosign_pin IS NULL OR trim(p_cosign_pin) = '') THEN
    v_cosigned := false;  -- owner solo close, audit-logged
  ELSE
    IF p_cosign_pin IS NULL OR trim(p_cosign_pin) = '' THEN
      RAISE EXCEPTION 'Incoming staff co-sign PIN is required.';
    END IF;

    -- Match PIN against active staff in same property (excluding housekeeping)
    SELECT * INTO v_cosigner FROM staff_profiles
    WHERE property_id = v_shift.property_id 
      AND active = true
      AND role IN ('desk', 'owner')
      AND pin_hash = crypt(p_cosign_pin, pin_hash)
    ORDER BY (id <> p_staff_id) DESC   -- if two staff share a PIN, prefer the other person
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO audit_log (property_id, user_id, action, record_id)
      VALUES (v_shift.property_id, auth.uid(), 'cosign_failed', p_shift_id);
      RAISE EXCEPTION 'Invalid PIN: no active staff profile matched.';
    END IF;

    IF v_cosigner.id = v_closer.id THEN
      INSERT INTO audit_log (property_id, user_id, action, record_id)
      VALUES (v_shift.property_id, auth.uid(), 'cosign_self_rejected', p_shift_id);
      RAISE EXCEPTION 'You cannot co-sign your own shift. Another staff member or the owner must verify.';
    END IF;

    v_cosigned := true; 
    v_cosigner_name := v_cosigner.name;
  END IF;

  -- 7. Atomic shift close
  UPDATE shifts SET 
    status = 'closed', 
    counted_cash = p_counted_cash,
    closed_by = auth.uid(), 
    closed_at = now(), 
    co_signed = v_cosigned
  WHERE id = p_shift_id;

  -- 8. Audit logging
  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (
    v_shift.property_id, 
    auth.uid(),
    CASE WHEN v_closer.role = 'owner' AND NOT v_cosigned THEN 'shift_closed_by_owner' ELSE 'shift_closed' END,
    p_shift_id
  );

  RETURN jsonb_build_object('success', true, 'co_signed', v_cosigned, 'cosigner', v_cosigner_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION close_shift_secure(uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_shift_secure(uuid, numeric, uuid, text) TO authenticated;

COMMIT;
