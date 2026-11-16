"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

/**
 * ComparisonSection — LogStay vs the alternatives.
 * Plain language, focused on what actually matters.
 */
const COMPARISON = [
  { dimension: "Works when the internet is down", logstay: true, cloudbeds: false, paper: true },
  { dimension: "Scan a passport in 3 seconds", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Catches cash going missing", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Sends receipts to WhatsApp", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Auto-deletes guest photos", logstay: true, cloudbeds: false, paper: false },
  { dimension: "Each staff role sees only their job", logstay: true, cloudbeds: true, paper: false },
  { dimension: "Set up in under 10 minutes", logstay: true, cloudbeds: false, paper: true },
  { dimension: "Costs nothing per passport scan", logstay: true, cloudbeds: false, paper: true },
];

export function ComparisonSection() {
  return (
    <section id="comparison" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          How LogStay compares
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          The honest side-by-side.
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          No marketing fluff. Just the things that actually matter when
          you're running a property.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px] border-b border-border bg-popover/50 md:grid-cols-[1fr_140px_140px_140px]">
          <div className="px-4 py-4 font-mono text-[10px] tracking-mono text-stone md:px-6">
            What you need
          </div>
          <div className="px-2 py-4 text-center md:px-4">
            <div className="font-display text-base text-ember-readable">LogStay</div>
            <div className="font-mono text-[9px] tracking-mono text-stone">offline-native</div>
          </div>
          <div className="px-2 py-4 text-center md:px-4">
            <div className="font-display text-base text-bone-muted">Cloudbeds</div>
            <div className="font-mono text-[9px] tracking-mono text-stone">cloud-only</div>
          </div>
          <div className="px-2 py-4 text-center md:px-4">
            <div className="font-display text-base text-bone-muted">Pen &amp; paper</div>
            <div className="font-mono text-[9px] tracking-mono text-stone">no software</div>
          </div>
        </div>

        {/* Rows */}
        {COMPARISON.map((row, i) => (
          <motion.div
            key={row.dimension}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="grid grid-cols-[1fr_100px_100px_100px] border-b border-border-soft last:border-0 md:grid-cols-[1fr_140px_140px_140px]"
          >
            <div className="px-4 py-4 text-sm text-bone-muted md:px-6">
              {row.dimension}
            </div>
            {[row.logstay, row.cloudbeds, row.paper].map((val, j) => (
              <div key={j} className="flex items-center justify-center px-2 py-4 md:px-4">
                {val ? (
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      j === 0 ? "bg-ember/20" : "bg-sage/15"
                    }`}
                  >
                    <Check
                      className={`h-3.5 w-3.5 ${
                        j === 0 ? "text-ember-readable" : "text-sage"
                      }`}
                    />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/30">
                    <X className="h-3.5 w-3.5 text-stone" />
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
