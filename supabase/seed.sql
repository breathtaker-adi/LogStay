-- supabase/seed.sql
-- Seed data for LogStay local development and pilot demonstration.
-- Sets up a full Goa boutique stay with multi-floor rooms, beds, and staff.

DO $$
DECLARE
  v_prop_id uuid := 'a66484a1-30c8-41ae-82ec-f65b5598ba0b';
  v_owner_user uuid := '11111111-1111-1111-1111-111111111111';
  v_owner_staff uuid := '22222222-2222-2222-2222-222222222222';
  v_desk_staff uuid := '33333333-3333-3333-3333-333333333333';
  v_hk_staff uuid := '44444444-4444-4444-4444-444444444444';
  
  v_room_g1 uuid := gen_random_uuid();
  v_room_g2 uuid := gen_random_uuid();
  v_room_f1 uuid := gen_random_uuid();
  v_room_f2 uuid := gen_random_uuid();
  v_room_b1 uuid := gen_random_uuid();

  -- Dynamically generated random 6-digit seed PINs (Finding #20 hardening)
  v_owner_pin text := (floor(random() * 900000 + 100000))::text;
  v_desk_pin text := (floor(random() * 900000 + 100000))::text;
  v_hk_pin text := (floor(random() * 900000 + 100000))::text;
BEGIN
  -- 1. Property
  INSERT INTO properties (id, name, address, phone)
  VALUES (v_prop_id, 'Sunset Palms Boutique Stay & Hostel', 'House #42, Anjuna Beach Road, Goa 403509', '+91 98221 23456')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- 2. Staff Profiles (Random dynamic PINs hashed with bcrypt)
  RAISE NOTICE 'Generated Seed PINs -> Owner: %, Desk: %, Housekeeping: %', v_owner_pin, v_desk_pin, v_hk_pin;
  INSERT INTO staff_profiles (id, property_id, name, phone, role, pin_hash, active)
  VALUES 
    (v_owner_staff, v_prop_id, 'Aditya (Owner)', '+91 98221 23456', 'owner', crypt(v_owner_pin, gen_salt('bf', 10)), true),
    (v_desk_staff, v_prop_id, 'Ramesh (Front Desk)', '+91 98221 11111', 'desk', crypt(v_desk_pin, gen_salt('bf', 10)), true),
    (v_hk_staff, v_prop_id, 'Sunita (Housekeeper)', '+91 98221 22222', 'housekeeping', crypt(v_hk_pin, gen_salt('bf', 10)), true)
  ON CONFLICT (id) DO NOTHING;

  -- 3. Multi-Floor Rooms
  -- Ground Floor (floor_no = 0)
  INSERT INTO rooms (id, property_id, label, kind, floor, floor_no)
  VALUES 
    (v_room_g1, v_prop_id, 'Sea Breeze Dorm 101', 'dorm', 'Ground', 0),
    (v_room_g2, v_prop_id, 'Garden Private 102', 'private', 'Ground', 0)
  ON CONFLICT DO NOTHING;

  -- First Floor (floor_no = 1)
  INSERT INTO rooms (id, property_id, label, kind, floor, floor_no)
  VALUES 
    (v_room_f1, v_prop_id, 'Palm View Dorm 201', 'dorm', '1', 1),
    (v_room_f2, v_prop_id, 'Balcony Private 202', 'private', '1', 1)
  ON CONFLICT DO NOTHING;

  -- Basement (floor_no = -1)
  INSERT INTO rooms (id, property_id, label, kind, floor, floor_no)
  VALUES 
    (v_room_b1, v_prop_id, 'Surfer Dorm B1', 'dorm', 'Basement', -1)
  ON CONFLICT DO NOTHING;

  -- 4. Beds (Units)
  INSERT INTO units (id, room_id, label, gender_rule, housekeeping_status)
  VALUES
    (gen_random_uuid(), v_room_g1, 'Bed A', 'any', 'clean'),
    (gen_random_uuid(), v_room_g1, 'Bed B', 'any', 'clean'),
    (gen_random_uuid(), v_room_g1, 'Bed C', 'any', 'clean'),
    (gen_random_uuid(), v_room_g1, 'Bed D', 'any', 'clean'),
    (gen_random_uuid(), v_room_g2, 'Whole Room', 'any', 'clean'),
    (gen_random_uuid(), v_room_f1, 'Bed 1', 'any', 'clean'),
    (gen_random_uuid(), v_room_f1, 'Bed 2', 'any', 'clean'),
    (gen_random_uuid(), v_room_f2, 'Whole Room', 'any', 'clean'),
    (gen_random_uuid(), v_room_b1, 'Bed 1', 'male', 'clean'),
    (gen_random_uuid(), v_room_b1, 'Bed 2', 'male', 'clean')
  ON CONFLICT DO NOTHING;
END;
$$;
