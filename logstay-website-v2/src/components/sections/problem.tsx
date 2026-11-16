"use client";

import { motion } from "framer-motion";
import { CloudOff, Hand, DollarSign, ShieldAlert } from "lucide-react";

/**
 * ProblemSection — the 4 pain points LogStay solves.
 * Plain language, no technical jargon.
 */
const PROBLEMS = [
  {
    icon: CloudOff,
    title: "The internet goes down. Your desk freezes.",
    body: "Most hotel software stops working the moment the wifi drops. Check-in queues back up. Double-bookings spike. You scribble bookings on paper napkins and hope for the best.",
    stat: "0%",
    statLabel: "of cloud-only tools work offline",
    color: "#C2683D",
  },
  {
    icon: Hand,
    title: "Typing in passport details by hand.",
    body: "A foreign guest arrives. Your clerk types 12 to 18 fields by hand — name, passport number, nationality, dates. A 10-person backpacker group means a 45-minute reception gridlock.",
    stat: "45 min",
    statLabel: "to check in a group of 10",
    color: "#E89968",
  },
  {
    icon: DollarSign,
    title: "Cash goes missing between shifts.",
    body: "Cash is 35–65% of hostel transactions. When shift handovers aren't tracked, uncounted extensions and drawer skimming quietly cost you 4–9% of revenue every year.",
    stat: "4–9%",
    statLabel: "of revenue leaked annually",
    color: "#B89A6E",
  },
  {
    icon: ShieldAlert,
    title: "Guest passports sitting in staff phones.",
    body: "Receptionists photograph foreign passports on their personal phones. When a device is lost or audited, you face ruinous fines under privacy laws — and no way to prove the photos were deleted.",
    stat: "∞",
    statLabel: "liability if photos aren't purged",
    color: "#8A7E6C",
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
          You already know these problems.
          <br />
          <span className="italic text-ember-readable">You just didn't think software could fix them.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Most hospitality software was built between 1995 and 2012 for big
          hotels with stable internet. It doesn't fit a surf camp on a
          Thai island, a guesthouse in the Himalayas, or a boutique resort
          where the monsoon takes the fiber cable down for three days.
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
