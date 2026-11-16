"use client";

import { motion } from "framer-motion";
import { ScanLine, BedDouble, Check } from "lucide-react";

/**
 * HowItWorksSection — the 3-step check-in journey.
 * "Point camera → tap bed → confirm"
 */
const STEPS = [
  {
    num: "01",
    icon: ScanLine,
    title: "Point the camera at the passport.",
    body: "Open LogStay, tap check-in, and hold the phone over the passport's machine-readable zone. In 120 milliseconds the guest's name, nationality, passport number, and dates are filled in automatically — no typing, no typos.",
    detail: "120ms · works fully offline",
    color: "#C2683D",
  },
  {
    num: "02",
    icon: BedDouble,
    title: "Tap the room they're staying in.",
    body: "The room grid is right there. Tap any vacant room or dorm bed to assign it. The status flips to occupied instantly — across every device on the property, in real time.",
    detail: "1 tap · instant everywhere",
    color: "#E89968",
  },
  {
    num: "03",
    icon: Check,
    title: "Confirm. A receipt goes to their WhatsApp.",
    body: "Pick a payment method (cash, card, or pre-paid booking) and tap confirm. LogStay sends an encrypted PDF receipt straight to the guest's WhatsApp. No printer, no paper, no lost chits.",
    detail: "Digital receipt · 98% open rate",
    color: "#B89A6E",
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
          Three taps. <span className="italic text-ember-readable">That's the whole check-in.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          A new receptionist reaches full operational speed in 15 minutes.
          No multi-level menus. No 18-field forms. No printer jams.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
              className="relative rounded-md border border-border bg-card p-6 md:p-8"
            >
              {/* Big number ghost */}
              <div
                className="absolute -right-2 -top-4 font-display text-8xl leading-none opacity-10 select-none"
                style={{ color: step.color }}
                aria-hidden
              >
                {step.num}
              </div>

              <div
                className="mb-6 flex h-12 w-12 items-center justify-center rounded-md border"
                style={{ borderColor: `${step.color}55`, background: `${step.color}15` }}
              >
                <Icon className="h-5 w-5" style={{ color: step.color }} />
              </div>

              <div className="mb-2 font-mono text-[10px] tracking-mono text-stone">
                Step {step.num}
              </div>
              <h3 className="font-subsection text-xl leading-snug text-bone">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                {step.body}
              </p>

              <div
                className="mt-6 inline-block rounded-full border px-3 py-1 font-mono text-[10px] tracking-mono"
                style={{ borderColor: `${step.color}55`, color: step.color }}
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
