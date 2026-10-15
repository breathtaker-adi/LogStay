-- supabase/migrations/20261015000003_floors_and_rooms.sql
-- Add floor_no smallint column, backfill data, and update room management RPCs

-- 1. Add column with check constraint (-2 = Sub-basement, -1 = Basement, 0 = Ground floor, 1..60 = Floors)
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS floor_no smallint CHECK (floor_no BETWEEN -2 AND 60);

-- 2. Backfill existing floor strings to integer floor_no
UPDATE public.rooms SET floor_no = CASE
  WHEN trim(floor) ~ '^-?[0-9]+$' THEN trim(floor)::smallint
  WHEN lower(trim(floor)) IN ('g','gf','ground','ground floor','groundfloor','main floor') THEN 0
  WHEN lower(trim(floor)) IN ('b','basement','b1') THEN -1
  WHEN lower(trim(floor)) IN ('b2','sub-basement') THEN -2
  WHEN lower(trim(floor)) ~ '^[0-9]+(st|nd|rd|th)?( floor)?$' THEN regexp_replace(lower(trim(floor)), '[^0-9]', '', 'g')::smallint
  ELSE NULL
END WHERE floor_no IS NULL;

-- 3. Add index for fast floor grouping and filtering
CREATE INDEX IF NOT EXISTS rooms_prop_floor ON public.rooms(property_id, floor_no) WHERE archived_at IS NULL;

-- 4. Update add_room_with_units RPC to support p_floor_no
CREATE OR REPLACE FUNCTION public.add_room_with_units(
  p_room_id uuid,
  p_label text,
  p_kind text,
  p_floor text DEFAULT NULL,
  p_unit_ids uuid[] DEFAULT NULL,
  p_unit_labels text[] DEFAULT NULL,
  p_gender_rule text DEFAULT 'any',
  p_floor_no smallint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_property_id uuid;
  v_floor_no smallint;
  v_floor_str text;
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

  -- Resolve floor_no and floor string
  IF p_floor_no IS NOT NULL THEN
    v_floor_no := p_floor_no;
    v_floor_str := CASE
      WHEN p_floor_no < 0 THEN 'Basement'
      WHEN p_floor_no = 0 THEN 'Ground'
      ELSE p_floor_no::text
    END;
  ELSIF p_floor IS NOT NULL AND trim(p_floor) <> '' THEN
    v_floor_str := trim(p_floor);
    IF v_floor_str ~ '^-?[0-9]+$' THEN
      v_floor_no := v_floor_str::smallint;
    ELSIF lower(v_floor_str) IN ('g','gf','ground','ground floor','groundfloor') THEN
      v_floor_no := 0;
    ELSIF lower(v_floor_str) IN ('b','basement') THEN
      v_floor_no := -1;
    ELSE
      v_floor_no := NULL;
    END IF;
  ELSE
    v_floor_no := NULL;
    v_floor_str := NULL;
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM rooms WHERE id = p_room_id) THEN
    RETURN p_room_id;
  END IF;

  INSERT INTO rooms (id, property_id, label, kind, floor, floor_no)
  VALUES (p_room_id, v_property_id, trim(p_label), p_kind, v_floor_str, v_floor_no);

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

-- 5. Update update_room RPC to support p_floor_no
CREATE OR REPLACE FUNCTION public.update_room(
  p_room_id uuid,
  p_label text,
  p_floor text,
  p_gender_rule text,
  p_staff_id uuid,
  p_owner_pin text DEFAULT NULL,
  p_floor_no smallint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_prop uuid;
  v_floor_no smallint;
  v_floor_str text;
BEGIN
  SELECT property_id INTO v_prop FROM rooms WHERE id = p_room_id AND archived_at IS NULL;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Room not found or archived'; END IF;
  PERFORM require_role(v_prop, p_staff_id, ARRAY['owner']);
  IF p_owner_pin IS NOT NULL THEN
    PERFORM verify_owner_pin(v_prop, p_staff_id, p_owner_pin);
  END IF;

  -- Resolve floor_no and floor string
  IF p_floor_no IS NOT NULL THEN
    v_floor_no := p_floor_no;
    v_floor_str := CASE
      WHEN p_floor_no < 0 THEN 'Basement'
      WHEN p_floor_no = 0 THEN 'Ground'
      ELSE p_floor_no::text
    END;
  ELSIF p_floor IS NOT NULL AND trim(p_floor) <> '' THEN
    v_floor_str := trim(p_floor);
    IF v_floor_str ~ '^-?[0-9]+$' THEN
      v_floor_no := v_floor_str::smallint;
    ELSIF lower(v_floor_str) IN ('g','gf','ground','ground floor','groundfloor') THEN
      v_floor_no := 0;
    ELSIF lower(v_floor_str) IN ('b','basement') THEN
      v_floor_no := -1;
    ELSE
      v_floor_no := NULL;
    END IF;
  ELSE
    v_floor_no := NULL;
    v_floor_str := NULL;
  END IF;

  UPDATE rooms 
  SET label = trim(p_label), 
      floor = v_floor_str,
      floor_no = v_floor_no
  WHERE id = p_room_id;

  IF p_gender_rule IS NOT NULL THEN
    UPDATE units SET gender_rule = p_gender_rule WHERE room_id = p_room_id AND archived_at IS NULL;
  END IF;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (v_prop, auth.uid(), 'edit_room', p_room_id, p_staff_id);
END;
$$;

-- 6. Hardened update_staff_role with Owner Step-Up PIN verification
DROP FUNCTION IF EXISTS public.update_staff_role(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_staff_role(uuid, uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.update_staff_role(
  p_prop uuid, 
  p_actor uuid, 
  p_target uuid, 
  p_new_role text,
  p_owner_pin text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM require_role(p_prop, p_actor, ARRAY['owner']);
  PERFORM verify_owner_pin(p_prop, p_actor, p_owner_pin);

  IF p_new_role NOT IN ('owner', 'desk', 'housekeeping') THEN
    RAISE EXCEPTION 'Invalid role. Role must be owner, desk, or housekeeping.';
  END IF;

  IF staff_role(p_prop, p_target) = 'owner' AND p_new_role <> 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff_profiles 
      WHERE property_id = p_prop AND role = 'owner' AND active AND id <> p_target
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last remaining active owner.';
    END IF;
  END IF;

  UPDATE staff_profiles SET role = p_new_role WHERE id = p_target AND property_id = p_prop;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop, auth.uid(), 'update_staff_role:' || p_new_role, p_target, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_room_with_units(uuid, text, text, text, uuid[], text[], text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_room(uuid, text, text, text, uuid, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, uuid, uuid, text, text) TO authenticated;
