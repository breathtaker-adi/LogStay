"use client";

import { motion } from "framer-motion";
import { CloudOff, Zap, DollarSign, ShieldAlert } from "lucide-react";

/**
 * ProblemSection — The 4 costly headaches LogStay solves for property owners.
 * Direct, relatable sales messaging that demonstrates immediate ROI.
 */
const PROBLEMS = [
  {
    icon: CloudOff,
    title: "The Wi-Fi drops. Your entire reception paralyzes.",
    body: "Standard cloud systems lock up the moment a storm hits or your local provider glitches. Queues spill out the front door, tired guests get furious, and accidental double-bookings destroy your reviews. LogStay keeps running at full speed with zero internet.",
    stat: "100%",
    statLabel: "operational reliability in offline mode",
    color: "#C2683D",
  },
  {
    icon: Zap,
    title: "Manual passport typing creates 45-minute check-in jams.",
    body: "Typing guest names, passport numbers, birth dates, and nationalities into 18 tiny fields by hand causes constant typos and painful delays. When a minibus of 10 backpackers arrives, your desk is frozen for nearly an hour. LogStay captures everything in 120ms.",
    stat: "3 sec",
    statLabel: "check-in vs 4+ minutes by hand",
    color: "#E89968",
  },
  {
    icon: DollarSign,
    title: "Cash leaks and unrecorded extensions drain your profit.",
    body: "Cash accounts for 40–65% of revenue in budget hospitality. Without mandatory shift reconciliation, untracked cash extensions and drawer skimming silently bleed 5–9% of gross revenue every year. LogStay's dual-key verification catches every cent.",
    stat: "5–9%",
    statLabel: "average annual revenue recovered",
    color: "#B89A6E",
  },
  {
    icon: ShieldAlert,
    title: "Passport photos on personal staff phones are a legal liability.",
    body: "Having receptionists snap passport photos on their personal WhatsApp exposes your property to massive statutory fines under data protection laws. LogStay scans directly on-device and automatically shreds expired photos every night at 2:00 AM.",
    stat: "100%",
    statLabel: "audit-clean compliance guarantee",
    color: "#5B8C67",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          The reality of running a property
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          You already know these headaches.
          <br />
          <span className="italic text-ember-readable">Now you have the software that ends them.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Legacy hotel software was designed in the 2000s for big chain hotels with stable gigabit fiber.
          It was never built for guesthouses, surf camps, or vibrant hostels where staff rotate seasonally
          and monsoons knock out internet cables for days.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PROBLEMS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.12),0_8px_16px_-4px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.8)] hover:border-ember/40"
            >
              {/* Subtle top ambient accent bar on hover */}
              <div
                className="absolute inset-x-0 top-0 h-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `linear-gradient(to right, ${p.color}, transparent)` }}
              />

              <div className="flex items-start gap-5">
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
                  style={{ borderColor: `${p.color}55`, background: `${p.color}15` }}
                >
                  <Icon className="h-5 w-5" style={{ color: p.color }} />
                </div>
                <div className="flex-1">
                  <h3 className="font-subsection text-lg font-semibold leading-snug text-bone">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone">
                    {p.body}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-baseline gap-3 border-t border-border/80 pt-4">
                <span
                  className="font-mono text-3xl font-bold tabular-nums"
                  style={{ color: p.color }}
                >
                  {p.stat}
                </span>
                <span className="font-mono text-[10px] font-medium tracking-mono text-stone">
                  {p.statLabel}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
