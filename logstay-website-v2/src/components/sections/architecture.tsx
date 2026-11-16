"use client";

import { motion } from "framer-motion";
import { Layers, Palette, Box, Cpu, Database, Zap } from "lucide-react";

/**
 * ArchitectureSection — Phase 3 preview.
 * Shows the four-layer technical stack + easing tokens.
 */
const STACK_LAYERS = [
  {
    icon: Layers,
    name: "Framework",
    value: "Next.js 16 · App Router",
    detail: "React Server Components + client islands for motion-heavy components.",
    color: "#C2683D",
  },
  {
    icon: Zap,
    name: "Motion Pipeline",
    value: "Lenis · GSAP · Motion · View Transitions",
    detail: "Four-tool orchestration. Single scroll listener per frame. 60–120fps target.",
    color: "#E89968",
  },
  {
    icon: Box,
    name: "WebGL Layer",
    value: "Raw WebGL (Hearth) · R3F (Stay Story)",
    detail: "Sub-60kb ambient aurora shader. R3F route-split for stay detail parallax only.",
    color: "#B89A6E",
  },
  {
    icon: Cpu,
    name: "State",
    value: "TanStack Query · Zustand · Jotai",
    detail: "Server state SWR 30s. UI ephemeral. Bed atoms via atomFamily for fine-grained subs.",
    color: "#6B7A5A",
  },
  {
    icon: Database,
    name: "Data & Offline",
    value: "Supabase RPC · IndexedDB outbox",
    detail: "Same RLS + SECURITY DEFINER contract as LogStay mobile. Mirrors SQLite outbox pattern.",
    color: "#8A7E6C",
  },
  {
    icon: Palette,
    name: "Design Tokens",
    value: "10 palette roles · 4 status · 6 easing",
    detail: "Hard-coded values treated as defects. Token-lint in CI. Single contract between design and code.",
    color: "#D8CDB8",
  },
];

const EASING_TOKENS = [
  { name: "ease-out-soft", value: "cubic-bezier(0.22, 1, 0.36, 1)", use: "Default reveal · 280ms" },
  { name: "ease-in-out-cinema", value: "cubic-bezier(0.65, 0, 0.35, 1)", use: "Chapter transitions · 420ms" },
  { name: "ease-out-expo", value: "cubic-bezier(0.16, 1, 0.3, 1)", use: "Hero reveal · 640ms" },
  { name: "spring-bed", value: "stiffness 320 / damping 28", use: "Bed Matrix Morph · ~360ms" },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember">
          Phase 3 · Frontend Technical Architecture
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          The stack that carries <span className="italic text-ember">Atelier Noir</span> at 60–120fps.
        </h2>
        <p className="mt-4 max-w-2xl font-body-serif text-base text-stone">
          Six layers, four tools, one discipline: no two animation libraries may touch the same
          property on the same frame.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STACK_LAYERS.map((layer, i) => {
          const Icon = layer.icon;
          return (
            <motion.div
              key={layer.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
              className="group rounded-md border border-border bg-card p-6 transition-colors hover:border-ember/40"
            >
              <div className="mb-4 flex items-center justify-between">
                <Icon className="h-4 w-4" style={{ color: layer.color }} />
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  L · 0{i + 1}
                </span>
              </div>
              <div className="mb-2 font-mono text-[10px] tracking-mono text-stone">
                {layer.name.toUpperCase()}
              </div>
              <div className="font-subsection text-base leading-tight text-bone">
                {layer.value}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                {layer.detail}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Easing tokens table */}
      <div className="mt-16 overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-popover/50 px-6 py-4">
          <div className="font-mono text-[10px] tracking-mono text-ember">
            MOTION TOKENS · 04
          </div>
          <div className="mt-1 font-subsection text-lg text-bone">
            Easing curve reference
          </div>
        </div>
        <div className="divide-y divide-border">
          {EASING_TOKENS.map((token) => (
            <div
              key={token.name}
              className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-3 md:items-center"
            >
              <div className="font-mono text-sm text-ember-light">{token.name}</div>
              <div className="font-mono text-xs text-bone-muted">{token.value}</div>
              <div className="font-mono text-[10px] tracking-mono text-stone">
                {token.use}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
