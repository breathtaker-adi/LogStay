"use client";

import { motion } from "framer-motion";
import { Rocket, ScanLine, MessageSquare, ArrowLeftRight, Moon } from "lucide-react";

/**
 * LifecycleSection — a day in the life with LogStay.
 * 5 stages: setup → check-in → mid-stay → shift change → nightly audit
 */
const STAGES = [
  {
    icon: Rocket,
    time: "Day 0 · Morning",
    title: "Set up the property in 10 minutes.",
    body: "Download the app. Sign in. Name your rooms and dorm beds. Invite your staff by sending them each a one-time link. By lunchtime, you're live.",
    color: "#C2683D",
  },
  {
    icon: ScanLine,
    time: "Day 1 · Afternoon",
    title: "A backpacker walks in. Check them in.",
    body: "Camera, bed, confirm — done in 3 seconds. Their WhatsApp receives an encrypted receipt before they reach the stairs. The room grid updates everywhere.",
    color: "#E89968",
  },
  {
    icon: MessageSquare,
    time: "Mid-stay · Anytime",
    title: "Housekeeping turns the room over.",
    body: "A guest checks out. The bed goes amber — needs cleaning. Housekeeping sees it at the top of their queue. One tap marks it clean. The front desk instantly sees it's ready for the next arrival.",
    color: "#B89A6E",
  },
  {
    icon: ArrowLeftRight,
    time: "11 PM · Shift change",
    title: "The night clerk takes over.",
    body: "Both clerks count the drawer together. LogStay compares it to the books. If the numbers match, the handover closes in one tap. If they don't, the handover locks until someone writes a note — and your phone buzzes.",
    color: "#6B7A5A",
  },
  {
    icon: Moon,
    time: "2 AM · While you sleep",
    title: "The compliance work happens.",
    body: "Every night at 2 AM, LogStay permanently deletes any passport photos that have passed their legal retention window. The audit log records exactly what was purged. You wake up to a clean, compliant property.",
    color: "#D8CDB8",
  },
];

export function LifecycleSection() {
  return (
    <section id="a-day-with-logstay" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          A day with LogStay
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          From setup at sunrise <span className="italic text-ember-readable">to the 2 AM purge.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          The whole property, run from a phone, across a single day.
        </p>
      </div>

      {/* Vertical timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div
          className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-ember via-ember/40 to-transparent md:left-[27px]"
          aria-hidden
        />

        <div className="space-y-6">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <motion.div
                key={stage.time}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }}
                className="relative flex gap-6 md:gap-8"
              >
                {/* Node */}
                <div
                  className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 md:h-14 md:w-14"
                  style={{
                    borderColor: stage.color,
                    background: "var(--background)",
                  }}
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" style={{ color: stage.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 rounded-md border border-border bg-card p-5 md:p-6">
                  <div className="mb-2 font-mono text-[10px] tracking-mono text-stone">
                    {stage.time}
                  </div>
                  <h3 className="font-subsection text-lg leading-snug text-bone">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone">
                    {stage.body}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
