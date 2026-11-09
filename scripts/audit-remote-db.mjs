import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
console.log('--- REMOTE SUPABASE DATABASE SCHEMA AUDIT ---');

// 1. Check all required tables
const expectedTables = [
  'properties', 'members', 'member_pins', 'staff_profiles', 'property_invites',
  'rooms', 'units', 'guests', 'stays', 'foreign_details',
  'shifts', 'cash_entries', 'charges', 'payments', 'audit_log',
  'issues', 'approval_requests', 'cosign_attempts', 'join_attempts',
  'housekeeping_log', 'staff_attendance', 'staff_remarks'
];

const tablesRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
const actualTables = new Set(tablesRes.rows.map(r => r.tablename));

const missingTables = expectedTables.filter(t => !actualTables.has(t));
console.log(`Tables check: ${actualTables.size} tables found.`);
if (missingTables.length > 0) {
  console.error('❌ MISSING TABLES:', missingTables);
} else {
  console.log('✅ All 22 expected tables exist!');
}

// 2. Check crucial columns from migrations 0001 through 0013
const columnChecks = [
  { table: 'properties', column: 'wifi_password' },
  { table: 'properties', column: 'photo_url' },
  { table: 'properties', column: 'pending_photo_url' },
  { table: 'properties', column: 'upi_id' },
  { table: 'properties', column: 'upi_qr_url' },
  { table: 'properties', column: 'google_maps_url' },
  { table: 'properties', column: 'house_rules' },
  { table: 'rooms', column: 'floor_no' },
  { table: 'rooms', column: 'description' },
  { table: 'foreign_details', column: 'form_c_filed' },
  { table: 'shifts', column: 'closed_by' },
  { table: 'shifts', column: 'handover_by' },
  { table: 'shifts', column: 'handover_name' },
  { table: 'shifts', column: 'handover_cash' },
  { table: 'shifts', column: 'handover_at' },
  { table: 'shifts', column: 'handover_variance' },
  { table: 'property_invites', column: 'role' },
  { table: 'staff_profiles', column: 'user_id' }
];

const colsRes = await client.query(`
  SELECT table_name, column_name 
  FROM information_schema.columns 
  WHERE table_schema = 'public'
`);
const colSet = new Set(colsRes.rows.map(r => `${r.table_name}.${r.column_name}`));

const missingCols = columnChecks.filter(c => !colSet.has(`${c.table}.${c.column}`));
if (missingCols.length > 0) {
  console.error('❌ MISSING COLUMNS:', missingCols);
} else {
  console.log(`✅ All ${columnChecks.length} verified migration columns from all 13 migrations are present!`);
}

// 3. Check all application RPCs
const expectedRPCs = [
  'create_property',
  'resolve_user_profile',
  'check_in_guest',
  'check_out_guest',
  'move_stay',
  'extend_stay',
  'add_room_with_units',
  'update_room',
  'remove_room',
  'add_beds',
  'rename_unit',
  'mark_unit_clean',
  'set_unit_maintenance',
  'open_shift',
  'close_shift_secure',
  'submit_shift_handover',
  'accept_shift_handover',
  'record_payment',
  'refund_payment',
  'add_stay_charge',
  'add_petty_cash',
  'verify_upi_payment',
  'generate_invite_code',
  'redeem_invite_code',
  'cancel_invite_code',
  'get_property_team',
  'remove_team_member',
  'lookup_staff_remarks',
  'get_staff_remarks',
  'report_issue',
  'resolve_issue',
  'request_approval',
  'decide_approval',
  'verify_owner_pin',
  'require_role',
  'reset_staff_pin',
  'update_staff_role',
  'approve_staff',
  'owner_add_staff',
  'deactivate_staff',
  'delete_expired_id_photos'
];

const rpcRes = await client.query(`
  SELECT proname 
  FROM pg_proc 
  JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid 
  WHERE nspname = 'public'
`);
const rpcSet = new Set(rpcRes.rows.map(r => r.proname));

const missingRPCs = expectedRPCs.filter(r => !rpcSet.has(r));
if (missingRPCs.length > 0) {
  console.error('❌ MISSING RPCs:', missingRPCs);
} else {
  console.log(`✅ All ${expectedRPCs.length} application RPCs are present!`);
}

// 4. Check RLS status on all tables
const rlsRes = await client.query(`
  SELECT relname, relrowsecurity 
  FROM pg_class 
  JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid 
  WHERE nspname = 'public' AND relkind = 'r'
`);
const nonRlsTables = rlsRes.rows.filter(r => !r.relrowsecurity).map(r => r.relname);
if (nonRlsTables.length > 0) {
  console.warn('⚠️ Tables without RLS enabled:', nonRlsTables);
} else {
  console.log('✅ All 22 public tables have Row-Level Security ENABLED!');
}

// 5. Check if units world-open policies are gone
const unitsPol = await client.query(`
  SELECT policyname 
  FROM pg_policies 
  WHERE tablename = 'units'
`);
console.log('Policies on units table:', unitsPol.rows.map(r => r.policyname));

await client.end();
