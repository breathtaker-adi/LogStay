"use client";

import { motion } from "framer-motion";
import { Crown, Users, ConciergeBell, Sparkles } from "lucide-react";

/**
 * PersonasSection — The 4 roles LogStay serves.
 * High-impact sales framing showing how every team member wins.
 */
const PERSONAS = [
  {
    icon: Crown,
    role: "For the Property Owner",
    title: "Complete peace of mind from anywhere in the world.",
    body: "Real-time occupancy and revenue on your phone. Instant push alerts if a cash drawer has a variance. Zero stress over missing cash or lost booking revenue, whether you are on property or traveling abroad.",
    impact: "Recovers 5–9% leaked profit annually",
    color: "#C2683D",
  },
  {
    icon: Users,
    role: "For the General Manager",
    title: "Reclaim 15+ hours every week from paperwork.",
    body: "End manual shift tallying and dispute resolution. Shift handovers are verified automatically. Adjust seasonal rates in one tap, and export official Form C foreign registration without tedious manual data entry.",
    impact: "15+ hours saved every week",
    color: "#E89968",
  },
  {
    icon: ConciergeBell,
    role: "For Front Desk Staff",
    title: "Check in guests faster than they put down their bags.",
    body: "Three-second optical passport scans. Tap to assign any bed on a visual floor grid. Digital receipts delivered straight to WhatsApp. Even when the Wi-Fi completely dies in a storm, reception never slows down.",
    impact: "Zero reception lines & zero typos",
    color: "#B89A6E",
  },
  {
    icon: Sparkles,
    role: "For Housekeeping Teams",
    title: "Turn rooms 35% faster with zero hallway shouting.",
    body: "A clean, distraction-free priority queue right on the cleaner's phone. Tap to mark a room clean, and front desk sees the room turn green instantly. No more confusion over which room is ready for arrivals.",
    impact: "35% faster room turnover speed",
    color: "#5B8C67",
  },
];

export function PersonasSection() {
  return (
    <section id="who-its-for" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          Who it's for
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Built for the four people <span className="italic text-ember-readable">who actually run your property.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Each team member gets a focused, distraction-free view designed for their exact workflow.
          Zero confusing clutter, and total operational harmony.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PERSONAS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.role}
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
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-mono uppercase"
                    style={{ background: `${p.color}15`, color: p.color }}
                  >
                    {p.role}
                  </span>
                  <h3 className="mt-2.5 font-subsection text-lg font-bold leading-snug text-bone">
                    {p.title}
                  </h3>
                  <p className="mt-3 font-body-serif text-sm leading-relaxed text-stone">
                    {p.body}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/80 pt-4">
                <span className="font-mono text-xs font-semibold" style={{ color: p.color }}>
                  {p.impact}
                </span>
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  Role-isolated view
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
