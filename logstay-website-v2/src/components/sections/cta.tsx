"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

/**
 * CTASection — Final high-converting sales close.
 */
export function CTASection() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-ember/30 bg-card p-10 text-center shadow-[0_8px_32px_-8px_rgba(194,104,61,0.15)] md:p-20"
      >
        {/* Glow background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(194,104,61,0.2), transparent 70%), radial-gradient(ellipse 50% 40% at 50% 0%, rgba(232,153,104,0.08), transparent 60%)",
          }}
        />
        {/* Grid floor */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh] grid-floor opacity-30" />

        <div className="relative">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-4 py-1.5 backdrop-blur-md shadow-sm">
              <img src="/LogStay/logo.svg" alt="LogStay" className="h-5 w-5 rounded-md" />
              <span className="font-mono text-xs font-semibold tracking-mono text-foreground">LogStay</span>
            </div>
          </div>

          <h2 className="font-display text-4xl leading-[0.95] tracking-tight text-bone md:text-6xl">
            Ready to run your property <br />
            <span className="italic text-gradient-ember">at full speed?</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl font-body-serif text-lg leading-relaxed text-bone-muted">
            Download LogStay onto any smartphone in under 8 minutes. Check in your first guest in 3 seconds.
            Eliminate cash leaks and stop paying monthly per-bed software taxes forever.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <MagneticButton
              as="a"
              href="https://github.com/breathtaker-adi/LogStay"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-ember bg-ember px-8 py-4 font-mono text-xs font-semibold tracking-mono text-white transition-all hover:bg-ember-bright hover:shadow-[0_0_24px_rgba(194,104,61,0.5)]"
            >
              <span>Download LogStay</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </MagneticButton>

            <MagneticButton
              as="a"
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-8 py-4 font-mono text-xs font-semibold tracking-mono text-foreground backdrop-blur shadow-sm transition-all hover:border-ember/50 hover:text-foreground"
              strength={0.25}
            >
              See Check-In Demo
            </MagneticButton>
          </div>

          {/* Bottom assurance */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-5 font-mono text-xs text-stone">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
              <span>Free to start</span>
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
              <span>Runs on any iOS &amp; Android handset</span>
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-ember" />
              <span>Zero server maintenance</span>
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
