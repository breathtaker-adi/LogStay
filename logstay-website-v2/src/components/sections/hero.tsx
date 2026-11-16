"use client";

import { motion } from "framer-motion";
import { ArrowDown, ScanLine } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

/**
 * Hero — LogStay's first viewport.
 *
 * Premium dark hero with:
 * - Multi-layered background: aurora + perspective grid floor + ember particles
 * - Fraunces display headline with gradient ember accent
 * - Magnetic CTAs
 * - Offline-native messaging
 */
export function Hero() {
  const line1 = ["Your front desk,"];
  const line2 = ["always", "open."];

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12">
      {/* Layered background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {/* Base aurora gradients in dark mode */}
        <div className="absolute inset-0 aurora-bg hidden dark:block" />
        {/* Subtle light mesh in light mode */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50/60 via-white to-white dark:hidden" />
        {/* Perspective grid floor */}
        <div className="absolute inset-x-0 bottom-0 h-[60vh] grid-floor opacity-30 dark:opacity-60" />
        {/* Top vignette to deepen the sky in dark mode */}
        <div
          className="absolute inset-x-0 top-0 h-[40vh] hidden dark:block"
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
        <div className="absolute inset-0 grain hidden dark:block" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Hero headline — two lines */}
        <h1 className="font-display max-w-5xl text-5xl leading-[0.95] tracking-tight text-bone sm:text-7xl md:text-8xl">
          {line1.map((word, i) => (
            <motion.span
              key={word}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.64,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.2 + i * 0.08,
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
                  delay: 0.4 + i * 0.1,
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

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
          className="mt-8 max-w-xl font-body-serif text-lg text-bone-muted md:text-xl"
        >
          LogStay is the operating system for hostels, guesthouses, and
          boutique hotels. Check in guests with a passport scan, track every
          room in real time, and never lose a night's revenue to a
          dropped internet connection again.
        </motion.p>

        {/* CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
          className="mt-12 flex flex-col items-center gap-4 sm:flex-row"
        >
          <MagneticButton
            as="a"
            href="#how-it-works"
            className="group inline-flex items-center gap-2 rounded-full border border-ember bg-ember px-6 py-3 font-mono text-xs tracking-mono text-background transition-colors hover:bg-ember-bright"
          >
            <ScanLine className="h-3.5 w-3.5" />
            See how it works
          </MagneticButton>
          <MagneticButton
            as="a"
            href="#rooms"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 font-mono text-xs tracking-mono text-bone-muted backdrop-blur transition-colors hover:border-ember/50 hover:text-bone"
            strength={0.25}
          >
            Try the live demo
          </MagneticButton>
        </motion.div>

        {/* Trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="mt-10 flex items-center gap-6 font-mono text-[10px] tracking-mono text-stone"
        >
          <span>3-second check-in</span>
          <span className="text-border">·</span>
          <span>0ms response time</span>
          <span className="text-border">·</span>
          <span>Set up in 10 minutes</span>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.4 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2"
        >
          <span className="font-mono text-[10px] tracking-mono text-stone">
            SCROLL
          </span>
          <ArrowDown className="h-3 w-3 text-stone" />
        </motion.div>
      </motion.div>
    </section>
  );
}
