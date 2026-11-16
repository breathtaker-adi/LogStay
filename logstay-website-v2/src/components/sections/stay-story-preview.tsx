"use client";

import { motion } from "framer-motion";
import { Plane, Moon, Receipt, DoorOpen } from "lucide-react";

/**
 * StayStoryPreview — Phase 4.3 condensed.
 * Shows the four-chapter narrative structure (Arrival → Stay → Settlement → Departure)
 * with a horizontal timeline scrubber at the top.
 */
const CHAPTERS = [
  {
    icon: Plane,
    label: "Arrival",
    eyebrow: "Ch. 01 · 14:32 IST",
    title: "MRZ scanned. Form C generated.",
    body: "Guest passport parsed via ICAO 9303 Type 3 MRZ reader. Bed 304 atom transitions vacant_clean → occupied with spring 320/28. Audit ledger records access.",
    color: "#C2683D",
  },
  {
    icon: Moon,
    label: "Stay",
    eyebrow: "Ch. 02 · 3 nights",
    title: "The arc of a guest's time.",
    body: "Folio accrues: room charge, breakfast, laundry. Each entry timestamped in JetBrains Mono. Stay Story Scroll translates this into a chapter you can scroll, not a form you can read.",
    color: "#E89968",
  },
  {
    icon: Receipt,
    label: "Settlement",
    eyebrow: "Ch. 03 · ₹ 4,800.00",
    title: "UPI verified. Integer-paise precision.",
    body: "Owner UPI QR displayed. Payment verified in reconciliation queue. INR math prevents currency rounding drift. Folio ledger closes with tabular-figure alignment.",
    color: "#B89A6E",
  },
  {
    icon: DoorOpen,
    label: "Departure",
    eyebrow: "Ch. 04 · 11:00 IST",
    title: "Bed returns to vacant · dirty.",
    body: "Check-out triggers housekeeping cycle. Bed atom transitions occupied → vacant_dirty. ID photo purge scheduled for 90-day DPDP Act cron. Audit ledger closes stay entry.",
    color: "#6B7A5A",
  },
];

export function StayStoryPreview() {
  return (
    <section id="stay-story" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember">
          Phase 4.3 · Stay Story Scroll
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          A stay rendered as a <span className="italic text-ember">chapter sequence.</span>
        </h2>
        <p className="mt-4 max-w-2xl font-body-serif text-base text-stone">
          Not a form — a narrative. Four chapters pinned via GSAP ScrollTrigger,
          with a fixed timeline scrubber that lets the owner rewind through a stay's history.
        </p>
      </div>

      {/* Timeline scrubber (static representation) */}
      <div className="mb-12 overflow-hidden rounded-md border border-border bg-popover/30 p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-mono text-stone">
            STAY · #0142 · TIMELINE SCRUBBER
          </span>
          <span className="font-mono text-[10px] tracking-mono text-ember">
            RM 304 · 3 NIGHTS
          </span>
        </div>
        <div className="relative h-12 rounded border border-border bg-background/40">
          {/* Progress bar */}
          <div className="absolute inset-y-0 left-0 w-[68%] bg-gradient-to-r from-ember/30 to-ember/60" />
          {/* Ticks */}
          {["CHECK-IN", "+24H", "+48H", "SETTLEMENT", "CHECK-OUT"].map((tick, i) => {
            const positions = [0, 25, 50, 75, 100];
            return (
              <div
                key={tick}
                className="absolute top-0 h-full border-l border-border/60"
                style={{ left: `${positions[i]}%` }}
              >
                <div className="absolute -top-0 left-1.5 font-mono text-[9px] tracking-mono text-stone">
                  {tick}
                </div>
              </div>
            );
          })}
          {/* Playhead */}
          <motion.div
            initial={{ left: "0%" }}
            whileInView={{ left: "68%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="absolute top-0 h-full w-0.5 bg-ember"
            style={{ boxShadow: "0 0 12px rgba(194,104,61,0.6)" }}
          />
        </div>
      </div>

      {/* Chapters */}
      <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
        {CHAPTERS.map((ch, i) => {
          const Icon = ch.icon;
          return (
            <motion.div
              key={ch.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                delay: i * 0.12,
              }}
              className="group relative bg-card p-6 transition-colors"
            >
              <div className="mb-4 flex items-center justify-between">
                <Icon className="h-4 w-4" style={{ color: ch.color }} />
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  {ch.eyebrow}
                </span>
              </div>
              <div className="font-body-serif italic text-sm text-bone-muted">
                {ch.label}
              </div>
              <h3 className="mt-2 font-subsection text-lg leading-snug text-bone">
                {ch.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                {ch.body}
              </p>
              <div
                className="mt-6 h-px w-full"
                style={{
                  background: `linear-gradient(to right, ${ch.color}, transparent)`,
                }}
              />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
