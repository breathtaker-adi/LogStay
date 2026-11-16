"use client";

import { motion } from "framer-motion";
import { ScanLine, BedDouble, CheckCircle2 } from "lucide-react";

/**
 * HowItWorksSection — The 3-second check-in journey.
 * Sales-focused 3-step product showcase.
 */
const STEPS = [
  {
    num: "01",
    icon: ScanLine,
    title: "Point the camera at the passport.",
    body: "Open LogStay and hold your phone over the passport's photo page. In 120 milliseconds, the guest's name, nationality, passport ID, and birthdate are captured automatically with 100% optical precision. Zero typing, zero spelling errors.",
    detail: "120ms scan · works 100% offline",
    color: "#C2683D",
  },
  {
    num: "02",
    icon: BedDouble,
    title: "Tap the room or dorm bed.",
    body: "Your live visual room grid is right on your screen. Tap any vacant room or dorm bunk to assign it. The status instantly flips to Occupied across every device on your property with zero lag.",
    detail: "1 tap · syncs across all staff devices",
    color: "#E89968",
  },
  {
    num: "03",
    icon: CheckCircle2,
    title: "Confirm. Receipt sent to WhatsApp.",
    body: "Select cash, card, or pre-paid booking and tap confirm. LogStay generates an encrypted digital PDF receipt and delivers it straight to the guest's WhatsApp. No printer paper, no jammed ink, no lost receipts.",
    detail: "Instant digital receipt · 98% open rate",
    color: "#5B8C67",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          The 3-second check-in
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Three taps. <span className="italic text-ember-readable">That's your whole check-in.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          Your newest seasonal receptionist reaches full operational speed on day one.
          No multi-level desktop menus. No 18-field manual forms. No printer jams.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06),0_2px_6px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.12),0_8px_16px_-4px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.8)] hover:border-ember/40"
            >
              {/* Big number watermark fully contained within the card */}
              <div
                className="pointer-events-none absolute right-4 top-3 select-none font-display text-7xl font-bold leading-none opacity-[0.08] dark:opacity-10 transition-opacity duration-300 group-hover:opacity-15 md:text-8xl"
                style={{ color: step.color }}
                aria-hidden
              >
                {step.num}
              </div>

              <div>
                <div
                  className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
                  style={{ borderColor: `${step.color}55`, background: `${step.color}15` }}
                >
                  <Icon className="h-5 w-5" style={{ color: step.color }} />
                </div>

                <div className="mb-2 font-mono text-[10px] font-bold tracking-widest uppercase text-stone">
                  Step {step.num}
                </div>
                <h3 className="font-subsection text-xl font-bold leading-snug text-bone">
                  {step.title}
                </h3>
                <p className="mt-3 font-body-serif text-sm leading-relaxed text-stone">
                  {step.body}
                </p>
              </div>

              <div
                className="mt-6 inline-flex w-fit items-center rounded-full border px-3 py-1 font-mono text-[10px] tracking-mono font-medium"
                style={{ borderColor: `${step.color}55`, color: step.color, background: `${step.color}08` }}
              >
                {step.detail}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
