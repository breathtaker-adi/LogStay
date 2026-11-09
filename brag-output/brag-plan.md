# Brag Plan: LogStay Mobile

## What is this app?
LogStay Mobile is a high-reliability, offline-first mobile Property Management System (PMS) and front-desk operating platform tailored for boutique hotels, hostels, and guest houses.

## The angle
A grounded, authoritative, and completely accurate product walkthrough showcasing how LogStay solves the hard operational challenges of hospitality in India: multi-floor bed matrices, passport MRZ scanning, Form C compliance, dual-control approvals, UPI reconciliation, two-person cash handovers, and DPDP Act statutory data protection—all running seamlessly with zero internet dependence.

## Hook (first 2-3 seconds)
A sleek, glowing mobile UI reveals: **"LogStay Mobile: Front Desk Operating Platform"** transitioning directly into the high-density multi-floor bed matrix.

## Key moments (the middle)
- **Multi-Floor Room & Bed Matrix**: Dynamic floor navigation (-2 to 60) with 4-state real-time bed indicators (Clean, Dirty, Occupied, Maintenance) across private rooms and dorms.
- **Fast Guest Check-in & MRZ Passport Reader**: Sub-second OCR extraction from passport MRZ codes, automated Form C statutory reporting, and flexible check-out calendar scheduling.
- **Dynamic UPI & Bank Reconciliation**: Direct Owner UPI QR code presentation at check-in with a dual-verification reconciliation dashboard.
- **Dual-Control Approval Governance**: Front-desk staff invitations and concierge changes staged for Owner & Co-Admin review.
- **Cash Drawer & 2-Person Handover**: Full petty cash tracking and blind shift cash handover requiring incoming & outgoing staff co-signing.

## Outro / punchline
"100% Offline Resilience. 525 Automated Tests. Built for Real Front Desks."
Landing on the GitHub repository link: `breathtaker-adi/LogStay-Mobile`.

## User flow worth showing
1. **Explore & Assign Beds**: Navigate from Ground Floor dorms to Upper Floor private suites; tap beds to view room cards and update cleaning status.
2. **Register Guest**: Scan passport MRZ, select stay duration via visual calendar, and generate instant UPI check-in folio.
3. **Govern & Settle**: Review pending staff requests in Approvals, reconcile bank UPI settlements, and close shift with two-person authenticated handover.

## Tone
- Preset: `polished`
- Creative direction: Precise, modern, authoritative product showcase
- Interpretation: Fast-paced yet completely readable typography, clean motion, authentic UI cards, and zero generic marketing fluff.

## Format: landscape — 1920x1080
## Duration: 60 seconds (1 minute exact)

## Visual identity (from the project)
- Background: `#0B0F19` (Deep Navy / Charcoal)
- Surface Cards: `#1E293B` (Slate Navy) with `#334155` border
- Accent 1: `#3B82F6` (Electric Blue)
- Accent 2: `#10B981` (Emerald Green)
- Warning/Dirty: `#F59E0B` (Amber)
- Maintenance: `#EF4444` (Ruby Rose)
- Text Primary: `#F8FAFC`
- Text Secondary: `#94A3B8`
- Display Font: System Sans-Serif (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- Body Font: System Sans-Serif

## Share copy (draft)
LogStay Mobile: The offline-first front desk PMS for boutique stays, hostels, and guest houses. Real-time multi-floor bed matrix, MRZ passport scan, dual-control approvals, and DPDP Act compliance in your pocket.

## Audio direction
- Role: Warm, energetic modern lo-fi corporate beat with subtle interface SFX
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: Smooth fade-in at 0.0s, balanced volume during feature scenes, gentle fade-out under final logo outro at 58.0s–60.0s
- SFX posture: Restrained, crisp interface clicks (`click1.ogg`, `switch1.ogg`) aligning with card reveals
- Restraint rule: No loud explosions or harsh buzzers; audio must sound like a premium Apple/Stripe product video

## Storyboard

### Scene 1 — The Mission & Architecture — 0.0s to 7.5s (7.5s)
- **Visual**: Dark ambient glassmorphism backdrop with animated badge: "OFFLINE-FIRST MOBILE PMS". Hero title drops in: "LogStay Mobile". Subtitle: "Purpose-Built for Hostels, Boutique Hotels & Guest Houses".
- **Interaction**: Architecture pills pulse: "Expo SDK 58", "Supabase PostgreSQL", "Local SQLite Outbox".
- **Audio intent**: Warm musical intro swells; subtle click on title lock.
- **Transition**: Clean smooth slide left → Scene 2.

### Scene 2 — Multi-Floor Room & Bed Matrix — 7.5s to 16.0s (8.5s)
- **Visual**: Multi-Floor selector (-2 Sub-basement to 60th Floor) and interactive Bed Grid.
- **Interaction**: Color-coded bed cards reveal sequentially:
  - 🟢 Vacant Clean
  - 🟠 Vacant Dirty
  - 🟣 Occupied
  - 🔴 Maintenance
  Simulated status change with instant housekeeping audit trigger.
- **Audio intent**: Soft interface switch SFX on bed card taps.
- **Transition**: Soft fade transition → Scene 3.

### Scene 3 — Rapid Check-In & MRZ Passport Reader — 16.0s to 25.0s (9.0s)
- **Visual**: Guest Check-In console. Passport MRZ Scanner frame with optical scan line animation.
- **Interaction**: Auto-populates guest name, nationality, and passport number. Stay Calendar modal displays check-out date & time selector. Badge: "Automated Bureau of Immigration Form C Export".
- **Audio intent**: Subtle scan chime followed by card lock sound.
- **Transition**: Smooth slide up → Scene 4.

### Scene 4 — Dynamic UPI Payments & Bank Reconciliation — 25.0s to 33.5s (8.5s)
- **Visual**: Owner UPI setup in Settings displaying dynamic UPI QR code.
- **Interaction**: Folio bill card generates instant UPI QR. Front-desk switches to "UPI Reconciliation Dashboard" where Owners & Co-Admins verify incoming bank settlements with dual-audit timestamps.
- **Audio intent**: Positive chime on payment verified.
- **Transition**: Clean wipe → Scene 5.

### Scene 5 — Dual-Control Approval Governance — 33.5s to 42.0s (8.5s)
- **Visual**: Approvals Inbox displaying pending operational requests:
  - Desk Staff Onboarding Request (Dual-control review)
  - Concierge Recommendations Update
- **Interaction**: Co-Admin / Owner taps "Approve". Role escalation prevention guard highlighted.
- **Audio intent**: Subtle switch click on approval action.
- **Transition**: Soft fade → Scene 6.

### Scene 6 — Shift Cash Drawers & 2-Person Handover — 42.0s to 51.0s (9.0s)
- **Visual**: Live Shift Management console: Opening Balance, Collections, Petty Cash Vouchers.
- **Interaction**: End of Shift Handover dialog: Outgoing desk attendant enters blind cash count; incoming attendant co-signs with credential validation. Variance attributed cleanly to the specific shift.
- **Audio intent**: Crisp drawer click on handover completion.
- **Transition**: Smooth transition → Scene 7.

### Scene 7 — Offline Resilience & Statutory Compliance — 51.0s to 60.0s (9.0s)
- **Visual**: "100% Offline-First Architecture". Sync icon activates: SQLite outbox seamlessly syncs enqueued transactions when connection restores.
- **Badges**:
  - 🔒 DPDP Act 2023: 90-Day Encrypted ID Photo Auto-Purge
  - 🧪 525 Automated Unit & Integration Tests (100% Pass)
  - ⚡ CI/CD GitHub Actions Pipeline Verified
- **Outro**: Full LogStay logo with GitHub repository: `github.com/breathtaker-adi/LogStay-Mobile`.
- **Audio intent**: Music swells into clean outro with warm final fade.

**Music mood for this video:** Warm, modern corporate lo-fi beat.
**Audio summary:** A continuous professional soundtrack carrying rhythmic motion across all 7 operational capability scenes.

