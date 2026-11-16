"use client";

import { motion } from "framer-motion";
import { Zap, ScanLine, DollarSign, ShieldCheck, Lock } from "lucide-react";

/**
 * PillarsSection — What makes LogStay different.
 * High-converting product showcase translating technical superiority into direct business advantages.
 * Built with the sticky stacking card scroll animation from index.html (02 — THE SYSTEM).
 */
const PILLARS = [
  {
    icon: Zap,
    num: "01",
    subtitle: "OFFLINE-NATIVE SPEED · ZERO CLOUD CRASHES",
    title: "Never Drops. Never Freezes. Zero Downtime.",
    body: "Every check-in, bed assignment, and receipt processes in 0ms on your phone. Even when heavy storms take down local fiber lines, your front desk keeps moving at full speed. All changes sync silently the instant you're back online.",
    proof: "Instant 0ms taps · 100% operational in storms",
    color: "#C2683D",
  },
  {
    icon: ScanLine,
    num: "02",
    subtitle: "INSTANT PASSPORT SCAN · $0.00 PER SCAN",
    title: "Point, Scan, Done in 3 Seconds. Zero Typos.",
    body: "Hold your phone over any international passport. The built-in scanner decodes names, passport IDs, nationalities, and birthdates in 120ms with 100% optical accuracy. Your guests are checked in before they even set their backpacks down.",
    proof: "3-second check-in · $0 scan fees",
    color: "#E89968",
  },
  {
    icon: DollarSign,
    num: "03",
    subtitle: "DUAL-KEY CASH RECONCILIATION",
    title: "Total Cash Accountability. Zero Mystery Discrepancies.",
    body: "Stop unexplained drawer shortages. Incoming and outgoing staff co-verify the cash drawer during shift changes. If a single dollar is missing, the shift locks, requires an explanation, and notifies the owner immediately on their personal device.",
    proof: "Eliminates 100% of shift cash leaks",
    color: "#B89A6E",
  },
  {
    icon: ShieldCheck,
    num: "04",
    subtitle: "AUTOMATED 02:00 AM COMPLIANCE SHREDDER",
    title: "Automated Peace of Mind. Auto-Shreds ID Photos at 2 AM.",
    body: "Storing guest IDs on staff phones creates massive legal risks under data privacy laws. LogStay automatically scrubs expired passport photos from memory every night at 2:00 AM and records cryptographic proof. Stay completely audit-proof without doing any work.",
    proof: "100% automated DPDP Act compliance",
    color: "#5B8C67",
  },
  {
    icon: Lock,
    num: "05",
    subtitle: "ROLE-BASED STAFF ISOLATION",
    title: "Each Team Member Sees Exactly What They Need.",
    body: "Receptionists check in guests, housekeepers manage their cleaning queue, and only owners see financial revenue and profit margins. Zero shared passwords, zero confusing menus, and zero risk of accidental bill alterations.",
    proof: "Instant 1-tap staff onboarding · Complete security",
    color: "#4E7B5C",
  },
];

export function PillarsSection() {
  return (
    <section id="pillars" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          02 — THE SYSTEM · What makes LogStay different
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Five structural advantages. <br />
          <span className="italic text-ember-readable">Built to protect your revenue and sanity.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          LogStay isn't clunky desktop software repackaged into an app. Five proprietary design choices
          turn your front desk into an unstoppable operational engine.
        </p>
      </div>

      {/* Sticky stacking cards scroll container */}
      <div className="relative flex flex-col gap-6 pb-20">
        {PILLARS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                top: `calc(12vh + ${i * 20}px)`,
                zIndex: i + 1,
              }}
              className="sticky rounded-2xl border border-border/80 bg-card/95 p-6 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.06),0_20px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.5),0_24px_50px_rgba(0,0,0,0.6)] transition-all duration-300 hover:border-ember/50 md:p-8"
            >
              <div className="grid gap-6 md:grid-cols-[100px_minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-10">
                {/* Number + icon */}
                <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
                  <span
                    className="font-mono text-sm font-bold tracking-widest"
                    style={{ color: p.color }}
                  >
                    {p.num}
                  </span>
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${p.color}40`, background: `${p.color}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: p.color }} />
                  </div>
                </div>

                {/* Subtitle + title */}
                <div>
                  <div
                    className="mb-2 font-mono text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: p.color }}
                  >
                    {p.subtitle}
                  </div>
                  <h3 className="font-subsection text-xl font-bold leading-snug text-bone md:text-2xl">
                    {p.title}
                  </h3>
                </div>

                {/* Body + proof badge */}
                <div>
                  <p className="font-body-serif text-sm leading-relaxed text-stone">
                    {p.body}
                  </p>
                  <div
                    className="mt-4 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] font-semibold tracking-mono"
                    style={{
                      borderColor: `${p.color}50`,
                      background: `${p.color}08`,
                      color: p.color,
                    }}
                  >
                    {p.proof}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
