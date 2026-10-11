-- 0014_hardening_check_constraints.sql
-- Run in Supabase SQL Editor

BEGIN;

-- 1. CLEAN UP ANY OUT-OF-BOUNDS TEST DATA BEFORE ADDING CONSTRAINTS
DELETE FROM cash_entries WHERE amount <= 0 OR amount > 200000;
DELETE FROM payments WHERE amount <= 0 OR amount > 200000;
DELETE FROM charges WHERE qty < 1 OR qty > 50 OR unit_price < 0 OR unit_price > 50000;
DELETE FROM stays WHERE amount < 0 OR amount > 200000;

-- 2. LOAD-BEARING CHECK CONSTRAINTS (Prevent invalid/crafted RPC bounds bypass)
ALTER TABLE stays DROP CONSTRAINT IF EXISTS stays_amount_check;
ALTER TABLE stays DROP CONSTRAINT IF EXISTS chk_stays_amount;
ALTER TABLE stays ADD CONSTRAINT stays_amount_check CHECK (amount >= 0 AND amount <= 200000);

ALTER TABLE charges DROP CONSTRAINT IF EXISTS charges_qty_check;
ALTER TABLE charges DROP CONSTRAINT IF EXISTS chk_charges_qty;
ALTER TABLE charges DROP CONSTRAINT IF EXISTS chk_charges_price;
ALTER TABLE charges ADD CONSTRAINT charges_qty_check CHECK (qty BETWEEN 1 AND 50 AND unit_price BETWEEN 0 AND 50000);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_amount;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0 AND amount <= 200000);

ALTER TABLE cash_entries DROP CONSTRAINT IF EXISTS cash_amount_check;
ALTER TABLE cash_entries DROP CONSTRAINT IF EXISTS chk_cash_amount;
ALTER TABLE cash_entries ADD CONSTRAINT cash_amount_check CHECK (amount > 0 AND amount <= 200000);

-- 3. DEFENSE-IN-DEPTH: ENFORCE BOUNDS IN check_in_guest RPC
CREATE OR REPLACE FUNCTION check_in_guest(
  p_stay_id uuid, 
  p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, 
  p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text,
  p_unit_id uuid, p_amount numeric, p_pay_mode text,
  p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, 
  p_arrived_from text, p_next_dest text,
  p_staff_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE 
  v_open_shift_id uuid; 
  v_occupied boolean;
BEGIN
  IF NOT is_member(p_property_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  -- Server-side amount bounds check
  IF p_amount < 0 OR p_amount > 200000 THEN 
    RAISE EXCEPTION 'Amount must be between 0 and 200,000'; 
  END IF;

  IF EXISTS (SELECT 1 FROM stays WHERE id = p_stay_id) THEN RETURN p_stay_id; END IF;

  SELECT EXISTS(SELECT 1 FROM stays WHERE unit_id = p_unit_id AND status = 'checked_in') INTO v_occupied;
  IF v_occupied THEN RAISE EXCEPTION 'Bed is already occupied'; END IF;

  -- CASH CONTROL: Only require open shift if paying in cash now
  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    SELECT id INTO v_open_shift_id FROM shifts WHERE property_id = p_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot accept cash without an open shift'; END IF;
  END IF;

  INSERT INTO guests (id, property_id, name, phone, nationality, gender, id_type, id_last4, id_photo_path)
  VALUES (p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO stays (id, property_id, guest_id, unit_id, status, amount, pay_mode, staff_id)
  VALUES (p_stay_id, p_property_id, p_guest_id, p_unit_id, 'checked_in', p_amount, p_pay_mode, p_staff_id);

  IF p_is_foreign THEN
    INSERT INTO foreign_details (stay_id, passport_no, visa_no, visa_type, arrived_from, next_dest)
    VALUES (p_stay_id, p_passport_no, p_visa_no, p_visa_type, p_arrived_from, p_next_dest)
    ON CONFLICT (stay_id) DO NOTHING;
  END IF;

  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    INSERT INTO cash_entries (shift_id, kind, amount, note, staff_id)
    VALUES (v_open_shift_id, 'collection', p_amount, 'Check-in: ' || p_name, p_staff_id);
  END IF;

  RETURN p_stay_id;
END;
$$;

-- 4. BRUTE-FORCE RATE LIMITER FOR join_property (OWASP API6)
-- Max 5 failed attempts per user per 15 minutes tracked in audit_log
CREATE OR REPLACE FUNCTION join_property(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ 
DECLARE
  v_property_id uuid;
  v_user_id uuid := auth.uid();
  v_failed_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Rate limit check
  SELECT count(*) INTO v_failed_count 
  FROM audit_log 
  WHERE user_id = v_user_id 
    AND action = 'failed_join_attempt' 
    AND created_at > (now() - interval '15 minutes');
    
  IF v_failed_count >= 5 THEN
    RAISE EXCEPTION 'Too many failed join attempts. Please try again after 15 minutes.';
  END IF;

  -- Validate invite code
  SELECT property_id INTO v_property_id 
  FROM property_invites 
  WHERE code = upper(p_code) 
  AND expires_at > now();
  
  IF v_property_id IS NULL THEN
    INSERT INTO audit_log (user_id, action, details)
    VALUES (v_user_id, 'failed_join_attempt', jsonb_build_object('code', p_code));
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

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

COMMIT;
