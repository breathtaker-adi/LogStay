"use client";

import { motion } from "framer-motion";
import { Crown, Users, ConciergeBell, Brush } from "lucide-react";

/**
 * PersonasSection — the 4 roles LogStay serves.
 */
const PERSONAS = [
  {
    icon: Crown,
    role: "For the owner",
    title: "Run the property from anywhere.",
    body: "A live multi-property dashboard. Instant push alerts when a cash drawer doesn't balance. Automated compliance logging that holds up in any audit.",
    impact: "Recovers 5–8% leaked margin",
    color: "#C2683D",
  },
  {
    icon: Users,
    role: "For the manager",
    title: "Stop auditing shift sheets by hand.",
    body: "Automatic shift-change reconciliation. One-tap seasonal rate changes. Cryptographic audit trails for every override, so disputes end in seconds, not hours.",
    impact: "15+ hours back every week",
    color: "#E89968",
  },
  {
    icon: ConciergeBell,
    role: "For the front desk",
    title: "End the reception queue.",
    body: "Three-second passport scans. Drag-and-drop bed assignment. WhatsApp PDF receipts. The wifi can drop mid-check-in and nobody notices.",
    impact: "Zero check-in queues",
    color: "#B89A6E",
  },
  {
    icon: Brush,
    role: "For housekeeping",
    title: "Know exactly what to clean next.",
    body: "A distraction-free task queue sorted by urgency. One tap to mark a bed clean — and the front desk instantly sees it's ready for the next guest.",
    impact: "35% faster room turnover",
    color: "#6B7A5A",
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
          Built for the four people <span className="italic text-ember-readable">who actually run the place.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Every role sees a different view of the same property —
          and no one can do something they shouldn't.
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
                    className="inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-mono"
                    style={{ background: `${p.color}15`, color: p.color }}
                  >
                    {p.role}
                  </span>
                  <h3 className="mt-2.5 font-subsection text-lg font-semibold leading-snug text-bone">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone">
                    {p.body}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/80 pt-4">
                <span className="font-mono text-[10px] font-medium tracking-mono text-stone">
                  The business impact
                </span>
                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: p.color }}
                >
                  {p.impact}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
