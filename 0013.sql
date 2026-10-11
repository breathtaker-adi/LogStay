-- 0013_complete_rpc_lockdown.sql
-- Replaces all remaining direct table writes with secure, idempotent, atomic RPCs,
-- prevents TOCTOU race conditions, fixes onboarding policies, and locks down execution privileges.

BEGIN;

-- ============================================================
-- 1. OPEN SHIFT
-- ============================================================
CREATE OR REPLACE FUNCTION open_shift(
  p_shift_id uuid,
  p_opening_cash numeric,
  p_staff_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_existing uuid;
BEGIN
  SELECT property_id INTO v_property_id FROM members WHERE user_id = auth.uid() LIMIT 1;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'No property membership found for this account.';
  END IF;

  IF p_opening_cash IS NULL OR p_opening_cash < 0 OR p_opening_cash > 10000000 THEN
    RAISE EXCEPTION 'Opening cash out of allowed range (0 to 10,000,000).';
  END IF;

  -- Idempotency: if shift ID already exists, return it cleanly
  SELECT id INTO v_existing FROM shifts WHERE id = p_shift_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Enforce one open shift per property
  IF EXISTS (SELECT 1 FROM shifts WHERE property_id = v_property_id AND status = 'open') THEN
    RAISE EXCEPTION 'A shift is already open for this property.';
  END IF;

  INSERT INTO shifts (id, property_id, opened_by, opening_cash, status)
  VALUES (p_shift_id, v_property_id, auth.uid(), p_opening_cash, 'open');

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_property_id, auth.uid(), 'shift_opened', p_shift_id);

  RETURN p_shift_id;
END;
$$;

-- ============================================================
-- 2. ADD PETTY CASH
-- ============================================================
CREATE OR REPLACE FUNCTION add_petty_cash(
  p_entry_id uuid,
  p_shift_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
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

  -- Idempotency: skip if already inserted
  IF EXISTS (SELECT 1 FROM cash_entries WHERE id = p_entry_id) THEN
    RETURN;
  END IF;

  INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
  VALUES (p_entry_id, p_shift_id, 'petty', p_amount, p_note, p_staff_id);

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_property_id, auth.uid(), 'petty_cash_added', p_entry_id);
END;
$$;

-- ============================================================
-- 3. ADD STAY CHARGE (folio item)
-- ============================================================
CREATE OR REPLACE FUNCTION add_stay_charge(
  p_charge_id uuid,
  p_stay_id uuid,
  p_item text,
  p_qty int,
  p_unit_price numeric,
  p_paid boolean DEFAULT false,
  p_pay_mode text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Stay not found.';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 50 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 50.';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 OR p_unit_price > 50000 THEN
    RAISE EXCEPTION 'Unit price out of allowed range (0 to 50,000).';
  END IF;
  IF p_item IS NULL OR length(trim(p_item)) < 1 OR length(p_item) > 200 THEN
    RAISE EXCEPTION 'Item name must be 1-200 characters.';
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM charges WHERE id = p_charge_id) THEN
    RETURN;
  END IF;

  -- If paid in cash, require open shift and log collection
  IF p_paid AND p_pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN
      RAISE EXCEPTION 'Cannot accept cash without an open shift.';
    END IF;
    INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
    VALUES (gen_random_uuid(), v_open_shift_id, 'collection', p_qty * p_unit_price,
            'Folio charge: ' || p_item, p_staff_id);
  END IF;

  INSERT INTO charges (id, property_id, stay_id, item, qty, unit_price, paid, pay_mode, staff_id)
  VALUES (p_charge_id, v_property_id, p_stay_id, p_item, p_qty, p_unit_price, p_paid, p_pay_mode, p_staff_id);
END;
$$;

-- ============================================================
-- 4. REPORT ISSUE
-- ============================================================
CREATE OR REPLACE FUNCTION report_issue(
  p_issue_id uuid,
  p_unit_id uuid DEFAULT NULL,
  p_stay_id uuid DEFAULT NULL,
  p_category text DEFAULT 'other',
  p_note text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
BEGIN
  IF p_unit_id IS NOT NULL THEN
    SELECT r.property_id INTO v_property_id FROM units u JOIN rooms r ON u.room_id = r.id WHERE u.id = p_unit_id;
  ELSIF p_stay_id IS NOT NULL THEN
    SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  END IF;

  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine property from the provided unit or stay.';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  IF p_category NOT IN ('ac', 'water', 'noise', 'cleanliness', 'electrical', 'other') THEN
    RAISE EXCEPTION 'Invalid issue category.';
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM issues WHERE id = p_issue_id) THEN
    RETURN;
  END IF;

  INSERT INTO issues (id, property_id, unit_id, stay_id, category, note, reported_by, status)
  VALUES (p_issue_id, v_property_id, p_unit_id, p_stay_id, p_category, p_note, p_staff_id, 'open');
END;
$$;

-- ============================================================
-- 5. SET UNIT MAINTENANCE
-- ============================================================
CREATE OR REPLACE FUNCTION set_unit_maintenance(
  p_unit_id uuid,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
BEGIN
  SELECT r.property_id INTO v_property_id FROM units u JOIN rooms r ON u.room_id = r.id WHERE u.id = p_unit_id;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Unit not found.';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  UPDATE units SET housekeeping_status = 'maintenance' WHERE id = p_unit_id;

  INSERT INTO housekeeping_log (property_id, unit_id, status, staff_id)
  VALUES (v_property_id, p_unit_id, 'maintenance', p_staff_id);
END;
$$;

-- ============================================================
-- 6. MARK FORM C FILED (Updates foreign_details table)
-- ============================================================
CREATE OR REPLACE FUNCTION mark_form_c_filed(
  p_stay_id uuid,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
BEGIN
  SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Stay not found.';
  END IF;

  IF NOT is_member(v_property_id) THEN
    RAISE EXCEPTION 'Not authorized for this property.';
  END IF;

  UPDATE foreign_details SET form_c_filed = true WHERE stay_id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foreign details not found for this stay.';
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_property_id, auth.uid(), 'form_c_filed', p_stay_id);
END;
$$;

-- ============================================================
-- 7. ADD ROOM WITH UNITS (Batch Creation with Validation)
-- ============================================================
CREATE OR REPLACE FUNCTION add_room_with_units(
  p_room_id uuid,
  p_label text,
  p_kind text,
  p_floor text DEFAULT NULL,
  p_unit_ids uuid[] DEFAULT NULL,
  p_unit_labels text[] DEFAULT NULL,
  p_gender_rule text DEFAULT 'any'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_i int;
BEGIN
  SELECT property_id INTO v_property_id FROM members WHERE user_id = auth.uid() LIMIT 1;
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'No property membership found for this account.';
  END IF;

  IF p_kind NOT IN ('dorm', 'private') THEN
    RAISE EXCEPTION 'Room kind must be dorm or private.';
  END IF;
  IF p_label IS NULL OR length(trim(p_label)) < 1 OR length(p_label) > 50 THEN
    RAISE EXCEPTION 'Room label must be 1-50 characters.';
  END IF;
  IF p_gender_rule NOT IN ('any', 'male', 'female') THEN
    RAISE EXCEPTION 'Invalid gender rule.';
  END IF;

  -- Unit array validations
  IF p_unit_ids IS NULL OR coalesce(array_length(p_unit_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'At least one unit id is required.';
  END IF;
  IF p_kind = 'dorm' AND coalesce(array_length(p_unit_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'Bed count limit is 100 per dorm.';
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM rooms WHERE id = p_room_id) THEN
    RETURN p_room_id;
  END IF;

  INSERT INTO rooms (id, property_id, label, kind, floor)
  VALUES (p_room_id, v_property_id, p_label, p_kind, p_floor);

  -- Create units
  IF p_kind = 'private' THEN
    INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
    VALUES (p_unit_ids[1], p_room_id, 'Whole Room', p_gender_rule, 'clean');
  ELSIF array_length(p_unit_ids, 1) > 0 THEN
    FOR v_i IN 1..array_length(p_unit_ids, 1) LOOP
      INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
      VALUES (p_unit_ids[v_i], p_room_id, coalesce(p_unit_labels[v_i], 'Bed ' || v_i), p_gender_rule, 'clean');
    END LOOP;
  END IF;

  RETURN p_room_id;
END;
$$;

-- ============================================================
-- 8. STAFF ATTENDANCE & AUDIT LOG RPCS
-- ============================================================
CREATE OR REPLACE FUNCTION clock_in_staff(p_staff_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_prop uuid; v_id uuid;
BEGIN
  SELECT property_id INTO v_prop FROM staff_profiles WHERE id = p_staff_id AND active = true;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Staff not found or inactive.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  INSERT INTO staff_attendance (staff_id) VALUES (p_staff_id) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION clock_out_staff(p_attendance_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_prop uuid;
BEGIN
  SELECT sp.property_id INTO v_prop FROM staff_attendance sa
  JOIN staff_profiles sp ON sp.id = sa.staff_id WHERE sa.id = p_attendance_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Attendance record not found.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  UPDATE staff_attendance SET clock_out = now()
  WHERE id = p_attendance_id AND clock_out IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION log_photo_view(p_guest_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM guests WHERE id = p_guest_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Guest not found.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_prop, auth.uid(), 'view_id_photo', p_guest_id);
END; $$;

-- ============================================================
-- 9. UNIQUE PARTIAL INDEXES (TOCTOU Race Prevention)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_property
  ON shifts(property_id) WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS one_active_stay_per_unit
  ON stays(unit_id) WHERE status = 'checked_in';

-- ============================================================
-- 10. ONBOARDING POLICIES (Setup Property Bootstrap)
-- ============================================================
-- Ensure owner can select their newly created property before members row exists
DROP POLICY IF EXISTS properties_owner_select ON properties;
CREATE POLICY properties_owner_select ON properties FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS properties_insert ON properties;
CREATE POLICY properties_insert ON properties FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS members_insert ON members;
CREATE POLICY members_insert ON members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.owner_id = auth.uid())
  );

GRANT INSERT ON properties, members TO authenticated;

-- ============================================================
-- 11. HARDENED SET_PIN (Onboarding Security)
-- ============================================================
CREATE OR REPLACE FUNCTION set_pin(p_prop uuid, p_pin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  UPDATE members SET pin = p_pin WHERE property_id = p_prop AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of this property.'; END IF;
END;
$$;


-- ============================================================
-- 13. PRIVILEGES: Revoke from public/anon, grant to authenticated
-- ============================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION open_shift(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_petty_cash(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_stay_charge(uuid, uuid, text, int, numeric, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION report_issue(uuid, uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_unit_maintenance(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_form_c_filed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_room_with_units(uuid, text, text, text, uuid[], text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION clock_in_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION clock_out_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION log_photo_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_pin(uuid, text) TO authenticated;

COMMIT;

