-- 0015_checkin_role_guard.sql
-- Enforces role check on check_in_guest (only owner and desk staff can check in guests and collect money)

BEGIN;

CREATE OR REPLACE FUNCTION public.check_in_guest(
  p_stay_id uuid, 
  p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, 
  p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text,
  p_unit_id uuid, p_amount numeric, p_pay_mode text,
  p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, 
  p_arrived_from text, p_next_dest text,
  p_staff_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ 
DECLARE 
  v_open_shift_id uuid; 
  v_occupied boolean;
BEGIN
  -- 1. Property membership perimeter check
  IF NOT is_member(p_property_id) THEN 
    RAISE EXCEPTION 'Not a member'; 
  END IF;

  -- 2. Role enforcement: Housekeeping cannot check in guests or collect money
  PERFORM require_role(p_property_id, p_staff_id, ARRAY['owner', 'desk']);

  -- 3. Server-side amount bounds check (defense-in-depth)
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

  -- 8. Insert stay
  INSERT INTO stays (id, property_id, guest_id, unit_id, status, amount, pay_mode, staff_id)
  VALUES (p_stay_id, p_property_id, p_guest_id, p_unit_id, 'checked_in', p_amount, p_pay_mode, p_staff_id);

  -- 9. Foreign guest Form C details
  IF p_is_foreign THEN
    INSERT INTO foreign_details (stay_id, passport_no, visa_no, visa_type, arrived_from, next_dest)
    VALUES (p_stay_id, p_passport_no, p_visa_no, p_visa_type, p_arrived_from, p_next_dest)
    ON CONFLICT (stay_id) DO NOTHING;
  END IF;

  -- 10. Cash collection entry
  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    INSERT INTO cash_entries (shift_id, kind, amount, note, staff_id)
    VALUES (v_open_shift_id, 'collection', p_amount, 'Check-in: ' || p_name, p_staff_id);
  END IF;

  RETURN p_stay_id;
END;
$$;

COMMIT;
