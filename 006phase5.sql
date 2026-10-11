-- 0006_phase5_rbac_functions_FIXED.sql

-- 1. Drop old check_out_guest signatures to avoid parameter conflicts
DROP FUNCTION IF EXISTS check_out_guest(uuid);
DROP FUNCTION IF EXISTS check_out_guest(uuid, uuid);

-- 2. Secure check_out_guest
CREATE OR REPLACE FUNCTION check_out_guest(p_stay_id uuid, p_staff_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
  v_unit_id uuid;
BEGIN
  SELECT property_id, unit_id INTO v_property_id, v_unit_id FROM stays WHERE id = p_stay_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stay not found'; END IF;
  
  PERFORM require_role(v_property_id, p_staff_id, array['owner', 'desk']);
  
  UPDATE stays SET status = 'checked_out', check_out = now() 
  WHERE id = p_stay_id AND status = 'checked_in';
  
  UPDATE units SET housekeeping_status = 'dirty' WHERE id = v_unit_id;
END;
 $$;

-- 3. Drop old record_payment signature just in case
DROP FUNCTION IF EXISTS record_payment(uuid, numeric, text, uuid);

-- 4. Secure record_payment
CREATE OR REPLACE FUNCTION record_payment(
  p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stay not found'; END IF;
  
  PERFORM require_role(v_property_id, p_staff_id, array['owner', 'desk']);

  IF p_pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot collect cash without an open shift'; END IF;
    INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
    VALUES (gen_random_uuid(), v_open_shift_id, 'collection', p_amount, 'Payment on Folio', p_staff_id);
  END IF;

  UPDATE stays SET paid_amount = coalesce(paid_amount, 0) + p_amount WHERE id = p_stay_id;
END;
 $$;

-- 5. Owner-Only: Reset Staff PIN
CREATE OR REPLACE FUNCTION reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ BEGIN
  PERFORM require_role(p_prop, p_actor, array['owner']);
  UPDATE staff_profiles 
  SET pin_hash = crypt(p_new_pin, gen_salt('bf')), failed_tries = 0, locked_until = null 
  WHERE id = p_target AND property_id = p_prop;
END;
 $$;

-- 6. Owner-Only: Update Staff Role
CREATE OR REPLACE FUNCTION update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  PERFORM require_role(p_prop, p_actor, array['owner']);
  IF p_new_role NOT IN ('owner', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  UPDATE staff_profiles SET role = p_new_role WHERE id = p_target AND property_id = p_prop;
END;
 $$;