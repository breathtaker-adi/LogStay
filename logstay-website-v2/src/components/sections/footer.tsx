"use client";

import Link from "next/link";
import { ArrowUp, Github, Shield, CheckCircle2 } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-border/80 bg-card/60 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12">
        <div className="grid gap-8 md:grid-cols-2 md:items-start md:justify-between">
          {/* Brand col */}
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-2.5">
              <img src="/LogStay/logo.svg" alt="LogStay Logo" className="h-7 w-7 rounded-lg shadow-sm" />
              <span className="font-display text-2xl font-bold tracking-tight text-bone">LogStay</span>
            </div>
            <p className="font-body-serif text-sm leading-relaxed text-stone">
              The offline-native operating system for modern hospitality.
              Your front desk, always open — zero cloud bottlenecks.
            </p>
            {/* Un-capsuled specifications */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 font-mono text-xs text-stone">
              <span>iOS 15+</span>
              <span className="text-border">·</span>
              <span>Android 9+</span>
              <span className="text-border">·</span>
              <span>Local SQLite</span>
            </div>
          </div>

          {/* Trust & Privacy col — un-capsuled clean links */}
          <div className="space-y-4 md:text-right md:flex md:flex-col md:items-end">
            <div className="font-mono text-xs font-semibold uppercase tracking-mono text-stone">
              Trust &amp; Compliance
            </div>
            <p className="text-xs leading-relaxed text-stone max-w-sm">
              Built from day one to exceed the Digital Personal Data Protection (DPDP) Act 2023.
              Zero cloud telemetry, automated 02:00 AM photo shredding, and full on-device data sovereignty.
            </p>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-stone md:justify-end">
              <span className="flex items-center gap-1.5 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Zero trackers</span>
              </span>
              <span className="flex items-center gap-1.5 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Auto 02:00 shredder</span>
              </span>
              <span className="flex items-center gap-1.5 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Local encrypted SQLite</span>
              </span>
            </div>

            {/* Un-capsuled Privacy Policy link */}
            <div className="pt-2">
              <Link
                href="/privacy"
                className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-stone transition-colors duration-200 hover:text-ember-readable hover:underline"
              >
                <Shield className="h-3.5 w-3.5 text-ember" />
                <span>Privacy Policy &amp; DPDP Charter →</span>
              </Link>
            </div>
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
