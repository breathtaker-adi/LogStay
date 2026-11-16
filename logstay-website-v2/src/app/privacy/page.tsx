"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Lock, Trash2, Database, CheckCircle2, FileText, Sparkles, Terminal } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmberParticles } from "@/components/ember-particles";

export default function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Floating ember particles */}
      <EmberParticles count={20} />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Header bar */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 font-mono text-xs tracking-mono text-stone transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1 text-ember" />
            <span>Back to LogStay Overview</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <img src="/LogStay/logo.svg" alt="LogStay Logo" className="h-6 w-6 rounded-md shadow-sm" />
            <span className="font-display text-lg font-bold tracking-tight text-bone">LogStay</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-4xl px-6 py-16 md:py-24">
        {/* Title area */}
        <div className="mb-14">
          <div className="mb-3 inline-flex items-center gap-2 font-mono text-xs tracking-eyebrow text-ember-readable">
            <Shield className="h-3.5 w-3.5" />
            <span>DPDP ACT 2023 · SECURITY &amp; COMPLIANCE CHARTER</span>
          </div>
          <h1 className="font-headline text-4xl leading-tight text-bone md:text-5xl lg:text-6xl">
            Privacy built for properties. <br />
            <span className="italic text-ember-readable">Your data never leaves your desk.</span>
          </h1>
          <p className="mt-5 font-body-serif text-lg leading-relaxed text-stone">
            Most hotel management software runs in multi-tenant clouds where guest passport photos,
            credit card logs, and cash drawer balances are stored on third-party servers. LogStay is
            architected from the ground up on an offline-native, on-device foundation.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 font-mono text-xs text-stone">
            <span>Last Updated: November 2026</span>
            <span className="text-border">·</span>
            <span>Applicable Law: DPDP Act 2023 &amp; Statutory Tourism Regulations</span>
            <span className="text-border">·</span>
            <span className="text-sage font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Zero Cloud Telemetry
            </span>
          </div>
        </div>

        {/* Charter Sections */}
        <div className="space-y-10">
          {/* Section 1 */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember border border-ember/20">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-subsection text-xl font-bold text-bone">
                  1. Local-First, On-Device Data Isolation
                </h2>
                <div className="font-mono text-xs text-stone">Zero cloud middlemen · Direct hardware writes</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 font-body-serif text-sm leading-relaxed text-stone">
              <p>
                Every guest check-in, room folio, payment transaction, and passport scan is stored in a local,
                encrypted SQLite database resident on your physical mobile device. LogStay operates completely
                disconnected from any external cloud database.
              </p>
              <p>
                Because there is no central server harvesting your property's records:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs font-sans text-stone">
                <li>No guest identity details are ever sold, traded, or indexed by third-party data brokers.</li>
                <li>No behavioral profiling, targeted advertising trackers, or telemetry SDKs exist in the binary.</li>
                <li>Your revenue numbers, guest lists, and occupancy trends belong 100% to you.</li>
              </ul>
            </div>
          </section>

          {/* Section 2 */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember border border-ember/20">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-subsection text-xl font-bold text-bone">
                  2. Automated 02:00 AM ID Photo Shredder
                </h2>
                <div className="font-mono text-xs text-stone">DPDP Act Section 8(7) Automated Data Erasure</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 font-body-serif text-sm leading-relaxed text-stone">
              <p>
                Under Section 8(7) of the Digital Personal Data Protection (DPDP) Act 2023, data fiduciaries must
                erase personal data as soon as the specified purpose is fulfilled. Storing guest passport photos
                indefinitely on unsecured staff phones is a massive civil liability.
              </p>
              <p>
                LogStay solves this through an autonomous background cleanup engine:
              </p>
              <div className="rounded-xl border border-border/80 bg-muted/40 p-4 font-mono text-xs space-y-2 text-stone">
                <div className="flex items-center gap-2 text-ember font-semibold">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Scheduled Retention Enforcement Protocol:</span>
                </div>
                <p>1. Photos are marked with a statutory TTL (Time-To-Live) at check-in.</p>
                <p>2. At 02:00 AM local property time, expired photos are permanently unlinked and overwritten with random bytes.</p>
                <p>3. An immutable purge confirmation is appended to the local audit ledger: <code>[PURGE_SUCCESS] Expired identity binaries erased. Zero residual liability.</code></p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember border border-ember/20">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-subsection text-xl font-bold text-bone">
                  3. Statutory Form C Foreign Guest Reporting
                </h2>
                <div className="font-mono text-xs text-stone">Immigration bureau compliance without cloud exposure</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 font-body-serif text-sm leading-relaxed text-stone">
              <p>
                By statutory tourism mandates, hospitality properties accommodating international tourists must
                register foreign nationals with immigration authorities (Form C). Traditional PMS providers transmit
                unencrypted passport PDFs to foreign cloud servers to parse this data.
              </p>
              <p>
                LogStay uses an on-device ICAO 9303 MRZ scanner. The Machine Readable Zone is decoded in 120ms
                directly on the phone's CPU. The Form C report is generated locally and exported directly by the
                authorized property administrator, eliminating unvetted third-party intermediaries.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember border border-ember/20">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-subsection text-xl font-bold text-bone">
                  4. Dual-Key Cash Audits &amp; Anti-Tamper Ledgers
                </h2>
                <div className="font-mono text-xs text-stone">Cryptographic proof for shift handovers</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 font-body-serif text-sm leading-relaxed text-stone">
              <p>
                Cash theft and unrecorded pocketing are prevented through mathematical proofs:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs font-sans text-stone">
                <li>Both outgoing and incoming front desk staff must enter their independent verification PINs to close a shift.</li>
                <li>Cash drawer counts are cross-checked against opening float plus atomic transaction receipts.</li>
                <li>Any variance halts the handover, prompts for mandatory clerk justification, and sends a push notification to the owner's device.</li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember border border-ember/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-subsection text-xl font-bold text-bone">
                  5. Zero Vendor Lock-in &amp; Total Data Sovereignty
                </h2>
                <div className="font-mono text-xs text-stone">Your property. Your guests. Your database.</div>
              </div>
            </div>
            <div className="mt-4 space-y-3 font-body-serif text-sm leading-relaxed text-stone">
              <p>
                You are never held hostage. At any moment, the property owner can export the complete folio ledger,
                guest registration logs, and accounting archives in standardized CSV or JSON formats with a single tap.
                If you ever choose to discontinue using LogStay, your historical records stay on your handset forever.
              </p>
            </div>
          </section>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center border-t border-border/80 pt-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-border/90 bg-card px-6 py-2.5 font-mono text-xs font-semibold tracking-mono text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ember hover:bg-ember/10 hover:text-ember"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to LogStay Homepage</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 py-8 text-center font-mono text-xs text-stone">
        LogStay · The Offline-Native Hospitality OS · DPDP 2023 Compliant
      </footer>
    </div>
  );
}
