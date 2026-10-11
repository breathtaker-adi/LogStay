-- 0011_sprint4_lockdown.sql

BEGIN;

-- 1. REVOKE DIRECT TABLE WRITES
-- The app must NEVER write directly to tables. It must use RPCs.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated, anon;

-- Re-grant SELECT so the app can still read data (RLS will filter it)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 2. ADD VALUE LIMITS (Check Constraints)
-- Prevent negative or massive amounts being injected
ALTER TABLE charges ADD CONSTRAINT chk_charges_qty CHECK (qty >= 1 AND qty <= 50);
ALTER TABLE charges ADD CONSTRAINT chk_charges_price CHECK (unit_price >= 0 AND unit_price <= 50000);

ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0 AND amount <= 200000);
ALTER TABLE cash_entries ADD CONSTRAINT chk_cash_amount CHECK (amount > 0 AND amount <= 200000);
ALTER TABLE stays ADD CONSTRAINT chk_stays_amount CHECK (amount >= 0 AND amount <= 200000);

-- 3. SECURE JOIN PROPERTY FUNCTION
-- Currently, anyone can insert into 'members'. We must stop that and use a join function.
DROP POLICY IF EXISTS "strict members rw" ON members;
CREATE POLICY members_read ON members FOR SELECT TO authenticated
  USING (is_member(property_id));

-- Create the secure join function
CREATE OR REPLACE FUNCTION join_property(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE
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

-- 4. RESTRICT PROPERTIES TABLE
-- Ensure desk staff cannot update paid_until
REVOKE UPDATE ON properties FROM authenticated;
GRANT UPDATE (name, type, state) ON properties TO authenticated;

-- 5. STORAGE BUCKET LIMITS
-- Enforce 1MB max size and JPEG only for ID photos
UPDATE storage.buckets 
SET file_size_limit = 1048576, 
    allowed_mime_types = array['image/jpeg'] 
WHERE id = 'id_photos';

COMMIT;