"use client";

import { Hearth } from "@/components/hearth";
import { EmberParticles } from "@/components/ember-particles";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ThemeToggle } from "@/components/theme-toggle";
import { Hero } from "@/components/sections/hero";
import { StatStrip } from "@/components/sections/stat-strip";
import { ProblemSection } from "@/components/sections/problem";
import { PillarsSection } from "@/components/sections/pillars";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { PassportScanDemo } from "@/components/sections/passport-scan-demo";
import { RoomGrid } from "@/components/room-grid";
import { PersonasSection } from "@/components/sections/personas";
import { ComparisonSection } from "@/components/sections/comparison";
import { LifecycleSection } from "@/components/sections/lifecycle";
import { FAQSection } from "@/components/sections/faq";
import { CTASection } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <SmoothScroll>
      <div
        id="top"
        className="relative flex min-h-screen flex-col bg-background text-foreground"
      >
        {/* Ambient Hearth aurora — fixed full-viewport background */}
        <Hearth occupancy={0.55} timeOfDay={19} />

        {/* Floating ember particles for atmosphere */}
        <EmberParticles count={28} />

        {/* Subtle grid overlay on lower half */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 grid-bg opacity-30"
        />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Hero — first viewport */}
        <Hero />

        {/* Stat strip — count-up reveal with LogStay's key numbers */}
        <StatStrip
          stats={[
            { label: "Front desk check-in speed", value: 3, suffix: " sec", color: "var(--ember-text)" },
            { label: "Instant tap response time", value: 0, suffix: " ms", color: "var(--ember-text)" },
            { label: "Third-party scan fees", value: 0, prefix: "₹ ", color: "var(--ember-text)" },
            { label: "To set up your property", value: 8, suffix: " min", color: "var(--ember-text)" },
          ]}
        />

        {/* The problem — 4 pain points */}
        <ProblemSection />

        {/* The 5 pillars — what makes LogStay different */}
        <PillarsSection />

        {/* How it works — 3-step check-in */}
        <HowItWorksSection />

        {/* Interactive passport scan demo — try the 3-second check-in */}
        <PassportScanDemo />

        {/* Live room grid — the interactive demo */}
        <RoomGrid />

        {/* Who it's for — 4 personas */}
        <PersonasSection />

        {/* Comparison — LogStay vs alternatives */}
        <ComparisonSection />

        {/* A day with LogStay — 5 lifecycle stages */}
        <LifecycleSection />

        {/* FAQ — objection busters */}
        <FAQSection />

        {/* Final CTA */}
        <CTASection />

        {/* Footer */}
        <Footer />
      </div>
    </SmoothScroll>
  );
}
