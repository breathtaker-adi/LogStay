-- 0009_sprint1_financials.sql

-- 1. Add refunded flag to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded boolean DEFAULT false;

-- 2. Refund Payment RPC (Owner Only)
-- If cash, deducts from the open shift. Decreases stay paid_amount.
CREATE OR REPLACE FUNCTION refund_payment(p_payment_id uuid, p_staff_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$ DECLARE
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