-- supabase/migrations/20261015000010_room_description_and_remarks.sql
-- Add description/remark column to rooms table and update add_room_with_units RPC

ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS description text;

-- Update add_room_with_units RPC to support p_description
CREATE OR REPLACE FUNCTION public.add_room_with_units(
  p_room_id uuid,
  p_label text,
  p_kind text,
  p_floor text DEFAULT NULL,
  p_unit_ids uuid[] DEFAULT NULL,
  p_unit_labels text[] DEFAULT NULL,
  p_gender_rule text DEFAULT 'any',
  p_floor_no smallint DEFAULT NULL,
  p_description text DEFAULT NULL
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

  INSERT INTO rooms (id, property_id, label, kind, floor, floor_no, description)
  VALUES (p_room_id, v_property_id, trim(p_label), p_kind, v_floor_str, v_floor_no, NULLIF(trim(p_description), ''));

  -- Create units
  IF p_kind = 'private' THEN
    INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
    VALUES (p_unit_ids[1], p_room_id, 'Whole Room', p_gender_rule, 'clean');
  ELSIF array_length(p_unit_ids, 1) > 0 THEN
    FOR v_i IN 1..array_length(p_unit_ids, 1) LOOP
      INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
      VALUES (
        p_unit_ids[v_i],
        p_room_id,
        CASE
          WHEN p_unit_labels IS NOT NULL AND array_length(p_unit_labels, 1) >= v_i THEN p_unit_labels[v_i]
          ELSE 'Bed ' || v_i
        END,
        p_gender_rule,
        'clean'
      );
    END LOOP;
  END IF;

  RETURN p_room_id;
END;
$$;

