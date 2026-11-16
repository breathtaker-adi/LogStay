"use client";

import { ArrowUp, Github } from "lucide-react";
import { MagneticButton } from "@/components/magnetic-button";

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-border bg-popover/40">
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand col */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full bg-ember"
                style={{ boxShadow: "0 0 10px rgba(194,104,61,0.6)" }}
              />
              <span className="font-display text-xl text-bone">LogStay</span>
            </div>
            <p className="mt-3 max-w-sm font-body-serif italic text-sm text-stone">
              The offline-native operating system for modern hospitality.
              Your front desk, always open.
            </p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] tracking-mono text-stone">
              <span>iOS 15+</span>
              <span className="text-border">·</span>
              <span>Android 9+</span>
              <span className="text-border">·</span>
              <span>Any budget smartphone</span>
            </div>
          </div>

          {/* Explore col */}
          <div>
            <div className="mb-3 font-mono text-[10px] tracking-mono text-stone">
              Explore
            </div>
            <ul className="space-y-2 font-mono text-xs">
              {[
                ["#problem", "The problem"],
                ["#pillars", "What makes it different"],
                ["#how-it-works", "How check-in works"],
                ["#scan-demo", "Try the passport scan"],
                ["#rooms", "See the room grid"],
                ["#who-its-for", "Who it's for"],
                ["#comparison", "Compare alternatives"],
                ["#faq", "Questions"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-bone-muted transition-colors hover:text-ember-readable"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Meta col */}
          <div>
            <div className="mb-3 font-mono text-[10px] tracking-mono text-stone">
              The numbers
            </div>
            <ul className="space-y-2 font-mono text-xs text-bone-muted">
              <li><span className="text-ember-readable">3 sec</span> &nbsp;passport check-in</li>
              <li><span className="text-ember-readable">0 ms</span> &nbsp;response time</li>
              <li><span className="text-ember-readable">$0</span> &nbsp;cost per scan</li>
              <li><span className="text-ember-readable">10 min</span> &nbsp;set up time</li>
              <li><span className="text-ember-readable">100%</span> &nbsp;works offline</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row">
          <div className="font-mono text-[10px] tracking-mono text-stone">
            LogStay · The offline-native hospitality OS · 2026
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/breathtaker-adi/LogStay"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] tracking-mono text-stone hover:text-ember-readable"
            >
              <Github className="inline h-3 w-3" /> Source
            </a>
            <MagneticButton
              as="a"
              href="#top"
              strength={0.3}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-[10px] tracking-mono text-stone transition-colors hover:border-ember/50 hover:text-bone"
            >
              <ArrowUp className="h-3 w-3" /> Top
            </MagneticButton>
          </div>
        </div>
      </div>
    </footer>
  );
}
