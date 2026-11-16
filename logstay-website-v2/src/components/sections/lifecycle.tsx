"use client";

import { useRef } from "react";
import { motion, useScroll } from "framer-motion";
import { Rocket, ScanLine, MessageSquare, ArrowLeftRight, Moon, CheckCircle2 } from "lucide-react";

/**
 * LifecycleSection — A Day with LogStay / 04 — OPERATIONAL LIFECYCLE.
 * Follows the index.html pattern with a scroll-animated vertical progress line on the right,
 * sticky headline on the left, and sales-focused narrative stages.
 */
const STAGES = [
  {
    icon: Rocket,
    stage: "DAY 0 · SETUP",
    time: "Morning · Setup",
    title: "Zero-Hardware Launch in Under 8 Minutes",
    body: "Download LogStay onto any commercial smartphone. Add your rooms and dorm beds, set basic rates, and invite your staff with single-use role links. No expensive desktop computers, no bulky scanners, and zero IT technicians required. You're fully operational before lunch.",
    tags: ["< 8 Min Setup", "Any Budget Phone", "Zero Hardware to Buy"],
    color: "#C2683D",
  },
  {
    icon: ScanLine,
    stage: "DAY 1 · INTAKE",
    time: "Afternoon · Arrivals",
    title: "The 3-Second Front Desk Check-In",
    body: "A bus of travelers walks through your door. Hold the camera over a passport — the native engine extracts guest names, passport numbers, nationalities, and dates in 120ms with 100% accuracy. Tap a vacant bed, confirm payment, and an encrypted WhatsApp receipt is already on the guest's phone. No queues, no spelling errors.",
    tags: ["3 Seconds per Guest", "100% Optical Accuracy", "Instant WhatsApp Receipt"],
    color: "#E89968",
  },
  {
    icon: MessageSquare,
    stage: "MID-STAY · OPS",
    time: "Mid-Day · Housekeeping",
    title: "Housekeeping Turnover Loop — 35% Faster",
    body: "11:00 AM checkout flips departing rooms to Dirty automatically. Housekeeping opens their phone and sees a distraction-free queue sorted by check-in priority. One tap on 'Mark Clean' instantly turns the bed green across every receptionist's screen in real time. Zero hallway shouting, zero premature check-ins.",
    tags: ["+35% Turnover Speed", "Real-Time Room Sync", "Clean Role Isolation"],
    color: "#B89A6E",
  },
  {
    icon: ArrowLeftRight,
    stage: "11:00 PM · SHIFT CHANGE",
    time: "Night · Handover",
    title: "Dual-Key Cash Radar — Zero Skimming",
    body: "The outgoing receptionist counts the physical drawer. LogStay cross-checks physical cash against opening float plus every recorded cash receipt. If the drawer balances, the shift closes in one tap. If even $1 is missing, the shift locks, requires written explanation, and alerts the owner immediately. Seal drawer leaks forever.",
    tags: ["Dual Staff Co-Signing", "Instant Variance Alerts", "Zero Cash Leakage"],
    color: "#5B8C67",
  },
  {
    icon: Moon,
    stage: "02:00 AM · NIGHTLY",
    time: "Nightly · Compliance",
    title: "Automated Compliance & Photo Purge While You Sleep",
    body: "Foreign tourist registration (Form C) exports in a single tap with zero government portal headaches. Every night at 02:00 AM, LogStay permanently scrubs expired passport photos from device memory under the DPDP Act 2023, logging immutable cryptographic proof. Wake up 100% audit-proof every morning.",
    tags: ["1-Click Form C Export", "Automated 02:00 AM Shredder", "100% DPDP Act Compliant"],
    color: "#4E7B5C",
  },
];

export function LifecycleSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 75%", "end 80%"],
  });

  return (
    <section id="a-day-with-logstay" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        {/* Left column: Sticky section header & value propositions */}
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
            04 — OPERATIONAL LIFECYCLE
          </div>
          <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
            A day with LogStay. <br />
            <span className="italic text-ember-readable">From sunrise setup to 2 AM purge.</span>
          </h2>
          <p className="mt-5 font-body-serif text-base leading-relaxed text-stone">
            The complete operational loop a property runs on LogStay — five effortless stages
            from initial setup on your phone to automated compliance while the island sleeps.
          </p>

          <div className="mt-8 space-y-3 rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
            <div className="font-mono text-xs font-semibold uppercase tracking-mono text-bone">
              Why Owners Sleep Soundly:
            </div>
            <div className="flex items-center gap-2.5 text-xs text-stone">
              <CheckCircle2 className="h-4 w-4 text-ember flex-shrink-0" />
              <span>Full front desk speed with zero Wi-Fi required</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-stone">
              <CheckCircle2 className="h-4 w-4 text-ember flex-shrink-0" />
              <span>Every cent accounted for with co-signed cash handovers</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-stone">
              <CheckCircle2 className="h-4 w-4 text-ember flex-shrink-0" />
              <span>Zero statutory fines with automated identity shredding</span>
            </div>
          </div>
        </div>

        {/* Right column: Timeline with scroll-animated vertical progress line */}
        <div ref={containerRef} className="relative pl-8 md:pl-12">
          {/* Background track line */}
          <div
            className="absolute left-3 top-3 bottom-8 w-[3px] rounded-full bg-border/60 md:left-4"
            aria-hidden
          />

          {/* Animated progress fill line matching index.html operational lifecycle */}
          <motion.div
            style={{
              scaleY: scrollYProgress,
              transformOrigin: "top",
            }}
            className="absolute left-3 top-3 bottom-8 w-[3px] rounded-full bg-gradient-to-b from-ember via-[#E89968] to-sage shadow-[0_0_12px_rgba(194,104,61,0.5)] md:left-4"
            aria-hidden
          />

          {/* Stage items */}
          <div className="space-y-10">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.stage}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }}
                  className="relative group"
                >
                  {/* Glowing timeline node dot */}
                  <div
                    className="absolute -left-[27px] top-6 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card shadow-sm transition-transform duration-300 group-hover:scale-110 md:-left-[39px] md:h-8 md:w-8"
                    style={{ borderColor: s.color }}
                  >
                    <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" style={{ color: s.color }} />
                  </div>

                  {/* Stage card */}
                  <div className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.12),0_8px_16px_-4px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.8)] hover:border-ember/40">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
                      <div
                        className="font-mono text-xs font-bold tracking-widest uppercase"
                        style={{ color: s.color }}
                      >
                        {s.stage}
                      </div>
                      <div className="font-mono text-[11px] font-medium text-stone">
                        {s.time}
                      </div>
                    </div>

                    <h3 className="mt-4 font-subsection text-xl font-bold leading-snug text-bone">
                      {s.title}
                    </h3>
                    <p className="mt-3 font-body-serif text-sm leading-relaxed text-stone">
                      {s.body}
                    </p>

                    {/* Feature tags */}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {s.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border/90 bg-muted/40 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-mono text-stone"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
