-- supabase/migrations/20261015000011_upi_and_concierge_approval.sql
-- 1. Add UPI fields and pending_concierge jsonb to properties table
-- 2. Owner UPI settings update RPC
-- 3. Concierge updates supporting Co-Admin direct save & Front Desk approval workflow
-- 4. resolve_issue RPC for room and dorm issue tracking

BEGIN;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS upi_id text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS upi_qr_url text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pending_concierge jsonb DEFAULT NULL;

-- ── 1. Owner Update UPI Settings RPC ─────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_update_upi_settings(
  p_prop_id uuid,
  p_upi_id text,
  p_upi_qr_url text
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
    RAISE EXCEPTION 'Only property owner can configure receiving UPI payment barcode';
  END IF;

  UPDATE properties
  SET upi_id = NULLIF(trim(p_upi_id), ''),
      upi_qr_url = NULLIF(trim(p_upi_qr_url), '')
  WHERE id = p_prop_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop_id, v_user_id, 'update_upi_settings', p_prop_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_update_upi_settings(uuid, text, text) TO authenticated;

-- ── 2. Update Concierge Settings (Owner & Co-Admin Direct, Front Desk Proposal) ──
CREATE OR REPLACE FUNCTION public.save_concierge_settings(
  p_prop_id uuid,
  p_wifi_ssid text,
  p_wifi_password text,
  p_google_maps_url text,
  p_google_review_url text,
  p_house_rules text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_staff_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, name INTO v_role, v_staff_name FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this property';
  END IF;

  -- Owner and Co-Admin can update directly
  IF v_role IN ('owner', 'co_admin') THEN
    UPDATE properties
    SET wifi_ssid = trim(p_wifi_ssid),
        wifi_password = trim(p_wifi_password),
        google_maps_url = trim(p_google_maps_url),
        google_review_url = trim(p_google_review_url),
        house_rules = trim(p_house_rules),
        pending_concierge = NULL
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'update_concierge_settings_direct', p_prop_id);

    RETURN 'saved';
  END IF;

  -- Front Desk boy can propose edits, but requires Co-Admin / Owner approval
  IF v_role = 'desk' THEN
    UPDATE properties
    SET pending_concierge = jsonb_build_object(
      'wifi_ssid', trim(p_wifi_ssid),
      'wifi_password', trim(p_wifi_password),
      'google_maps_url', trim(p_google_maps_url),
      'google_review_url', trim(p_google_review_url),
      'house_rules', trim(p_house_rules),
      'submitted_by', coalesce(v_staff_name, 'Front Desk'),
      'submitted_at', now()
    )
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'propose_concierge_settings', p_prop_id);

    RETURN 'pending_review';
  END IF;

  RAISE EXCEPTION 'Role % is not permitted to edit concierge settings', v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_concierge_settings(uuid, text, text, text, text, text) TO authenticated;

-- ── 3. Review Concierge Proposal (Owner & Co-Admin Only) ───────────
CREATE OR REPLACE FUNCTION public.review_concierge_proposal(
  p_prop_id uuid,
  p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_pending jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM members WHERE property_id = p_prop_id AND user_id = v_user_id;
  IF v_role NOT IN ('owner', 'co_admin') THEN
    RAISE EXCEPTION 'Only Owner and Co-Admin can review proposed concierge updates';
  END IF;

  SELECT pending_concierge INTO v_pending FROM properties WHERE id = p_prop_id;
  IF v_pending IS NULL THEN
    RETURN;
  END IF;

  IF p_approve THEN
    UPDATE properties
    SET wifi_ssid = (v_pending->>'wifi_ssid'),
        wifi_password = (v_pending->>'wifi_password'),
        google_maps_url = (v_pending->>'google_maps_url'),
        google_review_url = (v_pending->>'google_review_url'),
        house_rules = (v_pending->>'house_rules'),
        pending_concierge = NULL
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'approve_concierge_proposal', p_prop_id);
  ELSE
    UPDATE properties
    SET pending_concierge = NULL
    WHERE id = p_prop_id;

    INSERT INTO audit_log (property_id, user_id, action, record_id)
    VALUES (p_prop_id, v_user_id, 'decline_concierge_proposal', p_prop_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_concierge_proposal(uuid, boolean) TO authenticated;

-- ── 4. Resolve Issue RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_issue(
  p_issue_id uuid,
  p_staff_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  UPDATE issues
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = coalesce(p_staff_id, auth.uid())
  WHERE id = p_issue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_issue(uuid, uuid) TO authenticated;

COMMIT;
