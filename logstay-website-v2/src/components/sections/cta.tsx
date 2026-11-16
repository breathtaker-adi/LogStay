"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

/**
 * CTASection — final call to action.
 */
export function CTASection() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-lg border border-ember/30 bg-card p-12 text-center md:p-20"
      >
        {/* Glow background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(194,104,61,0.25), transparent 70%), radial-gradient(ellipse 50% 40% at 50% 0%, rgba(232,153,104,0.10), transparent 60%)",
          }}
        />
        {/* Grid floor */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh] grid-floor opacity-40" />

        <div className="relative">
          <div className="mb-6 flex justify-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-3 w-3 rounded-full bg-ember"
              style={{ boxShadow: "0 0 24px rgba(194,104,61,0.8)" }}
            />
          </div>

          <h2 className="font-display text-4xl leading-[0.95] tracking-tight text-bone md:text-6xl">
            Your front desk,
            <br />
            <span className="italic text-gradient-ember">always open.</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl font-body-serif text-lg text-bone-muted">
            Set up LogStay on any phone in under 10 minutes. The first
            check-in takes 3 seconds. The first night, you sleep while
            the compliance work happens.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <MagneticButton
              as="a"
              href="#top"
              className="group inline-flex items-center gap-2 rounded-full border border-ember bg-ember px-7 py-3.5 font-mono text-xs tracking-mono text-background transition-colors hover:bg-ember-bright"
            >
              Get LogStay
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </MagneticButton>
            <MagneticButton
              as="a"
              href="#faq"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-7 py-3.5 font-mono text-xs tracking-mono text-bone-muted backdrop-blur transition-colors hover:border-ember/50 hover:text-bone"
              strength={0.25}
            >
              Read the FAQ first
            </MagneticButton>
          </div>

          <div className="mt-10 flex items-center justify-center gap-6 font-mono text-[10px] tracking-mono text-stone">
            <span>iOS 15+</span>
            <span className="text-border">·</span>
            <span>Android 9+</span>
            <span className="text-border">·</span>
            <span>Any budget smartphone</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
