-- supabase/migrations/20261015000006_property_branding_and_photo_approval.sql
-- 1. Add photo_url and pending_photo approval columns to properties
-- 2. Owner property name update RPC
-- 3. Owner property photo update RPC
-- 4. Front desk property photo proposal RPC
-- 5. Owner photo review (approve / reject) RPC

BEGIN;

-- 1. Columns on properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pending_photo_url text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pending_photo_by uuid REFERENCES public.staff_profiles(id);

-- 2. Owner: update property name
CREATE OR REPLACE FUNCTION public.owner_update_property_name(
  p_prop_id uuid,
  p_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only property owner can update property name';
  END IF;

  IF length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Property name cannot be empty';
  END IF;

  UPDATE properties
  SET name = trim(p_name)
  WHERE id = p_prop_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop_id, v_user_id, 'update_property_name:' || trim(p_name), p_prop_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_update_property_name(uuid, text) TO authenticated;

-- 3. Owner: update property photo directly
CREATE OR REPLACE FUNCTION public.owner_update_property_photo(
  p_prop_id uuid,
  p_photo_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only property owner can directly update property photo';
  END IF;

  UPDATE properties
  SET photo_url = trim(p_photo_url),
      pending_photo_url = NULL,
      pending_photo_by = NULL
  WHERE id = p_prop_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop_id, v_user_id, 'update_property_photo', p_prop_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_update_property_photo(uuid, text) TO authenticated;

-- 4. Front Desk: propose property photo for owner approval
CREATE OR REPLACE FUNCTION public.desk_propose_property_photo(
  p_prop_id uuid,
  p_photo_url text,
  p_staff_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_member(p_prop_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE properties
  SET pending_photo_url = trim(p_photo_url),
      pending_photo_by = p_staff_id
  WHERE id = p_prop_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id, staff_id)
  VALUES (p_prop_id, v_user_id, 'propose_property_photo', p_prop_id, p_staff_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.desk_propose_property_photo(uuid, text, uuid) TO authenticated;

-- 5. Owner: review pending property photo (approve or reject)
CREATE OR REPLACE FUNCTION public.owner_review_property_photo(
  p_prop_id uuid,
  p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_pending text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only property owner can review property photos';
  END IF;

  SELECT pending_photo_url INTO v_pending FROM properties WHERE id = p_prop_id;
  IF v_pending IS NULL THEN
    RAISE EXCEPTION 'No pending photo to review';
  END IF;

  IF p_approve THEN
    UPDATE properties
    SET photo_url = v_pending,
        pending_photo_url = NULL,
        pending_photo_by = NULL
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'approve_property_photo', p_prop_id);
  ELSE
    UPDATE properties
    SET pending_photo_url = NULL,
        pending_photo_by = NULL
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'reject_property_photo', p_prop_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_review_property_photo(uuid, boolean) TO authenticated;

COMMIT;

