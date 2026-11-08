-- 0022_property_concierge_fields.sql
-- Adds Wi-Fi credentials, maps navigation, and review link to properties for WhatsApp Concierge

BEGIN;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS wifi_ssid text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS wifi_password text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS google_maps_url text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS google_review_url text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS house_rules text;

-- Owner update concierge settings RPC
CREATE OR REPLACE FUNCTION public.owner_update_concierge_settings(
  p_prop_id uuid,
  p_wifi_ssid text,
  p_wifi_password text,
  p_google_maps_url text,
  p_google_review_url text,
  p_house_rules text
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
    RAISE EXCEPTION 'Only property owner can update concierge & Wi-Fi settings';
  END IF;

  UPDATE properties
  SET wifi_ssid = trim(p_wifi_ssid),
      wifi_password = trim(p_wifi_password),
      google_maps_url = trim(p_google_maps_url),
      google_review_url = trim(p_google_review_url),
      house_rules = trim(p_house_rules)
  WHERE id = p_prop_id;

  INSERT INTO audit_log (property_id, user_id, action, record_id)
  VALUES (p_prop_id, v_user_id, 'update_concierge_settings', p_prop_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_update_concierge_settings(uuid, text, text, text, text, text) TO authenticated;

COMMIT;

