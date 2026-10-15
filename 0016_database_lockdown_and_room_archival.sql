-- 0016_database_lockdown_and_room_archival.sql
-- Comprehensive Database Lockdown, Owner Step-Up PIN, Room Archival & Lifecycle Management
-- Date: 11 October 2026

BEGIN;

-- ============================================================================
-- 1. UNITS TABLE POLICY CLEANUP (Finding 1)
-- ============================================================================
-- Drop permissive open policies that bypassed tenant boundary
DROP POLICY IF EXISTS "Users can read units" ON public.units;
DROP POLICY IF EXISTS "Users can insert units" ON public.units;

-- ============================================================================
-- 2. REVOKE DIRECT TABLE WRITES (Finding 2)
-- ============================================================================
-- Revoke direct writes from anon and authenticated across all public tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Re-grant safe read access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Hide sensitive authentication/audit columns and tables from direct SELECT
REVOKE SELECT ON public.staff_profiles, public.member_pins, public.cosign_attempts FROM authenticated;
GRANT SELECT (id, property_id, name, phone, role, active, joined_on)
  ON public.staff_profiles TO authenticated;

-- Allow property owners to update only non-billing property metadata
GRANT UPDATE (name, type, state) ON public.properties TO authenticated;

-- ============================================================================
-- 3. RETIRE DEPRECATED FUNCTIONS & ACCESS GAPS (Finding 3, Leftovers)
-- ============================================================================
DROP FUNCTION IF EXISTS public.delete_expired_id_photos();
DROP FUNCTION IF EXISTS public.set_pin(uuid, text);
DROP FUNCTION IF EXISTS public.validate_invite_code(text);

-- Restrict internal authorization helpers so only definer functions can call them
REVOKE EXECUTE ON FUNCTION public.staff_role(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.require_role(uuid, uuid, text[]) FROM anon, authenticated;

-- ============================================================================
-- 4. DUPLICATE INDEXES & ATTENDANCE LEAK FIX (Finding 2b D)
-- ============================================================================
DROP INDEX IF EXISTS public.one_open_shift;
DROP INDEX IF EXISTS public.one_stay_per_unit;

-- Close historical stale attendance rows (>16 hours old without clock_out)
UPDATE public.staff_attendance 
SET clock_out = clock_in + interval '8 hours'
WHERE clock_out IS NULL AND clock_in < now() - interval '16 hours';

-- Prevent multiple simultaneous open attendance rows per staff member
CREATE UNIQUE INDEX IF NOT EXISTS one_open_attendance 
  ON public.staff_attendance(staff_id) 
  WHERE clock_out IS NULL;

-- Automatically close open shift on clock-in
CREATE OR REPLACE FUNCTION public.clock_in_staff(p_staff_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE 
  v_prop uuid; 
  v_id uuid;
BEGIN
  SELECT property_id INTO v_prop FROM staff_profiles WHERE id = p_staff_id AND active = true;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Staff not found or inactive.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;

  -- Close any open attendance row for this staff member before opening a new one
  UPDATE staff_attendance 
  SET clock_out = now() 
  WHERE staff_id = p_staff_id AND clock_out IS NULL;

  INSERT INTO staff_attendance (staff_id) VALUES (p_staff_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================================
-- 5. DATA HYGIENE & PETTY CASH NORMALIZATION (Finding 2b E)
-- ============================================================================
UPDATE public.properties SET state = trim(state);
UPDATE public.cash_entries SET note = NULL WHERE trim(note) = 'None';

CREATE OR REPLACE FUNCTION public.add_petty_cash(
  p_entry_id uuid, 
  p_shift_id uuid, 
  p_amount numeric, 
  p_note text DEFAULT NULL, 
  p_staff_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_clean_note text;
BEGIN
  SELECT property_id INTO v_property_id FROM shifts WHERE id = p_shift_id AND status = 'open';
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Active shift not found or already closed.';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 200000 THEN
    RAISE EXCEPTION 'Petty cash amount out of allowed range (0 to 200,000).';
  END IF;

  IF EXISTS (SELECT 1 FROM cash_entries WHERE id = p_entry_id) THEN
    RETURN;
  END IF;

  -- Sanitize note: store NULL if empty or literal string 'None'
  v_clean_note := trim(p_note);
  IF v_clean_note = '' OR lower(v_clean_note) = 'none' THEN
    v_clean_note := NULL;
  END IF;

  INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
  VALUES (p_entry_id, p_shift_id, 'petty', p_amount, v_clean_note, p_staff_id);

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_property_id, auth.uid(), 'petty_cash_added', p_entry_id, p_staff_id);
END;
$$;

-- ============================================================================
-- 6. ATOMIC CREATE PROPERTY RPC (Eliminates direct table inserts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_property(
  p_name text,
  p_type text,
  p_state text,
  p_pin text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prop_id uuid := gen_random_uuid();
  v_staff_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Property name required';
  END IF;

  IF p_state IS NULL OR length(trim(p_state)) < 1 THEN
    RAISE EXCEPTION 'State required';
  END IF;

  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  -- 1. Insert property
  INSERT INTO properties (id, name, type, state, owner_id)
  VALUES (v_prop_id, trim(p_name), coalesce(p_type, 'hostel'), trim(p_state), v_user_id);

  -- 2. Insert member as owner
  INSERT INTO members (property_id, user_id, role)
  VALUES (v_prop_id, v_user_id, 'owner');

  -- 3. Insert staff profile for owner with bcrypt cost 10
  INSERT INTO staff_profiles (id, property_id, name, role, pin_hash)
  VALUES (v_staff_id, v_prop_id, 'Owner', 'owner', crypt(p_pin, gen_salt('bf', 10)));

  -- 4. Audit log
  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop_id, v_user_id, 'create_property', v_prop_id, v_staff_id);

  RETURN v_prop_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_property(text, text, text, text) TO authenticated;

-- ============================================================================
-- 7. OWNER STEP-UP PIN VERIFICATION ENGINE (Section 5)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_owner_pin(
  p_prop uuid,
  p_actor uuid,
  p_pin text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_owner staff_profiles%rowtype;
BEGIN
  SELECT * INTO v_owner FROM staff_profiles
  WHERE id = p_actor AND property_id = p_prop AND role = 'owner' AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed for this role';
  END IF;

  IF NOT is_member(p_prop) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  IF v_owner.locked_until > now() THEN
    RAISE EXCEPTION 'Locked, try later';
  END IF;

  IF p_pin IS NULL OR v_owner.pin_hash <> crypt(p_pin, v_owner.pin_hash) THEN
    UPDATE staff_profiles
    SET failed_tries = failed_tries + 1,
        locked_until = CASE WHEN failed_tries + 1 >= 5 THEN now() + interval '5 minutes' END
    WHERE id = p_actor;
    RAISE EXCEPTION 'Invalid owner PIN';
  END IF;

  UPDATE staff_profiles SET failed_tries = 0, locked_until = NULL WHERE id = p_actor;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_owner_pin(uuid, uuid, text) FROM anon, authenticated;

-- ============================================================================
-- 8. HARDEN OWNER-GATED FUNCTIONS WITH STEP-UP PIN
-- ============================================================================

-- 8a. refund_payment
DROP FUNCTION IF EXISTS public.refund_payment(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.refund_payment(
  p_payment_id uuid, 
  p_staff_id uuid, 
  p_reason text,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_payment payments%rowtype;
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.refunded THEN RAISE EXCEPTION 'Already refunded'; END IF;
  
  v_property_id := v_payment.property_id;
  PERFORM require_role(v_property_id, p_staff_id, ARRAY['owner']);
  PERFORM verify_owner_pin(v_property_id, p_staff_id, p_owner_pin);

  UPDATE payments SET refunded = true WHERE id = p_payment_id;

  IF v_payment.pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot refund cash without an open shift'; END IF;
    
    INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
    VALUES (gen_random_uuid(), v_open_shift_id, 'refund', v_payment.amount, 'Refund: ' || p_reason, p_staff_id);
  END IF;

  UPDATE stays 
  SET paid_amount = GREATEST(0, paid_amount - v_payment.amount) 
  WHERE id = v_payment.stay_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_property_id, auth.uid(), 'refund_payment', p_payment_id, p_staff_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.refund_payment(uuid, uuid, text, text) TO authenticated;

-- 8b. reset_staff_pin
DROP FUNCTION IF EXISTS public.reset_staff_pin(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.reset_staff_pin(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_new_pin text,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
  PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);

  IF p_new_pin IS NULL OR length(p_new_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  UPDATE staff_profiles 
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), failed_tries = 0, locked_until = null 
  WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, auth.uid(), 'reset_staff_pin', p_target, p_actor);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_staff_pin(uuid, uuid, uuid, text, text) TO authenticated;

-- 8c. owner_add_staff
DROP FUNCTION IF EXISTS public.owner_add_staff(uuid, uuid, text, text, text, text);
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
  v_new_id uuid := gen_random_uuid();
  v_is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM staff_profiles WHERE property_id = p_prop AND role = 'owner' AND active) INTO v_is_first;
  IF NOT v_is_first THEN
    PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
    PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);
  END IF;

  IF p_role NOT IN ('owner', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;
  
  INSERT INTO staff_profiles (id, property_id, name, phone, role, pin_hash)
  VALUES (v_new_id, p_prop, trim(p_name), trim(p_phone), p_role, crypt(p_pin, gen_salt('bf', 10)));

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, auth.uid(), 'owner_add_staff', v_new_id, p_actor);

  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.owner_add_staff(uuid, uuid, text, text, text, text, text) TO authenticated;

-- 8d. deactivate_staff
DROP FUNCTION IF EXISTS public.deactivate_staff(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.deactivate_staff(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_reason text,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
  PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);

  IF p_actor = p_target THEN RAISE EXCEPTION 'Cannot remove yourself'; END IF;
  IF staff_role(p_prop, p_target) = 'owner' AND NOT EXISTS
    (SELECT 1 FROM staff_profiles WHERE property_id = p_prop AND role = 'owner'
       AND active AND id <> p_target) THEN
    RAISE EXCEPTION 'Cannot remove the last owner';
  END IF;

  UPDATE staff_attendance SET clock_out = now()
    WHERE staff_id = p_target AND clock_out IS NULL;

  UPDATE staff_profiles SET active = false, deactivated_at = now(),
    deactivated_by = p_actor,
    pin_hash = crypt(gen_random_uuid()::text, gen_salt('bf', 10))
    WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
    VALUES (p_prop, auth.uid(), 'deactivate_staff:' || COALESCE(p_reason, ''), p_target, p_actor);
END;
$$;
GRANT EXECUTE ON FUNCTION public.deactivate_staff(uuid, uuid, uuid, text, text) TO authenticated;

-- ============================================================================
-- 9. ROOM & UNIT ARCHIVAL SCHEMA & MANAGEMENT (Section 3C)
-- ============================================================================
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_label_unique 
  ON public.rooms(property_id, lower(label)) 
  WHERE archived_at IS NULL;

-- 9a. update_room
CREATE OR REPLACE FUNCTION public.update_room(
  p_room_id uuid,
  p_label text,
  p_floor text,
  p_gender_rule text,
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM rooms WHERE id = p_room_id AND archived_at IS NULL;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Room not found or archived'; END IF;
  PERFORM require_role(v_prop, p_staff_id, ARRAY['owner']);
  IF p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  UPDATE rooms SET label = trim(p_label), floor = NULLIF(trim(p_floor), '') WHERE id = p_room_id;
  IF p_gender_rule IS NOT NULL THEN
    UPDATE units SET gender_rule = p_gender_rule WHERE room_id = p_room_id AND archived_at IS NULL;
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, auth.uid(), 'edit_room', p_room_id, p_staff_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_room(uuid, text, text, text, uuid, text) TO authenticated;

-- 9b. remove_room
CREATE OR REPLACE FUNCTION public.remove_room(
  p_room_id uuid,
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
  v_used boolean;
BEGIN
  SELECT property_id INTO v_prop FROM rooms WHERE id = p_room_id AND archived_at IS NULL;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Room not found or already archived'; END IF;
  PERFORM require_role(v_prop, p_staff_id, ARRAY['owner']);
  IF p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  -- Block removal if any unit in the room has an active checked-in guest
  IF EXISTS (
    SELECT 1 FROM stays s JOIN units u ON u.id = s.unit_id
    WHERE u.room_id = p_room_id AND s.status = 'checked_in'
  ) THEN
    RAISE EXCEPTION 'A guest is checked in';
  END IF;

  -- Check if room has historical stays
  SELECT EXISTS (
    SELECT 1 FROM stays s JOIN units u ON u.id = s.unit_id
    WHERE u.room_id = p_room_id
  ) INTO v_used;

  IF v_used THEN
    UPDATE units SET archived_at = now() WHERE room_id = p_room_id;
    UPDATE rooms SET archived_at = now() WHERE id = p_room_id;
  ELSE
    BEGIN
      DELETE FROM units WHERE room_id = p_room_id;
      DELETE FROM rooms WHERE id = p_room_id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE units SET archived_at = now() WHERE room_id = p_room_id;
      UPDATE rooms SET archived_at = now() WHERE id = p_room_id;
      v_used := true;
    END;
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, auth.uid(), 'remove_room', p_room_id, p_staff_id);

  RETURN CASE WHEN v_used THEN 'archived' ELSE 'deleted' END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_room(uuid, uuid, text) TO authenticated;

-- 9c. add_beds (for expanding existing dorms)
CREATE OR REPLACE FUNCTION public.add_beds(
  p_room_id uuid,
  p_unit_ids uuid[],
  p_unit_labels text[],
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
  v_gender text;
  v_i int;
BEGIN
  SELECT property_id INTO v_prop FROM rooms WHERE id = p_room_id AND kind = 'dorm' AND archived_at IS NULL;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Dorm room not found'; END IF;
  PERFORM require_role(v_prop, p_staff_id, ARRAY['owner']);
  IF p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  SELECT gender_rule INTO v_gender FROM units WHERE room_id = p_room_id AND archived_at IS NULL LIMIT 1;
  IF v_gender IS NULL THEN v_gender := 'any'; END IF;

  FOR v_i IN 1..coalesce(array_length(p_unit_ids, 1), 0) LOOP
    INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
    VALUES (p_unit_ids[v_i], p_room_id, COALESCE(p_unit_labels[v_i], 'Bed ' || v_i), v_gender, 'clean');
  END LOOP;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, auth.uid(), 'add_beds', p_room_id, p_staff_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_beds(uuid, uuid[], text[], uuid, text) TO authenticated;

-- 9d. rename_unit
CREATE OR REPLACE FUNCTION public.rename_unit(
  p_unit_id uuid,
  p_label text,
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
BEGIN
  SELECT r.property_id INTO v_prop FROM units u JOIN rooms r ON r.id = u.room_id
  WHERE u.id = p_unit_id AND u.archived_at IS NULL AND r.archived_at IS NULL;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Unit not found'; END IF;
  PERFORM require_role(v_prop, p_staff_id, ARRAY['owner']);
  IF p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  UPDATE units SET label = trim(p_label) WHERE id = p_unit_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, auth.uid(), 'rename_unit', p_unit_id, p_staff_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rename_unit(uuid, text, uuid, text) TO authenticated;

COMMIT;
