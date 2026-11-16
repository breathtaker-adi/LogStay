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
    num: "P—01",
    subtitle: "0MS UI BLOCKING · OFFLINE-NATIVE",
    title: "It works on the phone, not in the cloud.",
    body: "Every tap, check-in, and room assignment runs against an embedded SQLite database on the device itself via synchronous C++ bindings — 0ms blocking. When the internet returns, mutations replicate bidirectionally to Supabase automatically.",
    proof: "0ms response time · zero cloud gatekeeper",
    color: "#C2683D",
  },
  {
    icon: ScanLine,
    num: "P—02",
    subtitle: "120MS EDGE SCAN · $0.00 PER SCAN",
    title: "Scan a passport in 3 seconds.",
    body: "Point the camera at any international passport. Native on-device inference decodes the ICAO 9303 machine-readable zone in 120ms without third-party API fees or internet access. The guest is checked in before they finish saying their name.",
    proof: "120ms optical scan · $0 cost per scan",
    color: "#E89968",
  },
  {
    icon: Radar,
    num: "P—03",
    subtitle: "ANTI-THEFT DRAWER RECONCILIATION",
    title: "Cash that doesn't go missing.",
    body: "At every shift handover, incoming and outgoing clerks co-sign the cash drawer. LogStay evaluates Δ = Physical − (Opening + Inflows − Outflows). Zero variance signs the ledger; any discrepancy locks the handover and alerts the owner instantly.",
    proof: "Catches 100% of cash anomalies",
    color: "#B89A6E",
  },
  {
    icon: ShieldCheck,
    num: "P—04",
    subtitle: "DETERMINISTIC 02:00 UTC AUTO PURGE",
    title: "Guest photos auto-delete at 2 AM.",
    body: "Identity snapshots are temporary verification buffers, not trophies. LogStay permanently shreds expired passport photos from storage, zeroes DB pointers, and records an immutable audit receipt. Your DPDP Act compliance happens while you sleep.",
    proof: "Automated DPDP Act 90-day purge",
    color: "#6B7A5A",
  },
  {
    icon: KeyRound,
    num: "P—05",
    subtitle: "ZERO-PIN · RLS DATABASE SANDBOX",
    title: "Each staff member sees only what they need.",
    body: "Owner, Co-Admin, Front Desk, and Housekeeping — enforced strictly at the PostgreSQL Row Level Security layer. Receptionists cannot see profit margins, admins cannot purge financial ledgers, and housekeeping cannot alter bills. No shared PINs.",
    proof: "Cryptographic invite codes · strict RBAC",
    color: "#D8CDB8",
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
          Five structural pillars. <br />
          <span className="italic text-ember-readable">Not features — physics.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          LogStay isn't a booking widget with an offline mode bolted on. Five load-bearing
          architectural decisions make it an inertial navigation system for hospitality —
          each one verified in production.
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
                    className="flex h-12 w-12 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
                    style={{ borderColor: `${p.color}55`, background: `${p.color}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: p.color }} />
                  </div>
                </div>

                {/* Main title & technical pill */}
                <div>
                  <div className="mb-2 font-mono text-[10px] font-semibold tracking-mono text-stone">
                    {p.subtitle}
                  </div>
                  <h3 className="font-subsection text-2xl font-bold leading-snug text-bone">
                    {p.title}
                  </h3>
                  <div
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-medium tracking-mono"
                    style={{ borderColor: `${p.color}55`, color: p.color, background: `${p.color}08` }}
                  >
                    <span>{p.proof}</span>
                  </div>
                </div>

                {/* Narrative body */}
                <div className="border-t border-border/60 pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                  <p className="text-sm font-light leading-relaxed text-stone">
                    {p.body}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
