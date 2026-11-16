"use client";

import { useState } from "react";
import { ArrowUp, Github, Shield, Lock, Trash2, Database, CheckCircle2 } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

const BASE_URL = "https://breathtaker-adi.github.io/LogStay";

export function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <footer className="relative z-10 mt-auto border-t border-border/80 bg-card/60 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-14 md:px-12">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand col */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div
                className="h-2.5 w-2.5 rounded-full bg-ember animate-pulse"
                style={{ boxShadow: "0 0 12px rgba(194,104,61,0.8)" }}
              />
              <span className="font-display text-2xl font-bold tracking-tight text-bone">LogStay</span>
            </div>
            <p className="font-body-serif text-sm leading-relaxed text-stone">
              The offline-native operating system for modern hospitality.
              Your front desk, always open — zero cloud bottlenecks.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2 font-mono text-[11px] font-medium tracking-mono text-stone">
              <span className="rounded-md border border-border/80 bg-muted/50 px-2 py-0.5">iOS 15+</span>
              <span className="rounded-md border border-border/80 bg-muted/50 px-2 py-0.5">Android 9+</span>
              <span className="rounded-md border border-border/80 bg-muted/50 px-2 py-0.5">Local SQLite</span>
            </div>
          </div>

          {/* Explore col */}
          <div>
            <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-mono text-stone">
              Explore
            </div>
            <ul className="space-y-2.5 font-mono text-xs">
              {[
                [`${BASE_URL}/#problem`, "The problem"],
                [`${BASE_URL}/#pillars`, "What makes it different"],
                [`${BASE_URL}/#how-it-works`, "How check-in works"],
                [`${BASE_URL}/#scan-demo`, "Try the passport scan"],
                [`${BASE_URL}/#rooms`, "See the room grid"],
                [`${BASE_URL}/#who-its-for`, "Who it's for"],
                [`${BASE_URL}/#comparison`, "Compare alternatives"],
                [`${BASE_URL}/#faq`, "Questions"],
              ].map(([href, label]) => (
                <li key={label}>
                  <a
                    href={href}
                    className="text-stone transition-colors duration-200 hover:text-ember-readable hover:underline"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* The numbers col */}
          <div>
            <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-mono text-stone">
              The numbers
            </div>
            <ul className="space-y-3 font-mono text-xs text-stone">
              <li className="flex items-center gap-2">
                <span className="font-bold text-ember-readable">3 sec</span>
                <span>passport check-in</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold text-ember-readable">0 ms</span>
                <span>response time</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold text-ember-readable">$0</span>
                <span>cost per scan</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold text-ember-readable">10 min</span>
                <span>set up time</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="font-bold text-ember-readable">100%</span>
                <span>works offline</span>
              </li>
            </ul>
          </div>

          {/* Trust & Privacy col */}
          <div>
            <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-mono text-stone">
              Trust &amp; Privacy
            </div>
            <p className="text-xs leading-relaxed text-stone">
              Built from day one to exceed the Digital Personal Data Protection (DPDP) Act 2023.
            </p>
            <div className="mt-4 space-y-2 font-mono text-[11px] text-stone">
              <div className="flex items-center gap-2 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Zero third-party trackers</span>
              </div>
              <div className="flex items-center gap-2 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Auto 02:00 ID shredder</span>
              </div>
              <div className="flex items-center gap-2 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Local encrypted storage</span>
              </div>
            </div>

            <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/60 px-3 py-1.5 font-mono text-xs font-medium text-bone transition-all duration-200 hover:border-ember hover:bg-ember/10 hover:text-ember"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Privacy Policy &amp; DPDP</span>
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border bg-card p-6 md:p-8">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2.5 font-headline text-2xl text-bone">
                    <Shield className="h-5 w-5 text-ember" />
                    <span>Privacy Policy &amp; Security Charter</span>
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs text-stone">
                    Last updated: November 2026 · Built for the DPDP Act 2023 &amp; Global Compliance
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-6 text-sm text-stone">
                  <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
                    <div className="flex items-center gap-2 font-semibold text-bone">
                      <Database className="h-4 w-4 text-ember" />
                      <span>1. On-Device, Offline-First Data Isolation</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">
                      LogStay operates natively on-premises. Guest check-in records, passport MRZ data, and folio ledgers are written directly to your mobile device's local encrypted SQLite database. No guest details are ever sold, transmitted to advertising brokers, or exposed to unvetted cloud telemetry.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
                    <div className="flex items-center gap-2 font-semibold text-bone">
                      <Trash2 className="h-4 w-4 text-ember" />
                      <span>2. Automated 2 AM ID Photo Shredder</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">
                      In strict compliance with statutory digital privacy standards, guest identity photos captured during check-in are treated as ephemeral verification buffers. Nightly cron routines automatically scrub expired photo binaries from physical storage, zero database pointers, and append cryptographic proof to the immutable audit log.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
                    <div className="flex items-center gap-2 font-semibold text-bone">
                      <Lock className="h-4 w-4 text-ember" />
                      <span>3. Two-Person Cash Verification &amp; Statutory Form C</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">
                      Foreign tourist Form C immigration reports are generated locally using cryptographic client-side schemas. Cash drawer handovers require mutual co-signing by incoming and outgoing front desk personnel, preventing internal fraud with zero cloud dependency.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/80 pt-6 md:flex-row">
          <div className="font-mono text-xs tracking-mono text-stone">
            LogStay · The offline-native hospitality OS · 2026
          </div>

          <div className="flex items-center gap-4">
            {/* Highlighted on hover Source button */}
            <a
              href="https://github.com/breathtaker-adi/LogStay"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-border/90 bg-card px-4 py-1.5 font-mono text-xs font-medium tracking-mono text-stone shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ember hover:bg-ember/10 hover:text-ember hover:shadow-[0_0_16px_rgba(194,104,61,0.3)]"
            >
              <Github className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
              <span>Source</span>
            </a>

            <MagneticButton
              as="a"
              href="#top"
              strength={0.3}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-3.5 py-1.5 font-mono text-xs tracking-mono text-stone transition-all duration-200 hover:border-ember/50 hover:text-bone"
            >
              <ArrowUp className="h-3 w-3" /> Top
            </MagneticButton>
          </div>
        </div>
      </div>
    </footer>
  );
}
