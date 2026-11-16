"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

/**
 * ComparisonSection — LogStay vs Legacy Alternatives.
 * Compelling side-by-side sales table comparing LogStay against Cloud PMS and Pen & Paper.
 */
const COMPARISON = [
  { dimension: "100% operational when Wi-Fi drops", logstay: true, cloudbeds: false, paper: true },
  { dimension: "3-second optical passport check-in", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Catches cash theft on shift handovers", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Automated 02:00 AM guest photo shredder", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Encrypted WhatsApp receipts (no printers)", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Zero monthly per-bed or per-room fees", logstay: true, cloudbeds: false, paper: true },
  { dimension: "Set up in under 8 minutes on any smartphone", logstay: true, cloudbeds: false, paper: true },
  { dimension: "Role-isolated views (Staff can't see profit)", logstay: true, cloudbeds: true, paper: false },
  { dimension: "Zero desktop hardware or scanners required", logstay: true, cloudbeds: false, paper: true },
];

export function ComparisonSection() {
  return (
    <section id="comparison" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          The honest comparison
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          The side-by-side <span className="italic text-ember-readable">incumbents hope you never see.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Traditional PMS companies charge you hundreds in monthly per-bed fees for software
          that locks up the second the Wi-Fi glitches. See how LogStay compares.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px] border-b border-border/80 bg-muted/40 md:grid-cols-[1fr_150px_150px_150px]">
          <div className="px-5 py-5 font-mono text-xs font-semibold uppercase tracking-mono text-stone md:px-8">
            Operational Feature
          </div>
          <div className="border-x border-border/60 bg-ember/10 px-2 py-5 text-center md:px-4">
            <div className="font-display text-lg font-bold text-ember-readable">LogStay</div>
            <div className="font-mono text-[10px] tracking-mono font-medium text-ember">Offline-Native</div>
          </div>
          <div className="px-2 py-5 text-center md:px-4">
            <div className="font-display text-base font-semibold text-bone">Cloud PMS</div>
            <div className="font-mono text-[10px] tracking-mono text-stone">e.g. Cloudbeds</div>
          </div>
          <div className="px-2 py-5 text-center md:px-4">
            <div className="font-display text-base font-semibold text-stone">Pen &amp; Paper</div>
            <div className="font-mono text-[10px] tracking-mono text-stone">Manual Registry</div>
          </div>
        </div>

        {/* Rows */}
        {COMPARISON.map((row, i) => (
          <motion.div
            key={row.dimension}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            className="grid grid-cols-[1fr_100px_100px_100px] border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors md:grid-cols-[1fr_150px_150px_150px]"
          >
            <div className="flex items-center px-5 py-4 font-body-serif text-sm text-bone md:px-8">
              {row.dimension}
            </div>

            {/* LogStay column */}
            <div className="flex items-center justify-center border-x border-border/60 bg-ember/5 px-2 py-4 md:px-4">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ember/20 text-ember-readable">
                <Check className="h-4 w-4" />
              </div>
            </div>

            {/* Cloud PMS column */}
            <div className="flex items-center justify-center px-2 py-4 md:px-4">
              {row.cloudbeds ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sage/20 text-sage">
                  <Check className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/40 text-stone">
                  <X className="h-3.5 w-3.5" />
                </div>
              )}
            </div>

            {/* Pen & Paper column */}
            <div className="flex items-center justify-center px-2 py-4 md:px-4">
              {row.paper ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sage/20 text-sage">
                  <Check className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/40 text-stone">
                  <X className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
