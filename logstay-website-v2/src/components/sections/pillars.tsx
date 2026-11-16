"use client";

import { motion } from "framer-motion";
import { Database, ScanLine, Radar, ShieldCheck, KeyRound } from "lucide-react";

/**
 * PillarsSection — the 5 things that make LogStay different.
 * Plain language translation of the technical pillars.
 */
const PILLARS = [
  {
    icon: Database,
    num: "01",
    title: "It works on the phone, not in the cloud.",
    body: "Every tap, check-in, and room assignment runs against a local database on the device itself. Zero waiting on a server. When the internet comes back, everything syncs up automatically.",
    proof: "0ms response time",
    color: "#C2683D",
  },
  {
    icon: ScanLine,
    num: "02",
    title: "Scan a passport in 3 seconds.",
    body: "Point the camera at any passport. The phone reads the machine-readable zone itself — no typing, no cloud OCR fees, no waiting. The guest is checked in before they finish saying their name.",
    proof: "120ms scan · $0 per scan",
    color: "#E89968",
  },
  {
    icon: Radar,
    num: "03",
    title: "Cash that doesn't go missing.",
    body: "At every shift handover, the incoming and outgoing clerks count the drawer. LogStay compares it to what the books say. If the numbers don't match, the handover locks until someone explains the gap — and the owner gets a push notification.",
    proof: "Catches every discrepancy",
    color: "#B89A6E",
  },
  {
    icon: ShieldCheck,
    num: "04",
    title: "Guest photos auto-delete at 2 AM.",
    body: "Every night at 2 AM, LogStay permanently shreds any passport photos that have passed their legal retention window. The audit log records exactly what was deleted and when. You sleep; the compliance work happens.",
    proof: "Automated 72-hour purge",
    color: "#6B7A5A",
  },
  {
    icon: KeyRound,
    num: "05",
    title: "Each staff member sees only what they need.",
    body: "Four roles — Owner, Manager, Front Desk, Housekeeping — each with their own access. The front desk can't see your profit margins. Housekeeping can't change a bill. Nobody shares a PIN.",
    proof: "No shared PINs · no shortcuts",
    color: "#D8CDB8",
  },
];

export function PillarsSection() {
  return (
    <section id="pillars" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          What makes LogStay different
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Five things you can't get <span className="italic text-ember-readable">from any other tool.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          These aren't features bolted onto a cloud app. They're the
          five structural decisions LogStay was built around — and each one
          exists because the alternative didn't work in the field.
        </p>
      </div>

      <div className="space-y-4">
        {PILLARS.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.num}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
              className="group grid gap-6 rounded-md border border-border bg-card p-6 md:grid-cols-[80px_1fr_auto] md:items-center md:p-8"
            >
              {/* Number + icon */}
              <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
                <span
                  className="font-mono text-3xl tabular-nums"
                  style={{ color: p.color }}
                >
                  {p.num}
                </span>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-md border"
                  style={{ borderColor: `${p.color}55`, background: `${p.color}15` }}
                >
                  <Icon className="h-4 w-4" style={{ color: p.color }} />
                </div>
              </div>

              {/* Text */}
              <div>
                <h3 className="font-subsection text-xl leading-snug text-bone">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone">
                  {p.body}
                </p>
              </div>

              {/* Proof */}
              <div className="border-l border-border pl-4 md:pl-6">
                <div className="font-mono text-[10px] tracking-mono text-stone">
                  The proof
                </div>
                <div
                  className="mt-1 font-mono text-sm"
                  style={{ color: p.color }}
                >
                  {p.proof}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
