<p align="center">
  <a href="https://breathtaker-adi.github.io/LogStay/" target="_blank">
    <img src="assets/images/logo.png" alt="LogStay Official Logo" width="120" height="120" style="border-radius: 28px; box-shadow: 0 12px 35px rgba(0, 102, 255, 0.25);" />
  </a>
</p>

<h1 align="center">LogStay Mobile </h1>

<p align="center">
  <b>The High-Reliability, Offline-First Hospitality OS for Independent Hotels, Hostels & Boutiques</b>
</p>

<p align="center">
  Built with <b>Expo SDK 58</b>, <b>React Native 0.88</b>, <b>TypeScript</b>, and <b>Supabase PostgreSQL</b>.<br />
  Engineered for instant front-desk responsiveness, full offline survivability, strict multi-tenant isolation, and statutory compliance (BoI Form C international guest registration, DPDP Act automated ID photo purging, and RBI-aligned UPI payment reconciliation).
</p>

<p align="center">
  <a href="https://breathtaker-adi.github.io/LogStay/" target="_blank">
    <img src="https://img.shields.io/badge/Website-Live%20Demo-0066FF?style=for-the-badge&logo=githubpages&logoColor=white" alt="Live Website" />
  </a>
  <img src="https://img.shields.io/badge/Expo-SDK_58-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo SDK 58" />
  <img src="https://img.shields.io/badge/React_Native-0.88-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native 0.88" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase PostgreSQL" />
  <img src="https://img.shields.io/badge/Offline--First-SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite Outbox" />
  <img src="https://img.shields.io/badge/Tests-551%20Passed-4c1?style=for-the-badge&logo=vitest&logoColor=white" alt="551 Passing Tests" />
</p>

<p align="center">
  <a href="CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/Contributions-Welcome-brightgreen?style=flat-square" alt="Contributions Welcome" />
  </a>
  <a href="CODE_OF_CONDUCT.md">
    <img src="https://img.shields.io/badge/Contributor%20Covenant-v2.1-blue.svg?style=flat-square" alt="Contributor Covenant" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT" />
  </a>
  <img src="https://img.shields.io/badge/Compliance-DPDP%20Act%20Ready-blueviolet?style=flat-square" alt="DPDP Act Ready" />
</p>

---

## 🎬 Product Showcase & Video Walkthrough

Watch LogStay in action — from optical passport check-in to real-time room occupancy management:

<div align="center">
  <video src="https://github.com/breathtaker-adi/LogStay/raw/master/assets/media/logstay-showcase.mp4" controls="controls" width="100%" poster="https://github.com/breathtaker-adi/LogStay/raw/master/assets/media/logstay-poster.jpg">
    <source src="assets/media/logstay-showcase.mp4" type="video/mp4">
    Your browser does not support embedded HTML5 video playback.
  </video>

  <p align="center">
    <a href="https://github.com/breathtaker-adi/LogStay/raw/master/assets/media/logstay-showcase.mp4" title="Click to watch full 1080p feature walkthrough">
      <img src="assets/media/logstay-preview.gif" alt="LogStay Mobile App Interactive Showcase" width="100%" style="border-radius: 12px; border: 1px solid rgba(0, 102, 255, 0.2); box-shadow: 0 8px 30px rgba(0,0,0,0.25);" />
    </a>
    <br />
    <sub><em>💡 <b>Click preview above</b> or use the HTML5 controls to stream the full 60-second 1080p showcase.</em></sub>
  </p>

  <p align="center">
    <a href="https://breathtaker-adi.github.io/LogStay/" target="_blank">
      <b>🌐 Visit Official Website & Interactive Web Demo</b>
    </a>
    &nbsp;&bull;&nbsp;
    <a href="https://github.com/breathtaker-adi/LogStay/raw/master/assets/media/logstay-showcase.mp4">
      <b>📥 Download Full 1080p MP4 (4.8 MB)</b>
    </a>
    &nbsp;&bull;&nbsp;
    <a href="Docs/LogStay_Product_Overview_and_Specification_Document.md">
      <b>📖 Full Product Specification</b>
    </a>
  </p>
</div>

---

## 📑 Table of Contents

- [Product Showcase & Video Walkthrough](#-product-showcase--video-walkthrough)
- [Architectural Overview](#-architectural-overview)
- [Key Features & Operational Invariants](#-key-features--operational-invariants)
- [System Architecture & Folder Structure](#-system-architecture--folder-structure)
- [Security & Role-Based Access Control (RBAC)](#-security--role-based-access-control-rbac)
- [Database Schema & Migrations](#-database-schema--migrations)
- [Environment Configuration](#️-environment-configuration)
- [Getting Started](#-getting-started)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Continuous Integration (CI/CD)](#-continuous-integration-cicd)
- [Database Truncation & Factory Reset](#-database-truncation--factory-reset)
- [Contributing Guidelines](#-contributing-guidelines)
- [Code of Conduct](#-code-of-conduct)
- [Built for Independent Hospitality](#-built-for-independent-hospitality)

---

## 🏛 Architectural Overview

LogStay Mobile is architected around a **Domain-Driven, Offline-First Reactive Hierarchy** that separates presentation controllers, business domain services, and local SQLite caching from cloud storage:

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
   - File-based route controllers powered by **Expo Router 58**.
   - Adaptive Glassmorphic design tokens supporting clean light and dark environments.
   - Interactive bottom sheets, stay duration calendars, and floor-grouped bed selectors.

2. **Domain Service Layer (`src/services/`)**:
   - `StayService`: Check-in, check-out, multi-night extensions, bed swaps, folio settlements.
   - `HousekeepingService`: Unit cleaning state machine, maintenance locks, incident reporting.
   - `ApprovalService`: Dual-control approval workflows for staff invitations and concierge changes.
   - `ShiftService`: Cash drawer open/close, petty cash additions, co-signed handovers.
   - `PropertyService`: Property settings, branding, dynamic UPI barcode configuration.
   - `AuditService`: DPDP Act immutable operational audit ledger and photo access tracking.
   - `RoomService`: Multi-floor room/dorm provisioning and bed matrix configuration.

3. **Offline Engine & Outbox Queue (`src/lib/offline.ts`)**:
   - Local SQLite database caches rooms, beds, stays, and staff profiles.
   - Mutations are enqueued into an SQLite outbox with exponential backoff synchronization when network connectivity restores.

4. **Security & RLS Layer (`supabase/migrations/`)**:
   - Strict PostgreSQL Row Level Security (RLS) on all tables.
   - `SECURITY DEFINER` stored procedures enforce tenant isolation (`property_id` scoping) and role guards.

---

## 🚀 Key Features & Operational Invariants

- **Multi-Floor Room & Bed Matrix**:
  - Dynamically renders floor groups (Sub-basement `-2` to 60th Floor) and grid rooms.
  - Interactive bed state machine: `vacant_clean`, `vacant_dirty`, `occupied`, `maintenance`.
  - Supports private boutique suites, family rooms, and multi-bed backpacker dormitories.

- **Check-in with MRZ Scanner & Form C Compliance**:
  - Optical Machine Readable Zone (MRZ) parser for international passports with check-digit validation.
  - Automatically structures Bureau of Immigration (BoI) Form C export packets.
  - Encrypted ID photo storage with automated 90-day DPDP Act auto-purge cron functions.

- **Dynamic Stay Duration & Calendar Settlement**:
  - `StayCalendarModal` allows flexible duration selection with visual checkout date/time configuration.
  - Precision Indian Rupee (`₹`) integer paise and decimal mathematics preventing currency rounding drift.
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
│       ├── ci.yml                     # Continuous Integration workflow (Lint, Types, 551 Tests)
│       └── deploy-pages.yml           # Automated deployment of marketing website to GitHub Pages
├── assets/                            # Static app branding, logos, media, and fonts
│   ├── images/                        # High-resolution logos, banners, adaptive icons
│   └── media/                         # 1080p showcase video, preview GIF, and poster
├── logstay-website-v2/                # Next.js 15 marketing site & interactive web demo
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
├── CODE_OF_CONDUCT.md                 # Contributor Covenant Code of Conduct
├── CONTRIBUTING.md                    # Detailed developer setup & PR instructions
├── package.json                       # Dependencies & npm scripts
├── tsconfig.json                      # Strict TypeScript compiler options
└── vitest.config.mjs                  # Vitest runner configuration
```

---

## 🔒 Security & Role-Based Access Control (RBAC)

LogStay uses a strict 4-tier hierarchical permission model enforced at both the client service layer and PostgreSQL Row Level Security:

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

All database structures and procedures are defined in sequential migrations in `supabase/migrations/`:

- `20261015000001_initial_schema.sql`: Base tables (`properties`, `members`, `rooms`, `units`, `guests`, `stays`, `shifts`, `cash_entries`, `charges`, `payments`, `audit_log`, `housekeeping_log`, `issues`).
- `20261015000003_floors_and_rooms.sql`: Integer `floor_no` indexing (`-2` to `60`) and room management RPCs.
- `20261015000004_pin_recovery_and_stepup.sql`: Owner recovery flow and step-up authentication.
- `20261015000005_desk_add_staff_and_approval.sql`: Dual-control staff onboarding queue (`desk_staff_requests`).
- `20261015000006_property_branding_and_photo_approval.sql`: Property logo, banner, and photo approval ledger.
- `20261015000007_property_concierge_fields.sql`: Curated local places, emergency contacts, WiFi configuration.
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
- Node.js `20.x` or `22.x` (LTS recommended)
- npm or bun

### Installation
```bash
# Clone the repository
git clone https://github.com/breathtaker-adi/LogStay.git
cd LogStay

# Install SDK-compatible dependencies
npm install
```

### Running the Mobile App
```bash
# Start the Expo development server
npx expo start

# Open on Android Emulator / Physical Device
npx expo start --android

# Open on iOS Simulator (macOS)
npx expo start --ios
```

---

## 🧪 Testing & Quality Assurance

LogStay maintains a zero-regression automated test suite with **551 passing tests across 39 test suites**:

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

## 🔄 Continuous Integration (CI/CD)

The project includes an automated GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that validates every pull request and push to `master`:
1. Installs clean dependencies via `npm ci`.
2. Runs static type checking (`npx tsc --noEmit`).
3. Runs ESLint code quality checks.
4. Executes the full Vitest unit test suite (551 tests).

---

## 🧹 Database Truncation & Factory Reset

Before deploying to production or cleaning test data, run the scripts in `supabase/truncate_all_data.sql` inside your **Supabase Dashboard -> SQL Editor**:

- **Option 1: Operational Test Data Only (Recommended)**: Clears all test guests, stays, cash entries, shifts, issues, and requests while preserving properties, rooms, beds, and staff profiles.
- **Option 2: Full Factory Reset**: Completely wipes all tables down to a pristine state.

---

## 🤝 Contributing Guidelines

We love contributions! Whether you're fixing a bug, improving documentation, or adding a new feature:

1. Read our [Contributing Guidelines](CONTRIBUTING.md) for full setup instructions and coding standards.
2. Ensure all 551 unit tests pass (`npm run test:unit`).
3. Submit a pull request following our [Conventional Commits](https://www.conventionalcommits.org/) standards.

---

## 📜 Code of Conduct

LogStay is committed to fostering an open, welcoming, and harassment-free community. All participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 🌟 Built for Independent Hospitality

> *"Hospitality is not about menus or software. It is about making someone feel at home when they are thousands of miles away."*

Independent hotels, boutique retreats, mountain homestays, and backpacker hostels are the heart and soul of travel. Yet for too long, independent operators have been forced to choose between clumsy 1990s legacy desktop software or bloated cloud systems that lock up the moment the internet flickers.

**LogStay was built to give independent hoteliers their sovereignty back:**
- **Zero latency**: Instant taps with local SQLite responsiveness.
- **Zero vendor lock-in**: Your guest data stays in your database under your ownership.
- **Zero downtime**: Works when the power cuts, when the storm hits, and when the router drops.
- **Frontline dignity**: Fast 3-tap workflows that allow your staff to look guests in the eye, not stare at a frozen loading spinner.

To every night auditor balancing the cash drawer at 3:00 AM, to every property manager welcoming guests after a delayed train, and to every open-source developer helping make local businesses thrive — **LogStay is built for you.**

<p align="center">
  <b>Made with heart for independent hoteliers worldwide. 🏨✨</b><br />
  If you find LogStay valuable, please consider giving us a ⭐ on GitHub!
</p>

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
