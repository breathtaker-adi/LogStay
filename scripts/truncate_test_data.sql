-- ============================================================================
-- LogStay Database Truncation Scripts
-- Run these scripts in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- OPTION 1: TRUNCATE OPERATIONAL TEST DATA ONLY (RECOMMENDED)
-- Keeps: Properties, Rooms, Beds, Staff Profiles, and Owner Accounts
-- Clears: All test guests, stays, cash entries, shifts, housekeeping logs, issues, requests
-- ----------------------------------------------------------------------------

BEGIN;

-- 1. Truncate all transactional & operational activity
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
  public.join_attempts,
  public.cosign_attempts,
  public.desk_staff_requests,
  public.concierge_change_requests
CASCADE;

-- 2. Reset all unit / bed housekeeping statuses to 'clean'
UPDATE public.units 
SET housekeeping_status = 'clean';

COMMIT;


-- ----------------------------------------------------------------------------
-- OPTION 2: FULL FACTORY RESET (COMPLETE WIPE)
-- WARNING: Wipes EVERYTHING including your Property, Rooms, Beds, Staff & Members
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
  public.join_attempts,
  public.cosign_attempts,
  public.desk_staff_requests,
  public.concierge_change_requests,
  public.staff_remarks,
  public.member_pins,
  public.property_invites,
  public.staff_profiles,
  public.units,
  public.rooms,
  public.members,
  public.properties
CASCADE;

-- Optional: If you also want to remove test ID photos from storage:
-- DELETE FROM storage.objects WHERE bucket_id = 'id_photos';

COMMIT;
*/
