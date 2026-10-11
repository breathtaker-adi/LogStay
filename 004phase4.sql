-- 0004_phase4_charges.sql

BEGIN;

-- 1. CHARGES TABLE (Purchases & Extras)
CREATE TABLE IF NOT EXISTS charges (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  stay_id uuid references stays(id) on delete cascade not null,
  item text not null,
  qty int default 1,
  unit_price numeric(10,2) not null,
  paid boolean default false,
  pay_mode text check (pay_mode in ('cash', 'upi')),
  staff_id uuid references staff_profiles(id),
  created_at timestamptz default now()
);

ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charges rw" ON charges FOR ALL TO authenticated 
  USING (is_member(property_id)) WITH CHECK (is_member(property_id));

-- 2. ADD PAID_AMOUNT TO STAYS (for advance payments)
ALTER TABLE stays ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2) default 0;

-- 3. RECORD PAYMENT FUNCTION (for collecting cash/card at checkout or advances)
CREATE OR REPLACE FUNCTION record_payment(
  p_stay_id uuid, 
  p_amount numeric, 
  p_pay_mode text, 
  p_staff_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
  v_property_id uuid;
  v_open_shift_id uuid;
BEGIN
  SELECT property_id INTO v_property_id FROM stays WHERE id = p_stay_id;
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'Stay not found'; END IF;
  
  IF NOT is_member(v_property_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  -- Update stay paid amount
  UPDATE stays SET paid_amount = paid_amount + p_amount WHERE id = p_stay_id;

  -- If cash, record in shift
  IF p_pay_mode = 'cash' THEN
    SELECT id INTO v_open_shift_id FROM shifts 
    WHERE property_id = v_property_id AND status = 'open' LIMIT 1;
    
    IF v_open_shift_id IS NULL THEN RAISE EXCEPTION 'Cannot accept cash without an open shift'; END IF;
    
    INSERT INTO cash_entries (shift_id, kind, amount, note, staff_id, stay_id)
    VALUES (v_open_shift_id, 'collection', p_amount, 'Payment: Stay ' || p_stay_id, p_staff_id, p_stay_id);
  END IF;
END;
 $$;

COMMIT;