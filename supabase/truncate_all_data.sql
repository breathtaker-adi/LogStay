-- ============================================================================
-- LogStay Database Truncation Scripts
-- Run these scripts in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- OPTION 1: TRUNCATE OPERATIONAL TEST DATA ONLY (RECOMMENDED & SAFE)
-- Keeps: Properties, Rooms, Beds, Staff Profiles, and Owner Accounts
-- Clears: All test guests, stays, cash entries, shifts, housekeeping logs, issues
-- Note: Uses dynamic table detection so it never fails if a table does not exist
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  v_tables text[] := ARRAY[
    'foreign_details',
    'charges',
    'payments',
    'cash_entries',
    'housekeeping_log',
    'issues',
    'audit_log',
    'staff_attendance',
    'stays',
    'guests',
    'shifts',
    'join_attempts',
    'cosign_attempts',
    'approval_requests'
  ];
BEGIN
  -- Truncate each table only if it actually exists in the public schema
  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE;', t);
    END IF;
  END LOOP;

  -- Reset housekeeping status on existing units/beds
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'units'
  ) THEN
    UPDATE public.units SET housekeeping_status = 'clean';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- OPTION 1 (ALTERNATIVE): STANDARD STATIC SQL
-- If you prefer plain static SQL without a DO block:
-- ----------------------------------------------------------------------------
/*
BEGIN;

TRUNCATE TABLE
  public.foreign_details,
  public.charges,
  public.payments,
  public.cash_entries,
  public.housekeeping_log,
  public.issues,
  public.audit_log,
  public.staff_attendance,
  public.stays,
  public.guests,
  public.shifts,
  public.cosign_attempts
CASCADE;

UPDATE public.units 
SET housekeeping_status = 'clean';

COMMIT;
*/


-- ----------------------------------------------------------------------------
-- OPTION 2: FULL FACTORY RESET (COMPLETE WIPE)
-- WARNING: Wipes EVERYTHING including Property, Rooms, Beds, Staff & Members
-- ----------------------------------------------------------------------------
/*
DO $$
DECLARE
  t text;
  v_tables text[] := ARRAY[
    'foreign_details',
    'charges',
    'payments',
    'cash_entries',
    'housekeeping_log',
    'issues',
    'audit_log',
    'staff_attendance',
    'stays',
    'guests',
    'shifts',
    'join_attempts',
    'cosign_attempts',
    'approval_requests',
    'staff_remarks',
    'member_pins',
    'property_invites',
    'staff_profiles',
    'units',
    'rooms',
    'members',
    'properties'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE;', t);
    END IF;
  END LOOP;
END $$;
*/
