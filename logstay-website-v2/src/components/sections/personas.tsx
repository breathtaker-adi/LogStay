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

      <div className="grid gap-4 md:grid-cols-2">
        {PERSONAS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.role}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-md border border-border bg-card p-6 md:p-8"
            >
              <div className="flex items-start gap-5">
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border"
                  style={{ borderColor: `${p.color}55`, background: `${p.color}15` }}
                >
                  <Icon className="h-5 w-5" style={{ color: p.color }} />
                </div>
                <div className="flex-1">
                  <div className="font-mono text-[10px] tracking-mono text-stone">
                    {p.role}
                  </div>
                  <h3 className="mt-1 font-subsection text-lg leading-snug text-bone">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone">
                    {p.body}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  The business impact
                </span>
                <span
                  className="font-mono text-sm"
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
