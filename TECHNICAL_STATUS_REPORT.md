# Technical Status & Architecture Report: LogStay Mobile

**Author:** Antigravity (Acting Principal Software Architect & Lead Technical Project Manager)  
**Project:** LogStay Mobile — Offline-First Property Management & Compliance System  
**Target Platform:** Android & iOS (React Native 0.86.3 / Expo SDK ~57.0.27)  
**Backend:** Supabase (PostgreSQL 15.8, Deno Edge Functions, Storage, pg_cron, pg_net)  
**Database Encryption & Storage:** Hardware-backed `expo-secure-store`, SQLCipher `expo-sqlite`, Noble PBKDF2 (100,000 iterations)  
**Milestone / Sprint:** Sprint 6 — Security Lockdown, Attack Suite Hardening & Pre-EAS Pilot Gate  
**Report Date:** October 11, 2026  
**Git Revision:** `f60162b` (Master)  

---

# 1. Executive Summary

### 1.1 Current Project Status: ON TRACK (~85% Pilot-Ready)
LogStay Mobile has completed all core functional modules, backend lockdowns, and defensive security requirements outlined in the Security Review & Hardening Plan. The application is currently entering the **Pre-EAS Pilot Gate**, with all keyboard architecture completed, automated attack suites passing at 100%, and only device-based physical verifications and native EAS artifact generation remaining before field deployment.

### 1.2 Target Completion Phase & Milestones
* **Current Phase:** Pre-Release Validation & EAS Staging.
* **Immediate Milestone:** Consolidated Device Session (7 physical test cases) → Preview APK Build with SQLCipher & Proguard → 3GB Low-End Hardware Pass → 2–3 Property Pilot Launch.
* **Target Release Date:** Closed Pilot deployment scheduled immediately following device gate sign-off.

### 1.3 Milestone Accomplishments (Current Sprint Cycle)
1. **Defensive Lockdown & RLS Perimeter:** 19 of 19 public tables enforce strict PostgreSQL Row-Level Security (`is_member(property_id)`). Direct table writes (`INSERT`, `UPDATE`, `DELETE`) are completely revoked from client roles (`authenticated`, `anon`); all mutations flow through atomic, idempotent `SECURITY DEFINER` RPCs.
2. **Section 7 Attack Matrix Execution:** Automated security regression test runner (`scripts/attack-tests.mjs`) completed with **20 Passed · 0 Failed · 0 Skipped**, verifying cross-property data isolation, view security invoker boundaries, role authorization barriers, payment idempotency, and online PIN lockout.
3. **Automated Photo Purge Pipeline (Finding #1):** Remote Deno Edge Function (`purge-id-photos`) deployed and verified with rotation-proof shared-secret authorization (`x-cron-secret`). Automated hourly cron job (`pg_cron` Job ID 4) permanently purges guest identity photos older than 6 months from both storage and database records.
4. **Device Hardening & Hardware Cryptography:** Replaced AsyncStorage with chunked hardware-backed `LargeSecureStore` (1,800-byte slicing). Upgraded offline staff PIN verification to 100,000-round PBKDF2 with SHA-256 and per-user cryptographic salts via `@noble/hashes`. Configured `allowBackup: false` and blocked external storage permissions in `app.json`.
5. **Insider Fraud Detection & Morning Reconciliation:** Implemented the Owner Daily Digest screen (`src/app/digest.tsx`), providing instant variance tracking between counted and expected drawer cash, bed occupancy reconciliation, and audit log alerts for unauthorized refunds, payouts exceeding ₹1,000, and failed PIN attempts.
6. **EAS Build & SQLCipher Staging:** Staged `eas.json` preview APK profile, configured `expo-sqlite` with `useSQLCipher: true`, configured `expo-build-properties` with Android R8 code shrinking and resource minification, and wired synchronous key injection into `src/lib/offline.ts`.

---

# 2. Architecture & Tech Stack Breakdown

```
                                  +---------------------------------------------+
                                  |            LogStay Mobile App               |
                                  |   (React Native 0.86 / Expo SDK 57 / TS)    |
                                  +---------------------------------------------+
                                         |                               |
                   [Mutations via RPC / Queries via RLS]      [Offline Local Storage]
                                         |                               |
                                         v                               v
                     +-----------------------+              +-----------------------+
                     |  Supabase Cloud (PaaS)|              | Local Android SQLite  |
                     |  - PostgreSQL 15.8    |              | - SQLCipher Encrypted |
                     |  - PostgREST APIs     |              | - WAL Journal Mode    |
                     |  - GoTrue Auth (JWT)  |              | - Outbox Mutation Q   |
                     |  - Storage (id_photos)|              | - Fast Read-Caches    |
                     +-----------------------+              +-----------------------+
                           |           |                                 ^
        [pg_cron Hourly]   |           | [Storage Purge]                 |
                           v           v                                 |
                     +-----------------------+                           |
                     | Deno Edge Functions   |                           |
                     |  - purge-id-photos    |                           |
                     +-----------------------+                           |
                                                                         v
                                                            +-----------------------+
                                                            | LargeSecureStore      |
                                                            | - Keystore/KeyChain   |
                                                            | - Session Tokens      |
                                                            | - DB Encryption Key   |
                                                            +-----------------------+
```

### 2.1 Architectural Patterns
* **Offline-First CQRS Architecture:** Reads are served instantaneously from local SQLite cache tables or scoped PostgREST queries. All state-altering operations (check-in, checkout, shift opens, payments, charges) generate deterministic client UUIDs and append payload records to a persistent SQLite `outbox` table before syncing upstream.
* **Dual-Custody Cash Shift Engine:** Shift handovers enforce multi-party verification. Shift closings require the physical counted cash and the cryptographic PIN verification of the incoming staff member, or an explicit solo audit trace when closed by the property owner.
* **Zero Direct Table Writes:** Database access follows least-privilege principles. Tables grant only `SELECT` to authenticated users filtered through multi-tenant RLS. Mutations occur exclusively through `SECURITY DEFINER` stored procedures enforcing role guards (`require_role`) and atomic constraints.

### 2.2 Core Dependencies & Runtime
* **Runtime:** React Native 0.86.3, React 19.2.3, Hermes JavaScript Engine.
* **Navigation & Routing:** Expo Router ~57.0.25 (file-based routing, layout stacks, dynamic routes).
* **Storage & Native Security:** `expo-secure-store` ~57.0.4, `expo-sqlite` ~57.0.4 (SQLCipher extension), `expo-crypto` ~57.0.3, `@noble/hashes` ^2.4.0 (PBKDF2-HMAC-SHA256).
* **Network & Offline Management:** `@react-native-community/netinfo` 12.0.1, `@supabase/supabase-js` ^2.117.2, `expo-file-system` ~57.0.7, `expo-sharing` ~57.0.22.
* **UI & Hardware Integration:** `expo-image-picker` ~57.0.20, `expo-image-manipulator` ~57.0.21, `react-native-reanimated` 4.5.1, `react-native-safe-area-context` ~5.7.0.

---

# 3. Comprehensive File Manifest & Directory Map

| File Path | Component / Layer Type | Purpose & Core Responsibility | Status |
| :--- | :--- | :--- | :--- |
| `app.json` | Configuration / Native | Expo application manifest: app ID, native permissions, splash screen, SQLCipher & build property plugins, `allowBackup: false`. | Complete |
| `eas.json` | Configuration / CI/CD | EAS Build profiles for development, preview APK (internal distribution), and production app bundles. | Complete |
| `package.json` | Configuration / Build | NPM project definition, locked SDK 57 dependencies, build scripts, and `test:security` runner. | Complete |
| `tsconfig.json` | Configuration / Compiler | TypeScript compiler configuration (strict mode, JSX preserve, path aliases). | Complete |
| `eslint.config.js` | Configuration / Linter | Flat ESLint config extending `eslint-config-expo`. | Complete |
| `AGENTS.md` | Documentation / Rules | Project engineering constraints: Expo SDK version discipline, CNG rules, and routing policies. | Complete |
| `RESTORE.md` | Documentation / Disaster Recovery | Step-by-step database disaster recovery and schema restoration guide. | Complete |
| `src/declarations.d.ts` | TypeScript Definitions | Ambient module declarations for CSS modules and assets. | Complete |
| `src/global.css` | Styling | Global base styling and CSS variables for web fallback views. | Complete |
| `src/app/_layout.tsx` | Navigation / Root Layout | Root application stack navigator; wraps app in `StaffProvider` and registers all screen routes. | Complete |
| `src/app/index.tsx` | Navigation / Gatekeeper | Initial entry redirector; resolves session presence and routes to login or home dashboard. | Complete |
| `src/app/login.tsx` | Screen / Auth | Owner account authentication (Supabase email/password login). | Complete |
| `src/app/staff-login.tsx` | Screen / Auth | Daily tablet staff PIN selector; executes online `staff_login` or local 100k-round PBKDF2 fallback. | Complete |
| `src/app/home.tsx` | Screen / Dashboard | Core operations dashboard: room occupancy grid, active shift status, outbox badge, quick actions. | Complete |
| `src/app/checkin.tsx` | Screen / Operations | Guest check-in form: bed selector, ID scanner, payment collection (UPI/Cash), foreign guest toggle. | Complete |
| `src/app/checkout.tsx` | Screen / Operations | Guest folio checkout: balance review, key return, unit dirty marking via `check_out_guest`. | Complete |
| `src/app/shift.tsx` | Screen / Operations | Cash drawer management: float opening, petty cash logging, and dual-custody PIN closing. | Complete |
| `src/app/digest.tsx` | Screen / Audit | Owner Daily Digest: drawer variance reconciliation, occupancy metrics, audit fraud alerts. | Complete |
| `src/app/guests.tsx` | Screen / Directory | Active and past guest registry with search and folio navigation. | Complete |
| `src/app/guest/[id].tsx` | Screen / Folio Detail | Guest detail screen: stays, ID view, charges, payments, refunds, and issue logging. | Complete |
| `src/app/room/[id].tsx` | Screen / Room Detail | Detailed view of room units, occupancy status, and maintenance mode controls. | Complete |
| `src/app/add-room.tsx` | Screen / Setup | Room and bed batch creator calling `add_room_with_units`. | Complete |
| `src/app/add-staff.tsx` | Screen / Admin | Owner staff onboarding screen: staff name, phone, role assignment, and 4-digit PIN setup. | Complete |
| `src/app/form-c.tsx` | Screen / Compliance | Foreign tourist compliance register: lists foreign guests and marks filings via `mark_form_c_filed`. | Complete |
| `src/app/exports.tsx` | Screen / Compliance | Regulatory export generator: CSV generation for Police Register, Form C, and Cash Book. | Complete |
| `src/app/outbox.tsx` | Screen / Sync | Offline outbox monitor: lists pending offline mutations with manual re-sync trigger. | Complete |
| `src/app/audit-log.tsx` | Screen / Security | Immutable system audit log viewer (role restricted to owner). | Complete |
| `src/app/settings.tsx` | Screen / Settings | Property configuration, staff management list, and invite code generation. | Complete |
| `src/app/setup-property.tsx` | Screen / Onboarding | Initial property bootstrap screen: property creation or invite code joining. | Complete |
| `src/app/paywall.tsx` | Screen / Billing | Subscription status and renewal screen (checks `properties.paid_until`). | Complete |
| `src/app/privacy.tsx` | Screen / Legal | Privacy policy and data retention disclosures (Aadhaar masking, 6-month photo purge). | Complete |
| `src/app/ErrorBoundary.tsx` | Component / Safety | Global React error boundary preventing white-screen crashes and logging errors. | Complete |
| `src/components/animated-icon.tsx` | Component / UI | Animated vector icon wrapper with web and native platform dispatch. | Complete |
| `src/components/themed-text.tsx` | Component / UI | Standardized typography component with light/dark theme adaptation. | Complete |
| `src/components/themed-view.tsx` | Component / UI | Standardized surface component with background theme support. | Complete |
| `src/components/hint-row.tsx` | Component / UI | Contextual information hint row used in forms and dashboards. | Complete |
| `src/components/web-badge.tsx` | Component / UI | Status badge component for outbox counts and room statuses. | Complete |
| `src/components/external-link.tsx` | Component / Navigation | Secure external URL opener with in-app browser support. | Complete |
| `src/constants/theme.ts` | Design System | Color tokens, typography scales, spacing, and theme definitions. | Complete |
| `src/hooks/use-theme.ts` | Hook / Utility | React hook resolving current theme tokens based on device settings. | Complete |
| `src/hooks/use-color-scheme.ts` | Hook / Utility | Device color scheme detector. | Complete |
| `src/lib/supabase.ts` | Networking / Client | Supabase client singleton configured with `LargeSecureStore` auth storage adapter. | Complete |
| `src/lib/secure-storage.ts` | Storage / Security | `LargeSecureStore`: chunked hardware storage (1,800 bytes) with legacy AsyncStorage migration. | Complete |
| `src/lib/offline.ts` | Storage / Offline | SQLite / SQLCipher offline engine: table schemas, WAL mode, outbox worker, PBKDF2 auth. | Complete |
| `src/lib/staff-context.tsx` | State Management | Active staff React context (`activeStaff`, role, permissions, switch profile). | Complete |
| `src/lib/permissions.ts` | RBAC Utility | Role-based capability checkers (`can(activeStaff, 'check_in')`, etc.). | Complete |
| `src/lib/csv.ts` | Security / Export | CSV cell sanitizer preventing spreadsheet formula injection (`csvCell`). | Complete |
| `src/lib/photo.ts` | Hardware / Image | Photo compression, aspect ratio resizing (JPEG, max 1MB), and base64 helper. | Complete |
| `src/lib/countries.ts` | Static Data | Country list and nationality lookups for foreigner check-in. | Complete |
| `supabase/functions/purge-id-photos/index.ts` | Backend / Edge Function | Deno Edge function: finds expired photos (>6 mo), deletes storage files, sets `id_photo_path=null`. | Complete |
| `scripts/attack-tests.mjs` | Testing / Security | Section 7 Automated Attack Suite: 20 end-to-end security regression tests. | Complete |
| `0009.sql` – `0015.sql` | Database Migrations | Migrations establishing RLS, RPC lockdown, CHECK constraints, rate limits, and role guards. | Applied |

---

# 4. Feature Implementation Matrix

| Feature / User Story | Category | Associated Files | Acceptance Criteria Validation | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Property Setup & Invite Codes** | Multi-Tenancy | `setup-property.tsx`, `settings.tsx`, `0010.sql` | Owner creates property atomically; staff joins using 6-char invite code valid for 48h. Rate-limited to 5 fails / 15 min. | **Completed** |
| **Staff Profile & PIN Management** | Identity & Access | `staff-login.tsx`, `add-staff.tsx`, `0005phase5.sql` | Staff switchable on shared tablet. PINs stored as bcrypt hash in DB; 5 failed attempts trigger 5-minute online lockout. | **Completed** |
| **Offline PIN Key Stretching** | Offline Security | `src/lib/offline.ts` | PIN hashes cached locally use 100,000-round PBKDF2-HMAC-SHA256 with unique salts. 5 offline failures lock tablet for 5 min. | **Completed** |
| **Bed & Unit Matrix** | Property Ops | `home.tsx`, `room/[id].tsx`, `add-room.tsx` | Real-time occupancy grid supporting dorms and private rooms. Gender rules (`male`, `female`, `any`) enforced. | **Completed** |
| **Guest Check-In** | Operations | `checkin.tsx`, `0014.sql`, `0015.sql` | Validates ID last-4, collects payment, assigns bed atomically via RPC. Guard blocks housekeeping staff from executing check-ins. | **Completed** |
| **Foreign Tourist Form C** | Compliance | `checkin.tsx`, `form-c.tsx`, `0013.sql` | Captures passport/visa details. Form C register allows owner to mark compliance via `mark_form_c_filed`. | **Completed** |
| **Daily Shift Management** | Cash Control | `shift.tsx`, `0012.sql`, `0013.sql` | Shift open requires cash float. Enforces exactly one open shift per property via partial index. Closed via dual PIN or solo owner. | **Completed** |
| **Folio Charges & Petty Cash** | Financials | `guest/[id].tsx`, `shift.tsx`, `0013.sql` | Folio charge logging; cash collection requires open shift. Petty cash deducts from shift drawer with mandatory note. | **Completed** |
| **Payment Idempotency & Refunds** | Financials | `guest/[id].tsx`, `0007.sql`, `0009.sql` | Client UUID idempotency prevents duplicate collections. Owner-only refunds adjust stay balances and drawer atomically. | **Completed** |
| **Offline Outbox Engine** | Resilience | `src/lib/offline.ts`, `outbox.tsx` | Mutations queued in local SQLite outbox when offline; background worker syncs sequentially when connection restores. | **Completed** |
| **Automated ID Photo Purge** | Privacy / Legal | `supabase/functions/purge-id-photos/` | Photos auto-expire at 6 months; hourly cron permanently removes images from cloud storage and clears database pointers. | **Completed** |
| **CSV Anti-Injection Exports** | Compliance | `exports.tsx`, `src/lib/csv.ts` | Police Register, Form C, and Cash Book export to CSV. Values starting with `=`, `+`, `-`, `@` escaped to prevent formula execution. | **Completed** |
| **Owner Daily Digest** | Anti-Fraud | `digest.tsx`, `home.tsx` | Quick action for owners: calculates expected drawer cash, displays variances, flags refunds, and highlights unpaid stays. | **Completed** |
| **Database at Rest Encryption** | Mobile Security | `src/lib/offline.ts`, `app.json` | `logstay.db` configured for SQLCipher native encryption via hardware-backed SecureStore key injection. | **Staged (Awaiting EAS Build)** |

---

# 5. Data Flow, State Management & API Integration

### 5.1 Client State & Persistence Layers
1. **Hardware-Backed Session Store (`LargeSecureStore`):**
   * Manages Supabase JWTs, refresh tokens, and user credentials.
   * Chunks payloads into 1,800-byte segments stored in Android Keystore / iOS Keychain.
   * Features transparent migration from legacy AsyncStorage.
2. **Operational Staff Context (`StaffContext`):**
   * Holds the current active staff member operating the shared property tablet.
   * Persists active staff selection and roles (`owner`, `desk`, `housekeeping`) in SecureStore.
3. **Local Relational Replica (SQLite / SQLCipher):**
   * Replicates active rooms, units, stays, guests, and staff profiles for zero-latency UI rendering.
   * Maintains persistent `outbox` mutation records.
4. **Remote Cloud State (Supabase / PostgreSQL):**
   * Single source of truth. All updates broadcast through PostgreSQL tables protected by RLS.

```
[UI Screen / Form]
       │
       ▼
[Is Device Online?]
   ├──► YES ──► Supabase RPC Call ──► PostgreSQL DB (Commit) ──► Update Local Cache
   │
   └──► NO  ──► Generate UUID ──► Insert into local 'outbox' ──► Update Local Cache
                                                                        │
                                   [Connection Restored] ◄──────────────┘
                                            │
                                            ▼
                               [Flush Outbox in Sequence]
                                            │
                                            ▼
                               [Execute RPC on Supabase]
```

---

# 6. Comprehensive Database Architecture & Schema Structure

The LogStay backend utilizes PostgreSQL 15.8 with strict relational integrity, check constraints, Row Level Security, and zero-privilege public access.

## 6.1 PostgreSQL Schema (Supabase)

```
                       +---------------------------------------+
                       |              properties               |
                       | id (PK), name, type, state, paid_until|
                       +---------------------------------------+
                           │                 │               │
            ┌──────────────┘                 │               └──────────────┐
            ▼                                ▼                              ▼
   +-----------------+             +-------------------+             +---------------+
   |     members     |             |       rooms       |             | staff_profiles|
   | user_id, role   |             | label, kind, floor|             | name, pin_hash|
   +-----------------+             +-------------------+             +---------------+
                                             │                              │
                                             ▼                              │
                                   +-------------------+                    │
                                   |       units       |                    │
                                   | room_id, status   |                    │
                                   +-------------------+                    │
                                             │                              │
                                             ▼                              │
                                   +-------------------+                    │
                                   |       stays       |                    │
                                   | unit_id, guest_id |                    │
                                   +-------------------+                    │
                                     │       │       │                      │
                   ┌─────────────────┘       │       └────────────────┐     │
                   ▼                         ▼                        ▼     ▼
         +-------------------+     +-------------------+     +------------------+
         |      charges      |     |     payments      |     |      shifts      |
         | stay_id, amount   |     | stay_id, amount   |     | float, counted   |
         +-------------------+     +-------------------+     +------------------+
                                                                      │
                                                                      ▼
                                                             +------------------+
                                                             |   cash_entries   |
                                                             | shift_id, kind   |
                                                             +------------------+
```

### 1. `properties`
* **Purpose:** Core multi-tenant boundary representing each physical property / hostel.
* **Columns:**
  * `id` (`uuid`, PRIMARY KEY, `gen_random_uuid()`)
  * `name` (`text`, NOT NULL)
  * `type` (`text`, NOT NULL, default `'hostel'`)
  * `state` (`text`, NOT NULL, default `'Goa'`)
  * `owner_id` (`uuid`, REFERENCES `auth.users(id)`)
  * `paid_until` (`date`, default `now() + interval '30 days'`)
  * `created_at` (`timestamptz`, default `now()`)
* **RLS Policies:** `SELECT` allowed if `is_member(id)` or `owner_id = auth.uid()`. `INSERT` allowed for authenticated users where `owner_id = auth.uid()`. Direct `UPDATE` restricted to `(name, type, state)`.

### 2. `members`
* **Purpose:** Maps authenticated Supabase accounts (`auth.users`) to properties.
* **Columns:**
  * `id` (`uuid`, PRIMARY KEY, `gen_random_uuid()`)
  * `property_id` (`uuid`, REFERENCES `properties(id)` ON DELETE CASCADE)
  * `user_id` (`uuid`, REFERENCES `auth.users(id)` ON DELETE CASCADE)
  * `role` (`text`, NOT NULL, CHECK in `'owner'`, `'staff'`)
  * `created_at` (`timestamptz`, default `now()`)
* **RLS Policies:** `SELECT` allowed if `is_member(property_id)`. Direct writes locked; joined via `join_property()` RPC or initial bootstrap insert.

### 3. `staff_profiles` & `staff_profiles_safe` (View)
* **Purpose:** Tablet staff identities operating within a property.
* **Columns:**
  * `id` (`uuid`, PRIMARY KEY, `gen_random_uuid()`)
  * `property_id` (`uuid`, REFERENCES `properties(id)` ON DELETE CASCADE)
  * `name` (`text`, NOT NULL)
  * `phone` (`text`, NOT NULL)
  * `role` (`text`, NOT NULL, CHECK in `'owner'`, `'desk'`, `'housekeeping'`)
  * `pin_hash` (`text`, NOT NULL) — *Bcrypt hash, protected from SELECT*
  * `active` (`boolean`, default `true`)
  * `failed_tries` (`int`, default `0`)
  * `locked_until` (`timestamptz`)
  * `joined_on` (`timestamptz`, default `now()`)
* **Security View:** `staff_profiles_safe` created `WITH (security_invoker = true)` exposes non-sensitive columns (`id`, `property_id`, `name`, `phone`, `role`, `active`, `joined_on`), strictly hiding `pin_hash` from client inspection.

### 4. `rooms` & `units`
* **Purpose:** Physical room and bed inventory hierarchy.
* **`rooms` Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `label` (`text`), `kind` (`text`, CHECK in `'dorm'`, `'private'`), `floor` (`text`).
* **`units` Columns:** `id` (`uuid`, PK), `room_id` (`uuid`, REFERENCES `rooms(id)` ON DELETE CASCADE), `label` (`text`), `gender_rule` (`text`, CHECK in `'any'`, `'male'`, `'female'`), `housekeeping_status` (`text`, CHECK in `'clean'`, `'dirty'`, `'maintenance'`), `last_cleaned_at` (`timestamptz`), `last_cleaned_by` (`uuid`).

### 5. `guests` & `foreign_details`
* **Purpose:** Guest identification, PII storage, and regulatory compliance.
* **`guests` Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `name` (`text`), `phone` (`text`), `nationality` (`text`), `gender` (`text`), `id_type` (`text`), `id_last4` (`text`), `id_photo_path` (`text`), `id_photo_expires_at` (`timestamptz`, default `now() + interval '6 months'`), `id_deleted_at` (`timestamptz`).
* **`foreign_details` Columns:** `id` (`uuid`, PK), `stay_id` (`uuid`, REFERENCES `stays(id)` ON DELETE CASCADE), `passport_no` (`text`), `visa_no` (`text`), `visa_type` (`text`), `arrived_from` (`text`), `next_dest` (`text`), `form_c_filed` (`boolean`, default `false`).

### 6. `stays`
* **Purpose:** Guest stay folios mapping a guest to a bed.
* **Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `unit_id` (`uuid`), `guest_id` (`uuid`), `check_in` (`timestamptz`), `check_out` (`timestamptz`), `status` (`text`, CHECK in `'checked_in'`, `'checked_out'`), `base_rate` (`numeric`), `paid_amount` (`numeric`, default `0`).
* **Constraints & Indexes:**
  * `chk_stays_amount`: `CHECK (paid_amount >= 0 AND paid_amount <= 200000)`
  * `one_active_stay_per_unit`: `CREATE UNIQUE INDEX ON stays(unit_id) WHERE status = 'checked_in';`

### 7. `shifts` & `cash_entries`
* **Purpose:** Cash drawer accounting and dual-custody verification.
* **`shifts` Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `opened_by` (`uuid`), `opened_at` (`timestamptz`), `closed_by` (`uuid`), `closed_at` (`timestamptz`), `opening_cash` (`numeric`), `counted_cash` (`numeric`), `status` (`text`, CHECK in `'open'`, `'closed'`), `co_signed` (`boolean`, default `false`).
* **`cash_entries` Columns:** `id` (`uuid`, PK), `shift_id` (`uuid`, REFERENCES `shifts(id)`), `kind` (`text`, CHECK in `'opening'`, `'collection'`, `'petty'`, `'refund'`), `amount` (`numeric`, CHECK `> 0 AND <= 200000`), `note` (`text`), `staff_id` (`uuid`).
* **Indexes:** `one_open_shift_per_property`: `CREATE UNIQUE INDEX ON shifts(property_id) WHERE status = 'open';`

### 8. `charges` & `payments`
* **Purpose:** Folio financial line items and collection idempotency.
* **`charges` Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `stay_id` (`uuid`), `item` (`text`), `qty` (`int`, CHECK `>= 1 AND <= 50`), `unit_price` (`numeric`, CHECK `>= 0 AND <= 50000`), `paid` (`boolean`), `pay_mode` (`text`), `staff_id` (`uuid`).
* **`payments` Columns:** `id` (`uuid`, PK), `property_id` (`uuid`), `stay_id` (`uuid`), `amount` (`numeric`, CHECK `> 0 AND <= 200000`), `pay_mode` (`text`, CHECK in `'cash'`, `'upi'`), `shift_id` (`uuid`), `staff_id` (`uuid`), `refunded` (`boolean`, default `false`).

### 9. Supporting Tables
* **`property_invites`:** Invite tokens (`code`, `expires_at`, `created_by`).
* **`housekeeping_log`:** Audit record of bed cleans and status changes.
* **`issues`:** Maintenance issues categorized by room/stay (`ac`, `water`, `noise`, `cleanliness`, `electrical`, `other`).
* **`staff_attendance`:** Clock-in / clock-out logging.
* **`audit_log`:** Append-only compliance log (`action`, `user_id`, `record_id`, `staff_id`, `created_at`). `UPDATE` and `DELETE` permanently revoked.

---

## 6.2 PostgreSQL Stored Procedures (RPC Catalog)

All operations run as `SECURITY DEFINER SET search_path = public, extensions`:

| Function Name | Signature | Role Guard / Privilege |
| :--- | :--- | :--- |
| `check_in_guest` | `(p_stay_id, p_guest_id, p_property_id, p_name, p_phone, p_nationality, p_gender, p_id_type, p_id_last4, p_id_photo_path, p_unit_id, p_amount, p_pay_mode, p_is_foreign, p_passport_no, p_visa_no, p_visa_type, p_arrived_from, p_next_dest, p_staff_id)` | Enforces `require_role(ARRAY['owner', 'desk'])`. Blocks housekeeping. |
| `check_out_guest` | `(p_stay_id, p_staff_id)` | Requires property membership; marks stay `checked_out` and bed `dirty`. |
| `open_shift` | `(p_shift_id, p_opening_cash, p_staff_id)` | Enforces atomic shift open; blocked if another shift is open for property. |
| `close_shift_secure`| `(p_shift_id, p_counted_cash, p_staff_id, p_cosign_pin)` | Dual-custody co-sign check; allows solo close only for owner profile. |
| `record_payment` | `(p_payment_id, p_stay_id, p_amount, p_pay_mode, p_staff_id)` | Idempotent on `p_payment_id`. Links cash to active shift; increments stay paid amount. |
| `refund_payment` | `(p_payment_id, p_staff_id, p_reason)` | Strictly gated by `require_role(ARRAY['owner'])`. Deducts cash from active shift. |
| `add_petty_cash` | `(p_entry_id, p_shift_id, p_amount, p_note, p_staff_id)` | Idempotent on `p_entry_id`. Writes petty cash entry to active shift. |
| `add_stay_charge` | `(p_charge_id, p_stay_id, p_item, p_qty, p_unit_price, p_paid, p_pay_mode, p_staff_id)` | Validates quantity (1–50) and price (0–50k). Records folio line item. |
| `join_property` | `(p_code)` | Rate-limited to 5 failures per 15 minutes; joins authenticated user to property. |
| `owner_add_staff` | `(p_prop, p_actor, p_name, p_phone, p_role, p_pin)` | Restricted to owner; hashes PIN via `crypt()` and generates profile. |
| `reset_staff_pin` | `(p_prop, p_actor, p_target, p_new_pin)` | Restricted to owner; updates PIN hash and clears failed tries. |
| `staff_login` | `(p_staff, p_pin)` | Verifies PIN; increments failed tries and locks profile for 5 min after 5 fails. |
| `mark_unit_clean` | `(p_unit_id, p_staff_id)` | Requires owner, desk, or housekeeping role; marks unit clean and logs timestamp. |
| `mark_form_c_filed`| `(p_stay_id, p_staff_id)` | Updates `foreign_details.form_c_filed = true` and writes audit trail. |
| `report_issue` | `(p_issue_id, p_unit_id, p_stay_id, p_category, p_note, p_staff_id)` | Idempotent maintenance issue logger. |
| `set_unit_maintenance`| `(p_unit_id, p_staff_id)` | Sets unit housekeeping status to maintenance. |

---

## 6.3 Local SQLite / SQLCipher Database Schema (`logstay.db`)

* **Journal Mode:** `WAL` (Write-Ahead Logging).
* **Encryption Pragma:** `PRAGMA key = "x'<hex_key>'";` injected immediately after database open.
* **Local Tables:**
  * `outbox`: `(id TEXT PRIMARY KEY, entity TEXT, type TEXT, payload TEXT, created_at INT, status TEXT, attempts INT, last_error TEXT)`
  * `cache_rooms`: `(id TEXT PRIMARY KEY, property_id TEXT, label TEXT, kind TEXT)`
  * `cache_units`: `(id TEXT PRIMARY KEY, room_id TEXT, label TEXT, gender_rule TEXT, housekeeping_status TEXT)`
  * `cache_stays`: `(id TEXT PRIMARY KEY, property_id TEXT, unit_id TEXT, guest_name TEXT, status TEXT)`
  * `cache_guests`: `(id TEXT PRIMARY KEY, name TEXT, phone TEXT, nationality TEXT)`
  * `cache_staff`: `(id TEXT PRIMARY KEY, name TEXT, role TEXT, active INT, pin_hash_local TEXT, salt TEXT, local_failed_tries INT, local_locked_until INT)`

---

# 7. Knowledge Graph & System Topology (Graphify Extraction)

Analysis generated via Graphify (AST + Semantic analysis: 381 nodes, 738 edges, 34 detected community clusters).

### 7.1 God Nodes (Core Architectural Hubs)
The graph identifies the primary abstraction hubs that bind the system together:
1. `react-native` (35 edges) — Platform UI primitive bridge.
2. `react` (29 edges) — Component lifecycle and state container.
3. `isOnline()` (27 edges) — Network partition selector; branches every operation into immediate RPC vs outbox queue.
4. `useStaff()` (21 edges) — RBAC context provider informing UI authorization.
5. `expo-router` (21 edges) — Navigation mesh across all screens and layouts.
6. `supabase` (20 edges) — Network client providing PostgREST and Auth calls.
7. `HomeScreen()` (18 edges) — Central operations hub aggregating room grid, outbox counter, and shift drawer state.
8. `saveToOutbox()` (18 edges) — Offline mutation queueing primitive.
9. `CheckInScreen()` (14 edges) — Primary revenue and guest intake pipeline.

### 7.2 Key Architectural Clusters
* **Offline Resilience Hub (Community 0 / 6):** Centers around `isOnline()`, `saveToOutbox()`, and `logstay.db` cache tables.
* **Identity & Access Mesh (Community 7):** Connects `StaffContext`, `can()`, `staff-login.tsx`, and `digest.tsx`.
* **Security & Attack Harness (Community 8):** Bridges `attack-tests.mjs` against remote RPC definitions and role guards.

---

# 8. Technical Debt, Blockers & Known Issues

1. **SQLCipher Native Binary Activation:**
   * *Status:* Code-complete and staged in `app.json` and `offline.ts`.
   * *Detail:* SQLCipher is a native module that requires the compiled binary produced by EAS Build. In standard Expo Go, the PRAGMA key executes as a no-op against standard SQLite. Physical validation of the app-folder copy encryption test is queued for the preview APK.
2. **Database Password Rotation (Operational Blocker):**
   * *Status:* Pending manual action in Supabase Dashboard.
   * *Detail:* The initial database superuser password exists in historical CLI logs. Must be rotated via Dashboard → Settings → Database → Reset Password before pilot users onboard.
3. **Legal Decisions (Non-Code Policy Gates):**
   * *Aadhaar Masking:* Formal confirmation required on whether pilot properties store only the last 4 digits (currently implemented) or require on-device photo masking overlays.
   * *Data Retention Period:* Current 6-month automated photo purge period must be ratified in the pilot Terms of Service.
4. **Dev Device Local Storage Reset:**
   * *Detail:* Test devices running previous unencrypted dev builds will encounter an SQLite error upon running the SQLCipher binary ("file is not a database"). Developers and testers must clear app storage before installing the preview APK.

---

# 9. Immediate Next Steps (Roadmap to Pilot Launch)

```
[Now: Agent Work Done] ──► [Step 1: User Device Pass] ──► [Step 2: Password Rotation]
                                       │
                                       ▼
                       [Step 3: EAS Preview APK Build]
                                       │
                                       ▼
                       [Step 4: 3GB Hardware Test Lab]
                        - 10-Check-in Airplane Run
                        - App Folder Copy Check
                        - Date Grace Test
                                       │
                                       ▼
                       [Step 5: Closed Pilot Launch]
                        (2-3 Properties in Goa)
```

### Phase 1: Consolidated Device Testing Session (User Physical Pass)
* **Owner Daily Digest:** Log in as desk staff → verify Digest quick action is hidden. Switch to owner → open Digest → confirm cash reconciliation against active shift `9621e74e`.
* **Solo Owner Close:** Close open shift `9621e74e` with counted cash ₹5,000 and empty PIN → verify `"Shift closed by owner."` and check `co_signed: false` in SQL.
* **Billing Lifecycle:** Folio charge ₹20 → refund → checkout → mark bed clean.
* **Foreign Guest & Form C:** Check in foreign guest → verify appearance on Form C screen → tap "Mark as Filed".
* **Airplane Mode Re-Run:** Airplane ON → open shift → cash check-in with ID photo → add charge → close shift → Airplane OFF → confirm zero duplicates and temp photo deletion.
* **CSV Injection Verification:** Check in guest `=1+1` → export Police Register → verify display as plain string.
* **Offline Lockout:** Airplane ON → enter wrong PIN 6 times → verify 5-minute lockout.

### Phase 2: EAS Build & Artifact Packaging
* Run `npx eas login` and `npx eas init`.
* Trigger preview build:
  ```powershell
  npx eas build -p android --profile preview
  ```
* Generates the standalone encrypted Android APK (`.apk`) containing native SQLCipher, R8 minification, and `allowBackup: false`.

### Phase 3: Hardware Field Test Lab
* Install preview APK on a 3GB RAM low-end Android test device.
* Execute the formal 10-check-in offline stress test.
* Extract device app data directory via ADB to confirm `logstay.db` is unreadable ciphertext.
* Advance device clock by +30 days to confirm subscription grace period enforcement.

### Phase 4: Pilot Deployment
* Finalize legal text in `privacy.tsx`.
* Upgrade Supabase project to Pro Tier (enables daily automated point-in-time recovery and dedicated compute).
* Onboard 2–3 pilot hostel properties in Goa.

---

*Report finalized and committed to repository history under revision `f60162b`.*
