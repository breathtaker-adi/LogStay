-- 0007_phase6_money.sql

-- 1. Create Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id uuid primary key, -- Client-generated UUID for idempotency
  property_id uuid references properties(id) on delete cascade not null,
  stay_id uuid references stays(id) on delete cascade not null,
  amount numeric(10,2) not null check (amount > 0),
  pay_mode text check (pay_mode in ('cash', 'upi')),
  shift_id uuid references shifts(id),
  staff_id uuid references staff_profiles(id),
  created_at timestamptz default now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments rw" ON payments FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 2. Drop old record_payment function
DROP FUNCTION IF EXISTS record_payment(uuid, numeric, text, uuid);

-- 3. Create Idempotent record_payment function
CREATE OR REPLACE FUNCTION record_payment(
  p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  -- Idempotency: if payment already exists, do nothing
  IF EXISTS (SELECT 1 FROM payments WHERE id = p_payment_id) THEN
    RETURN;
  END IF;

  SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stay not found'; END IF;
  
  PERFORM require_role(v_property_id, p_staff_id, array['owner', 'desk']);

  -- Insert the payment record
  INSERT INTO payments (id, property_id, stay_id, amount, pay_mode, staff_id)
  VALUES (p_payment_id, v_property_id, p_stay_id, p_amount, p_pay_mode, p_staff_id);

  -- If cash, link to open shift and write cash entry
  IF p_pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot collect cash without an open shift'; END IF;
    
    UPDATE payments SET shift_id = v_open_shift_id WHERE id = p_payment_id;
    
    INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
    VALUES (p_payment_id, v_open_shift_id, 'collection', p_amount, 'Payment on Folio', p_staff_id);
  END IF;

  -- Update stay's paid amount
  UPDATE stays 
  SET paid_amount = coalesce(paid_amount, 0) + p_amount 
  WHERE id = p_stay_id;
END;
 $$;

-- 4. Allow Pay-Later Check-ins
-- Drop the old check_in_guest signature to update it
DROP FUNCTION IF EXISTS check_in_guest(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, numeric, text, boolean, text, text, text, text, text, uuid);

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

  IF EXISTS (SELECT 1 FROM stays WHERE id = p_stay_id) THEN RETURN p_stay_id; END IF;

  SELECT EXISTS(SELECT 1 FROM stays WHERE unit_id = p_unit_id AND status = 'checked_in') INTO v_occupied;
  IF v_occupied THEN RAISE EXCEPTION 'Bed is already occupied'; END IF;

  -- CASH CONTROL: Only require open shift if they are paying NOW
  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    SELECT id INTO v_open_shift_id FROM shifts WHERE property_id = p_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot accept cash without an open shift'; END IF;
  END IF;

  INSERT INTO guests (id, property_id, name, phone, nationality, gender, id_type, id_last4, id_photo_path)
  VALUES (p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path)
  ON CONFLICT (id) DO NOTHING;

  -- Insert Stay. paid_amount starts at 0 if they are paying later.
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