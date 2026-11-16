"use client";

import { motion } from "framer-motion";
import { ArrowDown, ScanLine, Sparkles, CheckCircle2 } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

/**
 * Hero — LogStay's first viewport.
 * High-converting product showcase hero highlighting 3-second passport check-in,
 * 100% offline reliability, and zero cloud extortion fees.
 */
export function Hero() {
  const line1 = ["Your front desk,"];
  const line2 = ["always", "open."];

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12">
      {/* Layered background — exact original from zip */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {/* Base aurora gradients */}
        <div className="absolute inset-0 aurora-bg" />
        {/* Perspective grid floor */}
        <div className="absolute inset-x-0 bottom-0 h-[60vh] grid-floor opacity-60" />
        {/* Top vignette to deepen the sky */}
        <div
          className="absolute inset-x-0 top-0 h-[40vh]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(14,12,10,0.9), transparent)",
          }}
        />
        {/* Bottom fade into page bg */}
        <div
          className="absolute inset-x-0 bottom-0 h-[30vh]"
          style={{
            background:
              "linear-gradient(to top, var(--background), transparent)",
          }}
        />
        {/* Film grain */}
        <div className="absolute inset-0 grain" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Hero headline */}
        <h1 className="font-display max-w-5xl text-5xl leading-[0.95] tracking-tight text-bone sm:text-7xl md:text-8xl">
          {line1.map((word, i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.64,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.15 + i * 0.08,
              }}
              className="block"
            >
              {word}
            </motion.span>
          ))}
          <span className="block">
            {line2.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.64,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.3 + i * 0.1,
                }}
                className="mr-[0.25em] inline-block"
              >
                {word === "open." ? (
                  <span className="italic text-gradient-ember">{word}</span>
                ) : (
                  word
                )}
              </motion.span>
            ))}
          </span>
        </h1>

        {/* High-impact sales subhead */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.55 }}
          className="mt-8 max-w-2xl font-body-serif text-lg leading-relaxed text-bone-muted md:text-xl"
        >
          Check in guests in 3 seconds, eliminate front desk cash leaks, and run your entire property
          100% offline. Built for hostels, guesthouses, and boutique hotels that refuse to lose bookings to dropped Wi-Fi.
        </motion.p>

        {/* CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.75 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <MagneticButton
            as="a"
            href="#how-it-works"
            className="group inline-flex items-center gap-2 rounded-full border border-ember bg-ember px-7 py-3.5 font-mono text-xs font-semibold tracking-mono text-white transition-all hover:bg-ember-bright hover:shadow-[0_0_20px_rgba(194,104,61,0.4)]"
          >
            <ScanLine className="h-4 w-4" />
            See the 3-Second Check-In
          </MagneticButton>
          <MagneticButton
            as="a"
            href="#rooms"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-7 py-3.5 font-mono text-xs font-semibold tracking-mono text-foreground backdrop-blur shadow-sm transition-all hover:border-ember/60 hover:text-foreground"
            strength={0.25}
          >
            Explore Live Room Grid
          </MagneticButton>
        </motion.div>

        {/* Value proof points */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.95 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-6 font-mono text-xs text-stone"
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
            <span>3-Second Passport Scan</span>
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
            <span>100% Works Offline</span>
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
            <span>Zero Per-Bed Monthly Fees</span>
          </span>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.a
        href="#problem"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
        className="absolute bottom-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-mono text-stone hover:text-ember transition-colors"
        aria-label="Scroll down"
      >
        <span>Explore the platform</span>
        <ArrowDown className="h-3 w-3 animate-bounce" />
      </motion.a>
    </section>
  );
}
