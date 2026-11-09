-- 20261015000001_initial_schema.sql
-- Baseline schema definition for LogStay (Tables, Functions, Views, Triggers, Policies)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE FUNCTION public.add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text, p_staff_id uuid) OWNER TO postgres;

--
-- Name: add_room_with_units(uuid, text, text, text, uuid[], text[], text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text DEFAULT NULL::text, p_unit_ids uuid[] DEFAULT NULL::uuid[], p_unit_labels text[] DEFAULT NULL::text[], p_gender_rule text DEFAULT 'any'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text, p_unit_ids uuid[], p_unit_labels text[], p_gender_rule text) OWNER TO postgres;

--
-- Name: add_stay_charge(uuid, uuid, text, integer, numeric, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean DEFAULT false, p_pay_mode text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean, p_pay_mode text, p_staff_id uuid) OWNER TO postgres;

--
-- Name: check_in_guest(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, numeric, text, boolean, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE 
  v_open_shift_id uuid; 
  v_occupied boolean;
BEGIN
  IF NOT is_member(p_property_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  IF EXISTS (SELECT 1 FROM stays WHERE id = p_stay_id) THEN RETURN p_stay_id; END IF;

  SELECT EXISTS(SELECT 1 FROM stays WHERE unit_id = p_unit_id AND status = 'checked_in') INTO v_occupied;
  IF v_occupied THEN RAISE EXCEPTION 'Bed is already occupied'; END IF;

  IF p_pay_mode = 'cash' AND p_amount > 0 THEN
    SELECT id INTO v_open_shift_id FROM shifts WHERE property_id = p_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot accept cash without an open shift'; END IF;
  END IF;

  INSERT INTO guests (id, property_id, name, phone, nationality, gender, id_type, id_last4, id_photo_path, id_photo_expires_at)
  VALUES (
    p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path,
    now() + interval '6 months' -- Enforce 6-month retention
  )
  ON CONFLICT (id) DO UPDATE SET 
    name = excluded.name, 
    phone = excluded.phone,
    id_photo_path = excluded.id_photo_path,
    id_photo_expires_at = excluded.id_photo_expires_at,
    id_deleted_at = null;

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


ALTER FUNCTION public.check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid) OWNER TO postgres;

--
-- Name: check_out_guest(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_out_guest(p_stay_id uuid, p_staff_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE
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


ALTER FUNCTION public.check_out_guest(p_stay_id uuid, p_staff_id uuid) OWNER TO postgres;

--
-- Name: clock_in_staff(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.clock_in_staff(p_staff_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_prop uuid; v_id uuid;
BEGIN
  SELECT property_id INTO v_prop FROM staff_profiles WHERE id = p_staff_id AND active = true;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Staff not found or inactive.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  INSERT INTO staff_attendance (staff_id) VALUES (p_staff_id) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;


ALTER FUNCTION public.clock_in_staff(p_staff_id uuid) OWNER TO postgres;

--
-- Name: clock_out_staff(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.clock_out_staff(p_attendance_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_prop uuid;
BEGIN
  SELECT sp.property_id INTO v_prop FROM staff_attendance sa
  JOIN staff_profiles sp ON sp.id = sa.staff_id WHERE sa.id = p_attendance_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Attendance record not found.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  UPDATE staff_attendance SET clock_out = now()
  WHERE id = p_attendance_id AND clock_out IS NULL;
END; $$;


ALTER FUNCTION public.clock_out_staff(p_attendance_id uuid) OWNER TO postgres;

--
-- Name: close_shift_secure(uuid, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text) OWNER TO postgres;

--
-- Name: deactivate_staff(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ begin
  perform require_role(p_prop, p_actor, array['owner']);
  if p_actor = p_target then raise exception 'Cannot remove yourself'; end if;
  if staff_role(p_prop, p_target) = 'owner' and not exists
    (select 1 from staff_profiles where property_id = p_prop and role = 'owner'
       and active and id <> p_target) then
    raise exception 'Cannot remove the last owner'; end if;
  update staff_attendance set clock_out = now()
    where staff_id = p_target and clock_out is null;
  update staff_profiles set active = false, deactivated_at = now(),
    deactivated_by = p_actor,
    pin_hash = crypt(gen_random_uuid()::text, gen_salt('bf'))
    where id = p_target and property_id = p_prop;
  insert into audit_log (property_id, user_id, action, record_id)
    values (p_prop, auth.uid(), 'deactivate_staff:' || coalesce(p_reason, ''), p_target);
end $$;


ALTER FUNCTION public.deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text) OWNER TO postgres;

--
-- Name: delete_expired_id_photos(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_expired_id_photos() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, id_photo_path FROM guests WHERE id_photo_expires_at < now() AND id_deleted_at IS NULL LOOP
    -- 1. Mark as deleted
    UPDATE guests SET id_deleted_at = now(), id_photo_path = null WHERE id = r.id;
    -- 2. Remove from storage (Supabase storage API)
    -- Note: Supabase storage deletes via the API/SDK, so in a pure SQL cron job 
    -- we just null the path. The actual file removal can be handled by a Supabase Edge Function
    -- if strict filesystem deletion is required, but nullifying the path revokes access.
  END LOOP;
END;
 $$;


ALTER FUNCTION public.delete_expired_id_photos() OWNER TO postgres;

--
-- Name: generate_invite_code(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_invite_code(p_prop uuid, p_actor uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No confusing chars (I, 1, 0, O)
BEGIN
  PERFORM require_role(p_prop, p_actor, array['owner']);
  
  -- Generate 6-char code
  v_code := '';
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
  END LOOP;
  
  INSERT INTO property_invites (property_id, code, expires_at, created_by)
  VALUES (p_prop, v_code, now() + interval '48 hours', auth.uid());
  
  RETURN v_code;
END;
 $$;


ALTER FUNCTION public.generate_invite_code(p_prop uuid, p_actor uuid) OWNER TO postgres;

--
-- Name: is_member(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_member(p uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$   SELECT EXISTS (SELECT 1 FROM members WHERE property_id = p AND user_id = auth.uid());
 $$;


ALTER FUNCTION public.is_member(p uuid) OWNER TO postgres;

--
-- Name: join_property(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.join_property(p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE
  v_property_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Validate invite code
  SELECT property_id INTO v_property_id 
  FROM property_invites 
  WHERE code = upper(p_code) 
  AND expires_at > now();
  
  IF v_property_id IS NULL THEN
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


ALTER FUNCTION public.join_property(p_code text) OWNER TO postgres;

--
-- Name: log_photo_view(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_photo_view(p_guest_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM guests WHERE id = p_guest_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Guest not found.'; END IF;
  IF NOT is_member(v_prop) THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (v_prop, auth.uid(), 'view_id_photo', p_guest_id);
END; $$;


ALTER FUNCTION public.log_photo_view(p_guest_id uuid) OWNER TO postgres;

--
-- Name: mark_form_c_filed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_form_c_filed(p_stay_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.mark_form_c_filed(p_stay_id uuid, p_staff_id uuid) OWNER TO postgres;

--
-- Name: mark_unit_clean(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_unit_clean(p_unit_id uuid, p_staff_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ declare
  v_property_id uuid;
begin
  select r.property_id into v_property_id
  from units u
  join rooms r on u.room_id = r.id
  where u.id = p_unit_id;
  if v_property_id is null then raise exception 'Unit not found'; end if;
  perform require_role(v_property_id, p_staff_id, array['owner', 'desk', 'housekeeping']);
  update units set housekeeping_status = 'clean', last_cleaned_at = now(), last_cleaned_by = p_staff_id where id = p_unit_id;
  insert into housekeeping_log (property_id, unit_id, status, staff_id)
  values (v_property_id, p_unit_id, 'clean', p_staff_id);
end;
 $$;


ALTER FUNCTION public.mark_unit_clean(p_unit_id uuid, p_staff_id uuid) OWNER TO postgres;

--
-- Name: open_shift(uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid) OWNER TO postgres;

--
-- Name: owner_add_staff(uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ declare
  v_new_id uuid := gen_random_uuid();
  v_is_first boolean;
begin
  select not exists (select 1 from staff_profiles where property_id = p_prop and role = 'owner' and active) into v_is_first;
  if not v_is_first then
    perform require_role(p_prop, p_actor, array['owner']);
  end if;
  
  insert into staff_profiles (id, property_id, name, phone, role, pin_hash)
  values (v_new_id, p_prop, p_name, p_phone, p_role, crypt(p_pin, gen_salt('bf')));
  return v_new_id;
end;
 $$;


ALTER FUNCTION public.owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text) OWNER TO postgres;

--
-- Name: record_payment(uuid, uuid, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE
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


ALTER FUNCTION public.record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid) OWNER TO postgres;

--
-- Name: refund_payment(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ DECLARE
  v_payment payments%rowtype;
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_payment.refunded THEN RAISE EXCEPTION 'Already refunded'; END IF;
  
  v_property_id := v_payment.property_id;
  PERFORM require_role(v_property_id, p_staff_id, array['owner']);

  -- Mark payment as refunded
  UPDATE payments SET refunded = true WHERE id = p_payment_id;

  -- If cash, log a refund deduction in the open shift
  IF v_payment.pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot refund cash without an open shift'; END IF;
    
    INSERT INTO cash_entries (id, shift_id, kind, amount, note, staff_id)
    VALUES (gen_random_uuid(), v_open_shift_id, 'refund', v_payment.amount, 'Refund: ' || p_reason, p_staff_id);
  END IF;

  -- Decrease stay's paid amount
  UPDATE stays 
  SET paid_amount = GREATEST(0, paid_amount - v_payment.amount) 
  WHERE id = v_payment.stay_id;
END;
 $$;


ALTER FUNCTION public.refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: report_issue(uuid, uuid, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.report_issue(p_issue_id uuid, p_unit_id uuid DEFAULT NULL::uuid, p_stay_id uuid DEFAULT NULL::uuid, p_category text DEFAULT 'other'::text, p_note text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.report_issue(p_issue_id uuid, p_unit_id uuid, p_stay_id uuid, p_category text, p_note text, p_staff_id uuid) OWNER TO postgres;

--
-- Name: require_role(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.require_role(p_prop uuid, p_staff uuid, p_roles text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ begin
  if not is_member(p_prop) then raise exception 'Not a member'; end if;
  if not coalesce(staff_role(p_prop, p_staff) = any(p_roles), false) then
    raise exception 'Not allowed for this role'; end if;
end $$;


ALTER FUNCTION public.require_role(p_prop uuid, p_staff uuid, p_roles text[]) OWNER TO postgres;

--
-- Name: reset_staff_pin(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ BEGIN
  PERFORM require_role(p_prop, p_actor, array['owner']);
  UPDATE staff_profiles 
  SET pin_hash = crypt(p_new_pin, gen_salt('bf')), failed_tries = 0, locked_until = null 
  WHERE id = p_target AND property_id = p_prop;
END;
 $$;


ALTER FUNCTION public.reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text) OWNER TO postgres;

--
-- Name: set_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_pin(p_prop uuid, p_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  UPDATE members SET pin = p_pin WHERE property_id = p_prop AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a member of this property.'; END IF;
END;
$$;


ALTER FUNCTION public.set_pin(p_prop uuid, p_pin text) OWNER TO postgres;

--
-- Name: set_staff_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_staff_pin(p_staff_id uuid, p_pin text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$   UPDATE staff_profiles SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = p_staff_id;
 $$;


ALTER FUNCTION public.set_staff_pin(p_staff_id uuid, p_pin text) OWNER TO postgres;

--
-- Name: set_unit_maintenance(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_unit_maintenance(p_unit_id uuid, p_staff_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION public.set_unit_maintenance(p_unit_id uuid, p_staff_id uuid) OWNER TO postgres;

--
-- Name: staff_login(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.staff_login(p_staff uuid, p_pin text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$ declare s staff_profiles%rowtype;
begin
  select * into s from staff_profiles where id = p_staff and active;
  if not found or not is_member(s.property_id) then return false; end if;
  if s.locked_until > now() then raise exception 'Locked, try later'; end if;
  if s.pin_hash = crypt(p_pin, s.pin_hash) then
    update staff_profiles set failed_tries = 0, locked_until = null where id = p_staff;
    return true;
  end if;
  update staff_profiles set failed_tries = failed_tries + 1,
    locked_until = case when failed_tries + 1 >= 5
      then now() + interval '5 minutes' end where id = p_staff;
  return false;
end $$;


ALTER FUNCTION public.staff_login(p_staff uuid, p_pin text) OWNER TO postgres;

--
-- Name: staff_role(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.staff_role(p_prop uuid, p_staff uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select role from staff_profiles
   where id = p_staff and property_id = p_prop and active $$;


ALTER FUNCTION public.staff_role(p_prop uuid, p_staff uuid) OWNER TO postgres;

--
-- Name: update_staff_role(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN
  PERFORM require_role(p_prop, p_actor, array['owner']);
  IF p_new_role NOT IN ('owner', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  UPDATE staff_profiles SET role = p_new_role WHERE id = p_target AND property_id = p_prop;
END;
 $$;


ALTER FUNCTION public.update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text) OWNER TO postgres;

--
-- Name: validate_invite_code(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_invite_code(p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE
  v_property_id uuid;
BEGIN
  SELECT property_id INTO v_property_id 
  FROM property_invites 
  WHERE code = upper(p_code) 
  AND expires_at > now();
  
  IF v_property_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;
  
  RETURN v_property_id;
END;
 $$;


ALTER FUNCTION public.validate_invite_code(p_code text) OWNER TO postgres;

--
-- Name: verify_staff_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.verify_staff_pin(p_staff_id uuid, p_pin text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$   SELECT EXISTS (SELECT 1 FROM staff_profiles WHERE id = p_staff_id AND pin_hash = crypt(p_pin, pin_hash));
 $$;


ALTER FUNCTION public.verify_staff_pin(p_staff_id uuid, p_pin text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    record_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    staff_id uuid
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: cash_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cash_entries (
    id uuid NOT NULL,
    shift_id uuid,
    kind text DEFAULT 'petty'::text NOT NULL,
    amount numeric NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    staff_id uuid,
    CONSTRAINT cash_entries_kind_check CHECK ((kind = ANY (ARRAY['petty'::text, 'collection'::text, 'refund'::text]))),
    CONSTRAINT chk_cash_amount CHECK (((amount > (0)::numeric) AND (amount <= (200000)::numeric)))
);


ALTER TABLE public.cash_entries OWNER TO postgres;

--
-- Name: charges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.charges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid NOT NULL,
    item text NOT NULL,
    qty integer DEFAULT 1,
    unit_price numeric(10,2) NOT NULL,
    paid boolean DEFAULT false,
    pay_mode text,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT charges_pay_mode_check CHECK ((pay_mode = ANY (ARRAY['cash'::text, 'upi'::text]))),
    CONSTRAINT chk_charges_price CHECK (((unit_price >= (0)::numeric) AND (unit_price <= (50000)::numeric))),
    CONSTRAINT chk_charges_qty CHECK (((qty >= 1) AND (qty <= 50)))
);


ALTER TABLE public.charges OWNER TO postgres;

--
-- Name: cosign_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cosign_attempts (
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    attempts integer DEFAULT 0,
    locked_until timestamp with time zone
);


ALTER TABLE public.cosign_attempts OWNER TO postgres;

--
-- Name: foreign_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.foreign_details (
    stay_id uuid NOT NULL,
    passport_no text,
    visa_no text,
    visa_type text,
    arrived_from text,
    next_dest text,
    form_c_filed boolean DEFAULT false
);


ALTER TABLE public.foreign_details OWNER TO postgres;

--
-- Name: guests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    name text NOT NULL,
    phone text,
    nationality text,
    id_type text,
    id_last4 text,
    id_photo_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    gender text,
    id_photo_expires_at timestamp with time zone,
    id_deleted_at timestamp with time zone,
    CONSTRAINT guests_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])))
);


ALTER TABLE public.guests OWNER TO postgres;

--
-- Name: housekeeping_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.housekeeping_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    status text NOT NULL,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.housekeeping_log OWNER TO postgres;

--
-- Name: issues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    unit_id uuid,
    stay_id uuid,
    category text,
    note text,
    status text DEFAULT 'open'::text,
    reported_by uuid,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT issues_category_check CHECK ((category = ANY (ARRAY['ac'::text, 'water'::text, 'noise'::text, 'cleanliness'::text, 'electrical'::text, 'other'::text]))),
    CONSTRAINT issues_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))
);


ALTER TABLE public.issues OWNER TO postgres;

--
-- Name: member_pins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_pins (
    property_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pin_hash text NOT NULL
);


ALTER TABLE public.member_pins OWNER TO postgres;

--
-- Name: members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    user_id uuid,
    role text DEFAULT 'desk'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.members OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    pay_mode text,
    shift_id uuid,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    refunded boolean DEFAULT false,
    CONSTRAINT chk_payments_amount CHECK (((amount > (0)::numeric) AND (amount <= (200000)::numeric))),
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_pay_mode_check CHECK ((pay_mode = ANY (ARRAY['cash'::text, 'upi'::text])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    paid_until timestamp with time zone
);


ALTER TABLE public.properties OWNER TO postgres;

--
-- Name: property_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.property_invites OWNER TO postgres;

--
-- Name: rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    label text NOT NULL,
    kind text NOT NULL,
    floor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rooms_kind_check CHECK ((kind = ANY (ARRAY['private'::text, 'dorm'::text])))
);


ALTER TABLE public.rooms OWNER TO postgres;

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id uuid NOT NULL,
    property_id uuid,
    opened_by uuid,
    closed_by uuid,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_cash numeric DEFAULT 0 NOT NULL,
    counted_cash numeric,
    status text DEFAULT 'open'::text NOT NULL,
    co_signed boolean DEFAULT false
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: staff_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    clock_in timestamp with time zone DEFAULT now(),
    clock_out timestamp with time zone
);


ALTER TABLE public.staff_attendance OWNER TO postgres;

--
-- Name: staff_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    role text DEFAULT 'desk'::text,
    pin_hash text NOT NULL,
    active boolean DEFAULT true,
    joined_on date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    failed_tries integer DEFAULT 0,
    locked_until timestamp with time zone,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    CONSTRAINT staff_profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'desk'::text, 'housekeeping'::text])))
);


ALTER TABLE public.staff_profiles OWNER TO postgres;

--
-- Name: staff_profiles_safe; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.staff_profiles_safe WITH (security_invoker='true') AS
 SELECT id,
    property_id,
    name,
    phone,
    role,
    active,
    joined_on
   FROM public.staff_profiles;


ALTER VIEW public.staff_profiles_safe OWNER TO postgres;

--
-- Name: stays; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stays (
    id uuid NOT NULL,
    property_id uuid,
    guest_id uuid,
    unit_id uuid,
    check_in timestamp with time zone DEFAULT now() NOT NULL,
    check_out timestamp with time zone,
    status text DEFAULT 'checked_in'::text NOT NULL,
    amount numeric,
    mode text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pay_mode text DEFAULT 'cash'::text,
    staff_id uuid,
    paid_amount numeric(10,2) DEFAULT 0,
    CONSTRAINT chk_stays_amount CHECK (((amount >= (0)::numeric) AND (amount <= (200000)::numeric))),
    CONSTRAINT stays_pay_mode_check CHECK ((pay_mode = ANY (ARRAY['cash'::text, 'upi'::text])))
);


ALTER TABLE public.stays OWNER TO postgres;

--
-- Name: units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    label text NOT NULL,
    gender_rule text DEFAULT 'any'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    housekeeping_status text DEFAULT 'clean'::text,
    last_cleaned_at timestamp with time zone,
    last_cleaned_by uuid,
    CONSTRAINT units_housekeeping_status_check CHECK ((housekeeping_status = ANY (ARRAY['clean'::text, 'dirty'::text, 'maintenance'::text])))
);


ALTER TABLE public.units OWNER TO postgres;

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: cash_entries cash_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_pkey PRIMARY KEY (id);


--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_pkey PRIMARY KEY (id);


--
-- Name: cosign_attempts cosign_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cosign_attempts
    ADD CONSTRAINT cosign_attempts_pkey PRIMARY KEY (user_id, property_id);


--
-- Name: foreign_details foreign_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.foreign_details
    ADD CONSTRAINT foreign_details_pkey PRIMARY KEY (stay_id);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: housekeeping_log housekeeping_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.housekeeping_log
    ADD CONSTRAINT housekeeping_log_pkey PRIMARY KEY (id);


--
-- Name: issues issues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_pkey PRIMARY KEY (id);


--
-- Name: member_pins member_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_pins
    ADD CONSTRAINT member_pins_pkey PRIMARY KEY (property_id, user_id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_invites property_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_invites
    ADD CONSTRAINT property_invites_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_pkey PRIMARY KEY (id);


--
-- Name: staff_profiles staff_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (id);


--
-- Name: stays stays_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stays
    ADD CONSTRAINT stays_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: idx_cash_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_shift ON public.cash_entries USING btree (shift_id);


--
-- Name: idx_charges_stay; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_charges_stay ON public.charges USING btree (stay_id);


--
-- Name: idx_guests_property_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guests_property_name ON public.guests USING btree (property_id, name);


--
-- Name: idx_issues_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_issues_unit ON public.issues USING btree (unit_id);


--
-- Name: idx_stays_property_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stays_property_status ON public.stays USING btree (property_id, status);


--
-- Name: idx_stays_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stays_unit ON public.stays USING btree (unit_id);


--
-- Name: one_active_stay_per_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX one_active_stay_per_unit ON public.stays USING btree (unit_id) WHERE (status = 'checked_in'::text);


--
-- Name: one_open_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX one_open_shift ON public.shifts USING btree (property_id) WHERE (status = 'open'::text);


--
-- Name: one_open_shift_per_property; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX one_open_shift_per_property ON public.shifts USING btree (property_id) WHERE (status = 'open'::text);


--
-- Name: one_stay_per_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX one_stay_per_unit ON public.stays USING btree (unit_id) WHERE (status = 'checked_in'::text);


--
-- Name: audit_log audit_log_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: cash_entries cash_entries_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: cash_entries cash_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id);


--
-- Name: charges charges_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: charges charges_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id);


--
-- Name: charges charges_stay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.charges
    ADD CONSTRAINT charges_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES public.stays(id) ON DELETE CASCADE;


--
-- Name: cosign_attempts cosign_attempts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cosign_attempts
    ADD CONSTRAINT cosign_attempts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: cosign_attempts cosign_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cosign_attempts
    ADD CONSTRAINT cosign_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: foreign_details foreign_details_stay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.foreign_details
    ADD CONSTRAINT foreign_details_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES public.stays(id) ON DELETE RESTRICT;


--
-- Name: guests guests_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: housekeeping_log housekeeping_log_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.housekeeping_log
    ADD CONSTRAINT housekeeping_log_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: housekeeping_log housekeeping_log_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.housekeeping_log
    ADD CONSTRAINT housekeeping_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id);


--
-- Name: housekeeping_log housekeeping_log_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.housekeeping_log
    ADD CONSTRAINT housekeeping_log_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: issues issues_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: issues issues_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.staff_profiles(id);


--
-- Name: issues issues_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.staff_profiles(id);


--
-- Name: issues issues_stay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES public.stays(id) ON DELETE CASCADE;


--
-- Name: issues issues_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: member_pins member_pins_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_pins
    ADD CONSTRAINT member_pins_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: member_pins member_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_pins
    ADD CONSTRAINT member_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: members members_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: payments payments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: payments payments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: payments payments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id);


--
-- Name: payments payments_stay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES public.stays(id) ON DELETE CASCADE;


--
-- Name: properties properties_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: property_invites property_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_invites
    ADD CONSTRAINT property_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: property_invites property_invites_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_invites
    ADD CONSTRAINT property_invites_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);


--
-- Name: shifts shifts_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);


--
-- Name: shifts shifts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: staff_attendance staff_attendance_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id) ON DELETE CASCADE;


--
-- Name: staff_profiles staff_profiles_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: stays stays_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stays
    ADD CONSTRAINT stays_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE RESTRICT;


--
-- Name: stays stays_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stays
    ADD CONSTRAINT stays_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: stays stays_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stays
    ADD CONSTRAINT stays_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id);


--
-- Name: stays stays_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stays
    ADD CONSTRAINT stays_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: units units_last_cleaned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_last_cleaned_by_fkey FOREIGN KEY (last_cleaned_by) REFERENCES public.staff_profiles(id);


--
-- Name: units units_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: units Users can insert units; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: units Users can read units; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read units" ON public.units FOR SELECT TO authenticated USING (true);


--
-- Name: staff_attendance attendance rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "attendance rw" ON public.staff_attendance TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.id = staff_attendance.staff_id) AND public.is_member(sp.property_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.id = staff_attendance.staff_id) AND public.is_member(sp.property_id)))));


--
-- Name: audit_log audit_ins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_ins ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_member(property_id));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_sel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_sel ON public.audit_log FOR SELECT TO authenticated USING (public.is_member(property_id));


--
-- Name: cash_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: charges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

--
-- Name: charges charges rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "charges rw" ON public.charges TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: cosign_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cosign_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: foreign_details; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.foreign_details ENABLE ROW LEVEL SECURITY;

--
-- Name: guests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

--
-- Name: housekeeping_log housekeeping log rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "housekeeping log rw" ON public.housekeeping_log TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: housekeeping_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.housekeeping_log ENABLE ROW LEVEL SECURITY;

--
-- Name: property_invites invites rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invites rw" ON public.property_invites TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: issues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

--
-- Name: issues issues rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "issues rw" ON public.issues TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: member_pins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.member_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY members_insert ON public.members FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (role = 'owner'::text) AND (EXISTS ( SELECT 1
   FROM public.properties p
  WHERE ((p.id = members.property_id) AND (p.owner_id = auth.uid()))))));


--
-- Name: members members_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY members_read ON public.members FOR SELECT TO authenticated USING (public.is_member(property_id));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments rw" ON public.payments TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: properties properties_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY properties_insert ON public.properties FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));


--
-- Name: properties properties_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY properties_owner_select ON public.properties FOR SELECT TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: property_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.property_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_profiles staff_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY staff_read ON public.staff_profiles FOR SELECT TO authenticated USING (public.is_member(property_id));


--
-- Name: stays; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log strict audit_log rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict audit_log rw" ON public.audit_log TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: cash_entries strict cash rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict cash rw" ON public.cash_entries TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shifts s
  WHERE ((s.id = cash_entries.shift_id) AND public.is_member(s.property_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.shifts s
  WHERE ((s.id = cash_entries.shift_id) AND public.is_member(s.property_id)))));


--
-- Name: foreign_details strict foreign rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict foreign rw" ON public.foreign_details TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.stays s
  WHERE ((s.id = foreign_details.stay_id) AND public.is_member(s.property_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.stays s
  WHERE ((s.id = foreign_details.stay_id) AND public.is_member(s.property_id)))));


--
-- Name: guests strict guests rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict guests rw" ON public.guests TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: properties strict properties rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict properties rw" ON public.properties TO authenticated USING (public.is_member(id)) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: rooms strict rooms rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict rooms rw" ON public.rooms TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: shifts strict shifts rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict shifts rw" ON public.shifts TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: stays strict stays rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict stays rw" ON public.stays TO authenticated USING (public.is_member(property_id)) WITH CHECK (public.is_member(property_id));


--
-- Name: units strict units rw; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "strict units rw" ON public.units TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.rooms r
  WHERE ((r.id = units.room_id) AND public.is_member(r.property_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.rooms r
  WHERE ((r.id = units.room_id) AND public.is_member(r.property_id)))));


--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.add_petty_cash(p_entry_id uuid, p_shift_id uuid, p_amount numeric, p_note text, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text, p_unit_ids uuid[], p_unit_labels text[], p_gender_rule text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text, p_unit_ids uuid[], p_unit_labels text[], p_gender_rule text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text, p_unit_ids uuid[], p_unit_labels text[], p_gender_rule text) TO authenticated;
GRANT ALL ON FUNCTION public.add_room_with_units(p_room_id uuid, p_label text, p_kind text, p_floor text, p_unit_ids uuid[], p_unit_labels text[], p_gender_rule text) TO service_role;


--
-- Name: FUNCTION add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean, p_pay_mode text, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean, p_pay_mode text, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean, p_pay_mode text, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.add_stay_charge(p_charge_id uuid, p_stay_id uuid, p_item text, p_qty integer, p_unit_price numeric, p_paid boolean, p_pay_mode text, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_in_guest(p_stay_id uuid, p_guest_id uuid, p_property_id uuid, p_name text, p_phone text, p_nationality text, p_gender text, p_id_type text, p_id_last4 text, p_id_photo_path text, p_unit_id uuid, p_amount numeric, p_pay_mode text, p_is_foreign boolean, p_passport_no text, p_visa_no text, p_visa_type text, p_arrived_from text, p_next_dest text, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION check_out_guest(p_stay_id uuid, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_out_guest(p_stay_id uuid, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_out_guest(p_stay_id uuid, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_out_guest(p_stay_id uuid, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION clock_in_staff(p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.clock_in_staff(p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clock_in_staff(p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clock_in_staff(p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION clock_out_staff(p_attendance_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.clock_out_staff(p_attendance_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clock_out_staff(p_attendance_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clock_out_staff(p_attendance_id uuid) TO service_role;


--
-- Name: FUNCTION close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.close_shift_secure(p_shift_id uuid, p_counted_cash numeric, p_staff_id uuid, p_cosign_pin text) TO service_role;


--
-- Name: FUNCTION deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.deactivate_staff(p_prop uuid, p_actor uuid, p_target uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION delete_expired_id_photos(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_expired_id_photos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_expired_id_photos() TO authenticated;
GRANT ALL ON FUNCTION public.delete_expired_id_photos() TO service_role;


--
-- Name: FUNCTION generate_invite_code(p_prop uuid, p_actor uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.generate_invite_code(p_prop uuid, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_invite_code(p_prop uuid, p_actor uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_invite_code(p_prop uuid, p_actor uuid) TO service_role;


--
-- Name: FUNCTION is_member(p uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_member(p uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_member(p uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_member(p uuid) TO service_role;


--
-- Name: FUNCTION join_property(p_code text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.join_property(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_property(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.join_property(p_code text) TO service_role;


--
-- Name: FUNCTION log_photo_view(p_guest_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.log_photo_view(p_guest_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_photo_view(p_guest_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.log_photo_view(p_guest_id uuid) TO service_role;


--
-- Name: FUNCTION mark_form_c_filed(p_stay_id uuid, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_form_c_filed(p_stay_id uuid, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_form_c_filed(p_stay_id uuid, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_form_c_filed(p_stay_id uuid, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION mark_unit_clean(p_unit_id uuid, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_unit_clean(p_unit_id uuid, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_unit_clean(p_unit_id uuid, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_unit_clean(p_unit_id uuid, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.open_shift(p_shift_id uuid, p_opening_cash numeric, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.owner_add_staff(p_prop uuid, p_actor uuid, p_name text, p_phone text, p_role text, p_pin text) TO service_role;


--
-- Name: FUNCTION record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_payment(p_payment_id uuid, p_stay_id uuid, p_amount numeric, p_pay_mode text, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION report_issue(p_issue_id uuid, p_unit_id uuid, p_stay_id uuid, p_category text, p_note text, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.report_issue(p_issue_id uuid, p_unit_id uuid, p_stay_id uuid, p_category text, p_note text, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_issue(p_issue_id uuid, p_unit_id uuid, p_stay_id uuid, p_category text, p_note text, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_issue(p_issue_id uuid, p_unit_id uuid, p_stay_id uuid, p_category text, p_note text, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION require_role(p_prop uuid, p_staff uuid, p_roles text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.require_role(p_prop uuid, p_staff uuid, p_roles text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_role(p_prop uuid, p_staff uuid, p_roles text[]) TO authenticated;
GRANT ALL ON FUNCTION public.require_role(p_prop uuid, p_staff uuid, p_roles text[]) TO service_role;


--
-- Name: FUNCTION reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.reset_staff_pin(p_prop uuid, p_actor uuid, p_target uuid, p_new_pin text) TO service_role;


--
-- Name: FUNCTION set_pin(p_prop uuid, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_pin(p_prop uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_pin(p_prop uuid, p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.set_pin(p_prop uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION set_staff_pin(p_staff_id uuid, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_staff_pin(p_staff_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_staff_pin(p_staff_id uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION set_unit_maintenance(p_unit_id uuid, p_staff_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_unit_maintenance(p_unit_id uuid, p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_unit_maintenance(p_unit_id uuid, p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_unit_maintenance(p_unit_id uuid, p_staff_id uuid) TO service_role;


--
-- Name: FUNCTION staff_login(p_staff uuid, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.staff_login(p_staff uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_login(p_staff uuid, p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.staff_login(p_staff uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION staff_role(p_prop uuid, p_staff uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.staff_role(p_prop uuid, p_staff uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_role(p_prop uuid, p_staff uuid) TO authenticated;
GRANT ALL ON FUNCTION public.staff_role(p_prop uuid, p_staff uuid) TO service_role;


--
-- Name: FUNCTION update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text) TO authenticated;
GRANT ALL ON FUNCTION public.update_staff_role(p_prop uuid, p_actor uuid, p_target uuid, p_new_role text) TO service_role;


--
-- Name: FUNCTION validate_invite_code(p_code text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.validate_invite_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_invite_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.validate_invite_code(p_code text) TO service_role;


--
-- Name: FUNCTION verify_staff_pin(p_staff_id uuid, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.verify_staff_pin(p_staff_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_staff_pin(p_staff_id uuid, p_pin text) TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.audit_log TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: TABLE cash_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cash_entries TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cash_entries TO authenticated;
GRANT ALL ON TABLE public.cash_entries TO service_role;


--
-- Name: TABLE charges; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.charges TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.charges TO authenticated;
GRANT ALL ON TABLE public.charges TO service_role;


--
-- Name: TABLE cosign_attempts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cosign_attempts TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cosign_attempts TO authenticated;
GRANT ALL ON TABLE public.cosign_attempts TO service_role;


--
-- Name: TABLE foreign_details; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.foreign_details TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.foreign_details TO authenticated;
GRANT ALL ON TABLE public.foreign_details TO service_role;


--
-- Name: TABLE guests; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.guests TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.guests TO authenticated;
GRANT ALL ON TABLE public.guests TO service_role;


--
-- Name: TABLE housekeeping_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.housekeeping_log TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.housekeeping_log TO authenticated;
GRANT ALL ON TABLE public.housekeeping_log TO service_role;


--
-- Name: TABLE issues; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.issues TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.issues TO authenticated;
GRANT ALL ON TABLE public.issues TO service_role;


--
-- Name: TABLE member_pins; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.member_pins TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.member_pins TO authenticated;
GRANT ALL ON TABLE public.member_pins TO service_role;


--
-- Name: TABLE members; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.members TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.members TO authenticated;
GRANT ALL ON TABLE public.members TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payments TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE properties; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.properties TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.properties TO authenticated;
GRANT ALL ON TABLE public.properties TO service_role;


--
-- Name: COLUMN properties.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(name) ON TABLE public.properties TO authenticated;


--
-- Name: COLUMN properties.type; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(type) ON TABLE public.properties TO authenticated;


--
-- Name: COLUMN properties.state; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(state) ON TABLE public.properties TO authenticated;


--
-- Name: TABLE property_invites; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.property_invites TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.property_invites TO authenticated;
GRANT ALL ON TABLE public.property_invites TO service_role;


--
-- Name: TABLE rooms; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.rooms TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.rooms TO authenticated;
GRANT ALL ON TABLE public.rooms TO service_role;


--
-- Name: TABLE shifts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.shifts TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.shifts TO authenticated;
GRANT ALL ON TABLE public.shifts TO service_role;


--
-- Name: TABLE staff_attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff_attendance TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff_attendance TO authenticated;
GRANT ALL ON TABLE public.staff_attendance TO service_role;


--
-- Name: TABLE staff_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.staff_profiles TO service_role;
GRANT SELECT ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.property_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(property_id) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(name) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.phone; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(phone) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.role; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(role) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.active; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(active) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: COLUMN staff_profiles.joined_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(joined_on) ON TABLE public.staff_profiles TO authenticated;


--
-- Name: TABLE staff_profiles_safe; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff_profiles_safe TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff_profiles_safe TO authenticated;
GRANT ALL ON TABLE public.staff_profiles_safe TO service_role;


--
-- Name: TABLE stays; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stays TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stays TO authenticated;
GRANT ALL ON TABLE public.stays TO service_role;


--
-- Name: TABLE units; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.units TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.units TO authenticated;
GRANT ALL ON TABLE public.units TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--