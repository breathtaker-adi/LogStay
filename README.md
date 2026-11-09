# LogStay Mobile 🏨

> High-reliability, offline-first mobile Property Management System (PMS) and front-desk operating platform tailored for boutique hotels, hostels, and guest houses.

Built with **Expo SDK 58**, **React Native 0.88**, **TypeScript**, and **Supabase PostgreSQL**. Designed for instant responsiveness, offline resilience, and statutory compliance (Form C international guest reporting, DPDP Act ID photo purge, and RBI-aligned UPI payment reconciliation).

---

## 📑 Table of Contents

- [Architectural Overview](#architectural-overview)
- [Key Features](#key-features)
- [System Architecture & Folder Structure](#system-architecture--folder-structure)
- [Security & Role-Based Access Control (RBAC)](#security--role-based-access-control-rbac)
- [Database Schema & Migrations](#database-schema--migrations)
- [Environment Configuration](#environment-configuration)
- [Getting Started](#getting-started)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [CI/CD Pipeline](#cicd-pipeline)
- [Database Truncation & Factory Reset](#database-truncation--factory-reset)

---

## 🏛 Architectural Overview

LogStay Mobile follows a **Layered Domain-Driven Architecture** separating UI view components, presentation hooks, business domain services, and offline storage:

```
┌────────────────────────────────────────────────────────┐
│                   Expo Router Views                    │
│   (src/app/home.tsx, checkin.tsx, concierge.tsx, etc.)  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                 Domain Service Layer                   │
│   (AuthService, StayService, HousekeepingService, etc)  │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
┌─────────────▼──────────────┐ ┌───────────▼─────────────┐
│    Offline SQLite Outbox   │ │   Supabase Remote RPC   │
│   (src/lib/offline.ts)     │ │   & PostgreSQL Database │
└────────────────────────────┘ └─────────────────────────┘
```

1. **Presentation Layer (`src/app/` & `src/components/`)**:
   - File-based routing powered by **Expo Router 58**.
   - Custom Glassmorphism design system supporting light/dark adaptive theming.
   - Fluid bottom sheets, stay duration calendars, and floor-grouped bed selectors.

2. **Domain Service Layer (`src/services/`)**:
   - `StayService`: Check-in, check-out, multi-day extensions, bed moves, folio settlements.
   - `HousekeepingService`: Unit cleaning cycles, maintenance locks, incident reporting.
   - `ApprovalService`: Dual-control approval workflows for staff invitations and concierge changes.
   - `ShiftService`: Cash drawer open/close, petty cash additions, co-signed handovers.
   - `PropertyService`: Property settings, branding, dynamic UPI barcode configuration.
   - `AuditService`: DPDP Act immutable operational audit ledger and photo access tracking.
   - `RoomService`: Multi-floor room/dorm provisioning and bed matrix configuration.

3. **Offline Engine & Outbox Queue (`src/lib/offline.ts`)**:
   - Local SQLite database caches rooms, beds, stays, and staff profiles.
   - Offline actions are enqueued into an SQLite outbox with exponential backoff synchronization when network connectivity restores.

4. **Security & RLS Layer (`supabase/migrations/`)**:
   - Strict PostgreSQL Row Level Security (RLS) on all tables.
   - `SECURITY DEFINER` stored procedures enforce tenant isolation (`property_id` scoping) and role guards.

---

## 🚀 Key Features

- **Multi-Floor Room & Bed Matrix**:
  - Dynamically switches between floor groupings (Sub-basement `-2` to 60th Floor) and direct room grids.
  - Interactive bed state machine: `vacant_clean`, `vacant_dirty`, `occupied`, `maintenance`.
  - Supports both private room bookings and shared dorm allocations.

- **Check-in with MRZ Scanner & Form C Compliance**:
  - Optical Machine Readable Zone (MRZ) parser for international passports.
  - Generates official BoI Form C export packets with automated statutory fields.
  - Encrypted ID photo storage with automated 90-day DPDP Act auto-purge cron functions.

- **Dynamic Stay Duration & Calendar Settlement**:
  - `StayCalendarModal` allows flexible duration selection with visual checkout date/time configuration.
  - Precision Indian Rupee (`₹`) integer paise/floating math preventing currency rounding drift.
  - Multi-night stay extensions and atomic bed relocation RPCs.

- **Dual-Control Approval System**:
  - **Desk Staff Approval**: Desk attendants can request onboarding; Owner/Co-Admin must review and approve.
  - **Concierge Approval**: Desk staff edits to property concierge details require Owner/Co-Admin review before public display.

- **UPI Barcode & Bank Reconciliation**:
  - Property Owners can upload/set direct UPI IDs or QR barcodes in Settings.
  - Front-desk displays dynamic UPI QR code on check-in folio.
  - Owners and Co-Admins verify UPI payments directly in the UPI Reconciliation queue.

- **Shift Management & Dual Cash Handover**:
  - Cash drawer opening, collection tracking, and petty cash vouchers.
  - Shift closing requires incoming & outgoing staff co-signing with rate-limited credential checks.

---

## 📂 System Architecture & Folder Structure

```
LogStay-Mobile/
├── .github/
│   └── workflows/
│       └── ci.yml                     # Continuous Integration workflow (Lint, Types, Unit Tests)
├── assets/                            # Static app branding, logos, and fonts
├── scripts/
│   ├── attack-tests.mjs               # Security adversarial penetration tests
│   ├── fault-injection-tests.mjs      # Network timeout & SQLite corruption fault tests
│   ├── truncate_test_data.sql         # Database operational wipe & reset scripts
│   └── test-*.mjs                     # Isolated standalone regression scripts
├── src/
│   ├── app/                           # Expo Router Screen Controllers
│   │   ├── _layout.tsx                # App root layout, theme & safe-area providers
│   │   ├── index.tsx                  # Splash & authentication redirect guard
│   │   ├── home.tsx                   # Main dashboard (occupancy, quick actions, due out)
│   │   ├── checkin.tsx                # Guest registration & MRZ scan flow
│   │   ├── rooms.tsx                  # Multi-floor room & bed matrix
│   │   ├── dorm/[roomId].tsx          # Dormitory bed management screen
│   │   ├── approvals.tsx              # Co-Admin / Owner approval request inbox
│   │   ├── upi-reconciliation.tsx     # UPI payment verification dashboard
│   │   ├── shift.tsx                  # Cash drawer & handover co-signing
│   │   ├── settings.tsx               # Property configuration & UPI setup
│   │   └── concierge.tsx              # Property recommendations & details
│   ├── components/                    # Modular Reusable UI Components
│   │   ├── stay-calendar-modal.tsx    # Stay checkout calendar modal
│   │   ├── floor-selector-modal.tsx   # Floor selection sheet
│   │   └── ui/                        # Buttons, inputs, modal dialogs, status badges
│   ├── config/
│   │   ├── env.ts                     # Environment config abstraction
│   │   └── env.test.ts                # Environment sanitization test suite
│   ├── hooks/                         # React custom state hooks (useTheme, useProperty)
│   ├── lib/                           # Core utilities & engines
│   │   ├── bed-state.ts               # Bed lifecycle state engine
│   │   ├── countries.ts               # ISO-3166 nationality dictionary
│   │   ├── error-utils.ts             # Human-friendly error parsing
│   │   ├── floors.ts                  # Multi-floor grouping & string parsing
│   │   ├── money.ts                   # INR currency & folio balance calculation
│   │   ├── mrz.ts                     # ICAO 9303 Type 3 Passport MRZ parser
│   │   ├── offline.ts                 # SQLite cache & outbox synchronization queue
│   │   ├── permissions.ts             # RBAC role capability matrix
│   │   └── supabase.ts                # Supabase client with LargeSecureStore session
│   └── services/                      # Domain Business Logic Services
│       ├── approval.service.ts        # Staff & concierge approval operations
│       ├── audit.service.ts           # Statutory inspection & photo access logging
│       ├── auth.service.ts            # Member profile, login & PIN recovery
│       ├── housekeeping.service.ts    # Room cleaning & maintenance status
│       ├── property.service.ts        # Property metadata & UPI QR storage
│       ├── room.service.ts            # Rooms & units management
│       ├── shift.service.ts           # Cash drawer & handover co-signing
│       ├── stay.service.ts            # Stays, check-in, extensions & UPI verify
│       └── team.service.ts            # Staff management & peer remarks ledger
├── supabase/
│   ├── functions/
│   │   └── purge-id-photos/           # Scheduled Edge Function for DPDP Act auto-purge
│   ├── migrations/                    # Canonical sequential SQL migrations (000001 - 000012)
│   └── truncate_all_data.sql          # SQL Editor database clean & truncate script
├── .env.example                       # Template for environment configuration
├── app.json                           # Expo application manifest
├── package.json                       # Dependencies & npm scripts
├── tsconfig.json                      # Strict TypeScript compiler options
└── vitest.config.mjs                  # Vitest runner configuration
```

---

## 🔒 Security & Role-Based Access Control (RBAC)

LogStay uses a strict 4-tier hierarchical permission model:

| Permission | Owner | Co-Admin | Desk | Housekeeping |
| :--- | :---: | :---: | :---: | :---: |
| Check-in / Check-out Guests | ✅ | ✅ | ✅ | ❌ |
| Manage Cash Drawer & Shifts | ✅ | ✅ | ✅ | ❌ |
| Set / Edit UPI Barcode | ✅ | ❌ | ❌ | ❌ |
| Approve Desk Staff Requests | ✅ | ✅ | ❌ | ❌ |
| Direct Concierge Edits | ✅ | ✅ | Propose | ❌ |
| Verify Bank UPI Payments | ✅ | ✅ | ❌ | ❌ |
| Reassign / Move Beds | ✅ | ✅ | ✅ | ❌ |
| Update Housekeeping Status | ✅ | ✅ | ✅ | ✅ |
| Access ID Documents (DPDP) | ✅ | ✅ | Audit-Logged | ❌ |

---

## 🗄 Database Schema & Migrations

All database structures and procedures are defined in `supabase/migrations/`:

- `20261015000001_initial_schema.sql`: Base tables (`properties`, `members`, `rooms`, `units`, `guests`, `stays`, `shifts`, `cash_entries`, `charges`, `payments`, `audit_log`, `housekeeping_log`, `issues`).
- `20261015000003_floors_and_rooms.sql`: Integer `floor_no` indexing (`-2` to `60`) and room management RPCs.
- `20261015000004_pin_recovery_and_stepup.sql`: Owner recovery flow and step-up auth.
- `20261015000005_desk_add_staff_and_approval.sql`: Dual-control staff onboarding queue (`desk_staff_requests`).
- `20261015000006_property_branding_and_photo_approval.sql`: Property logo, banner, and photo approval ledger.
- `20261015000007_property_concierge_fields.sql`: Curated local places, emergency contacts, WiFi info.
- `20261015000008_remove_pins_and_hierarchical_invites.sql`: Cryptographic invite codes and role-scoped permissions.
- `20261015000009_staff_remarks_and_complete_team.sql`: Immutable cross-property staff remarks ledger.
- `20261015000010_room_description_and_remarks.sql`: Room descriptions and bed-level housekeeping remarks.
- `20261015000011_upi_and_concierge_approval.sql`: Owner UPI barcode storage and concierge change request table.
- `20261015000012_security_hardening_and_handover.sql`: Dual-staff cash handover verification and RLS hardening.

---

## ⚙️ Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Populate the required environment variables:
   ```ini
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-jwt-token>
   ```

> [!IMPORTANT]
> Never commit `.env` or sensitive service-role keys to version control. The repository `.gitignore` automatically blocks `.env` and all credential patterns.

---

## 🚦 Getting Started

### Prerequisites
- Node.js 20.x or 22.x
- npm or bun

### Installation
```bash
# Clone the repository
git clone https://github.com/breathtaker-adi/LogStay-Mobile.git
cd LogStay-Mobile

# Install SDK-compatible dependencies
npm install
```

### Running the App
```bash
# Start the Expo development server
npx expo start

# Open on Android Emulator / Physical Device
npx expo start --android

# Open on iOS Simulator
npx expo start --ios
```

---

## 🧪 Testing & Quality Assurance

LogStay maintains a 100% automated test suite with **525+ tests across 35 test suites**:

```bash
# Run all Vitest unit and regression tests
npm run test:unit

# Run full quality check (Unit tests + integration scripts)
npm test

# Run TypeScript typecheck
npx tsc --noEmit

# Run ESLint
npm run lint

# Run Expo Doctor dependency health check
npx expo-doctor
```

---

## 🔄 CI/CD Pipeline

The project includes an automated GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that validates every pull request and push to `master`:
1. Installs clean dependencies via `npm ci`.
2. Runs static type checking (`npx tsc --noEmit`).
3. Runs ESLint code quality checks.
4. Executes the full Vitest unit test suite.

---

## 🧹 Database Truncation & Factory Reset

Before deploying to production or cleaning test data, run the scripts in `supabase/truncate_all_data.sql` inside your **Supabase Dashboard -> SQL Editor**:

- **Option 1: Operational Test Data Only (Recommended)**: Clears all test guests, stays, cash entries, shifts, issues, and requests while preserving properties, rooms, beds, and staff profiles.
- **Option 2: Full Factory Reset**: Completely wipes all tables down to a pristine state.
