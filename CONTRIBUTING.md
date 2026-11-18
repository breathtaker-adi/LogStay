# Contributing to LogStay Mobile 🏨

First off, thank you for considering contributing to **LogStay**! It's people like you who make LogStay a dependable, battle-tested operating system for boutique hotels, hostels, and guest houses worldwide.

Please take a moment to review this document before submitting your first contribution.

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by the [LogStay Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to **[adityak231105@gmail.com](mailto:adityak231105@gmail.com)**.

---

## 🏛 Core Architectural Philosophy

LogStay is engineered under strict operational invariants that reflect real-world hospitality environments:

1. **Offline-First Resilience**: A hotel front desk cannot stop checking in guests when the Wi-Fi drops. All core mutations (check-ins, check-outs, room moves, cash entries) write immediately to the local SQLite outbox (`src/lib/offline.ts`) and reconcile asynchronously when connectivity restores.
2. **Strict Multi-Tenant Isolation**: Every database query and RPC must enforce `property_id` tenancy and Row-Level Security (RLS). A user from Property A must never be able to view, query, or infer data from Property B.
3. **Statutory & Privacy Compliance**: Features touching guest IDs, passports, or financial records must adhere to DPDP Act privacy rules (e.g. automated ID photo purge schedules, Form C exports, immutable audit logging).
4. **Service-Layer Separation**: UI components in `src/app/` and `src/components/` must never call Supabase or raw SQL directly; they interact through structured domain services in `src/services/` (`StayService`, `HousekeepingService`, `ShiftService`, etc.).

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **Expo CLI**: Integrated with Expo SDK 58 (`npx expo`)
- **Git**

### Step-by-Step Setup

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/<your-username>/LogStay-Mobile.git
   cd LogStay-Mobile
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```
   > ⚠️ **Note**: Always use `npx expo install <package>` instead of `npm install <package>` when adding React Native or Expo dependencies to ensure SDK 58 version compatibility.

3. **Configure Environment Variables**:
   Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```
   For local offline development and running unit tests, default mock credentials in `src/config/env.ts` are automatically used if `.env` values are omitted.

4. **Start the Development Server**:
   ```bash
   npx expo start
   ```
   - Press `a` to open on an Android emulator or connected device.
   - Press `i` to open on an iOS simulator (macOS only).
   - Press `w` to open on web.

---

## 🧪 Testing & Verification Standards

LogStay enforces a strict **Zero-Regression Policy**. Every pull request must pass the automated CI pipeline before merge approval.

### 1. Run Unit & Regression Tests (Vitest)
```bash
npm run test:unit
```
> All **551+ unit tests across 39 test suites** must pass without errors. When introducing a new service, helper, or feature, you are expected to include corresponding unit tests in `src/`.

### 2. Static Typecheck
```bash
npx tsc --noEmit
```
> Must exit with code `0` and zero TypeScript diagnostic errors.

### 3. Lint Code
```bash
npm run lint
```
> Follows ESLint 9 flat config for React Native, TypeScript, and React Hooks.

### 4. Expo Health Check
```bash
npx expo-doctor
```
> Validates that all native packages match Expo SDK 58 peer dependencies.

---

## 🌿 Git Branching & Commit Conventions

### Branch Naming Conventions
- `feat/feature-name` — New user-facing or architectural capability
- `fix/issue-description` — Bug fix or crash resolution
- `docs/topic-name` — Documentation improvements
- `refactor/component-name` — Code restructuring with no behavior change
- `test/test-suite` — Adding or improving test suites

### Conventional Commits
We follow the [Conventional Commits specification](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary in imperative mood>

[optional body explaining motivation and context]

[optional footer(s), e.g., Closes #42]
```

**Examples:**
- `feat(checkin): add passport MRZ checksum validation helper`
- `fix(offline): handle network timeout retry in outbox sync`
- `docs(readme): add interactive video player and architecture diagram`
- `test(security): add tenant isolation attack vector tests`

---

## 📬 Submitting a Pull Request

1. **Sync with Upstream**:
   ```bash
   git checkout master
   git pull origin master
   ```

2. **Create your feature branch**:
   ```bash
   git checkout -b feat/your-feature
   ```

3. **Commit your changes**:
   Make atomic, well-described commits adhering to Conventional Commits.

4. **Run Local Quality Checks**:
   ```bash
   npm run test:unit
   npx tsc --noEmit
   npm run lint
   ```

5. **Push and Open PR**:
   Push to your fork and submit a PR against `master`. Fill out the PR template completely:
   - Provide a clear summary of changes.
   - Explain the motivation and hospitality problem being solved.
   - Confirm that all existing tests pass and new tests are included.
   - Attach screenshots or screen recordings for any UI changes.

---

## 🔒 Security & Vulnerability Reporting

If you discover a security vulnerability or potential tenant isolation flaw, **do not open a public GitHub issue**.

Please send an encrypted or direct email to **[adityak231105@gmail.com](mailto:adityak231105@gmail.com)** with:
- A description of the vulnerability.
- Steps to reproduce or proof-of-concept exploit script.
- Affected components or migrations.

We take security vulnerabilities very seriously and will acknowledge receipt within 24 hours and coordinate a coordinated fix and advisory.

---

## 💡 Questions & Community Support

Have questions about setup, architecture, or hospitality domain logic?
- Open a GitHub [Discussion](https://github.com/breathtaker-adi/LogStay/discussions) or [Issue](https://github.com/breathtaker-adi/LogStay/issues).
- Check the [LogStay Product Overview & Specification](Docs/LogStay_Product_Overview_and_Specification_Document.md).
- Visit the official project website at [https://breathtaker-adi.github.io/LogStay/](https://breathtaker-adi.github.io/LogStay/).

Thank you for building a more resilient, sovereign future for independent hospitality! 🏨✨
