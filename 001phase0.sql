-- 0001_phase0.sql: Hardening, Idempotency, and Cash Logic Fixes

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- 1. FORCE ID PHOTOS BUCKET TO PRIVATE
UPDATE storage.buckets SET public = false WHERE id = 'id_photos';

-- 2. SECURE PINS HANDLING
ALTER TABLE members DROP COLUMN IF EXISTS pin;

CREATE TABLE IF NOT EXISTS member_pins (
  property_id uuid REFERENCES properties(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  pin_hash text NOT NULL,
  PRIMARY KEY (property_id, user_id)
);
ALTER TABLE member_pins ENABLE ROW LEVEL SECURITY;

-- 3. COSIGN ATTEMPT LOCKOUT TABLE
CREATE TABLE IF NOT EXISTS cosign_attempts (
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  property_id uuid REFERENCES properties(id) NOT NULL,
  attempts int DEFAULT 0,
  locked_until timestamptz,
  PRIMARY KEY (user_id, property_id)
);
ALTER TABLE cosign_attempts ENABLE ROW LEVEL SECURITY;

-- 4. CASH ENTRIES & STAYS UPDATES
ALTER TABLE cash_entries DROP CONSTRAINT IF EXISTS cash_entries_kind_check;
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_kind_check 
  CHECK (kind IN ('petty', 'collection', 'refund'));

ALTER TABLE stays ALTER COLUMN id DROP DEFAULT;

-- 5. HELPER FUNCTION: is_member
CREATE OR REPLACE FUNCTION is_member(p uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions AS $$   SELECT EXISTS (SELECT 1 FROM members WHERE property_id = p AND user_id = auth.uid());
 $$;

-- 6. FIX: Idempotent & Cash-Safe Check-In
CREATE OR REPLACE FUNCTION check_in_guest(
  p_stay_id uuid, 
  p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, 
  p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text,
  p_unit_id uuid, p_amount numeric, p_pay_mode text,
  p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, 
  p_arrived_from text, p_next_dest text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE 
  v_open_shift_id uuid; 
  v_occupied boolean;
BEGIN
  IF NOT is_member(p_property_id) THEN 
    RAISE EXCEPTION 'Not a member of this property'; 
  END IF;

  IF EXISTS (SELECT 1 FROM stays WHERE id = p_stay_id) THEN
    RETURN p_stay_id;
  END IF;

  SELECT EXISTS(SELECT 1 FROM stays WHERE unit_id = p_unit_id AND status = 'checked_in') INTO v_occupied;
  IF v_occupied THEN 
    RAISE EXCEPTION 'Bed is already occupied'; 
  END IF;

  IF p_pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = p_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN
      RAISE EXCEPTION 'Cannot accept cash without an open shift';
    END IF;
  END IF;

  INSERT INTO guests (id, property_id, name, phone, nationality, gender, id_type, id_last4, id_photo_path)
  VALUES (p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO stays (id, property_id, guest_id, unit_id, status, amount, pay_mode)
  VALUES (p_stay_id, p_property_id, p_guest_id, p_unit_id, 'checked_in', p_amount, p_pay_mode);

  IF p_is_foreign THEN
    INSERT INTO foreign_details (stay_id, passport_no, visa_no, visa_type, arrived_from, next_dest)
    VALUES (p_stay_id, p_passport_no, p_visa_no, p_visa_type, p_arrived_from, p_next_dest)
    ON CONFLICT (stay_id) DO NOTHING;
  END IF;

  IF p_pay_mode = 'cash' THEN
    INSERT INTO cash_entries (shift_id, kind, amount, note)
    VALUES (v_open_shift_id, 'collection', p_amount, 'Check-in: ' || p_name);
  END IF;

  RETURN p_stay_id;
END;
 $$;

-- 7. FIX: Authorized & Atomic Check-Out
CREATE OR REPLACE FUNCTION check_out_guest(p_stay_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
  v_unit_id uuid;
BEGIN
  SELECT property_id, unit_id INTO v_property_id, v_unit_id
  FROM stays WHERE id = p_stay_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stay not found';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not a member of this property';
  END IF;

  UPDATE stays SET status = 'checked_out', check_out = now() WHERE id = p_stay_id;
  UPDATE units SET housekeeping_status = 'dirty' WHERE id = v_unit_id;
END;
 $$;

-- 8. FIX: Set PIN & Verify Co-sign with Lockout
CREATE OR REPLACE FUNCTION set_pin(p_prop uuid, p_pin text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$   INSERT INTO member_pins (property_id, user_id, pin_hash) 
  VALUES (p_prop, auth.uid(), crypt(p_pin, gen_salt('bf')))
  ON CONFLICT (property_id, user_id) DO UPDATE SET pin_hash = excluded.pin_hash;
 $$;

CREATE OR REPLACE FUNCTION verify_cosign(p_prop uuid, p_pin text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_locked_until timestamptz;
  v_attempts int;
  v_valid boolean;
BEGIN
  SELECT locked_until, attempts INTO v_locked_until, v_attempts
  FROM cosign_attempts WHERE user_id = auth.uid() AND property_id = p_prop;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed attempts. Try again after %', v_locked_until;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM member_pins 
    WHERE property_id = p_prop AND user_id != auth.uid() AND pin_hash = crypt(p_pin, pin_hash)
  ) INTO v_valid;

  IF v_valid THEN
    DELETE FROM cosign_attempts WHERE user_id = auth.uid() AND property_id = p_prop;
    RETURN true;
  ELSE
    INSERT INTO cosign_attempts (user_id, property_id, attempts, locked_until)
    VALUES (auth.uid(), p_prop, 1, null)
    ON CONFLICT (user_id, property_id) DO UPDATE 
    SET attempts = cosign_attempts.attempts + 1,
        locked_until = CASE 
          WHEN cosign_attempts.attempts + 1 >= 5 THEN now() + interval '5 minutes' 
          ELSE null 
        END;
    RETURN false;
  END IF;
END;
 $$;

-- 9. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_stays_property_status ON stays(property_id, status);
CREATE INDEX IF NOT EXISTS idx_stays_unit ON stays(unit_id);
CREATE INDEX IF NOT EXISTS idx_guests_property_name ON guests(property_id, name);

COMMIT;