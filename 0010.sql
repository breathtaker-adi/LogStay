-- 0010_sprint2_invites.sql

-- 1. Create Invites Table
CREATE TABLE IF NOT EXISTS property_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites rw" ON property_invites FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 2. Generate Invite Code RPC (Owner Only)
-- Generates a random 6-character alphanumeric code valid for 48 hours
CREATE OR REPLACE FUNCTION generate_invite_code(p_prop uuid, p_actor uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
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

-- 3. Validate Invite Code RPC (Used during staff/property setup)
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE
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