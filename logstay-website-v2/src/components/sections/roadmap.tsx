"use client";

import { motion } from "framer-motion";

/**
 * RoadmapSection — Phase 5 condensed.
 * Four sprints with task IDs, deliverables, exit criteria.
 */
const SPRINTS = [
  {
    id: "S1",
    title: "Foundation",
    subtitle: "Tokens · Type · Layout Engine",
    color: "#C2683D",
    tasks: [
      { id: "S1-T1", name: "Design tokens as CSS custom properties", done: true },
      { id: "S1-T2", name: "Font registration — Fraunces / Inter / JetBrains Mono", done: true },
      { id: "S1-T3", name: "12-column fluid grid system", done: true },
      { id: "S1-T4", name: "Dark / light mode toggle", done: true },
      { id: "S1-T5", name: "Primitive components", done: false },
      { id: "S1-T6", name: "Next.js 16 + Supabase client init", done: true },
    ],
    exit: "Storybook instance rendering every token + primitive in both modes.",
  },
  {
    id: "S2",
    title: "Motion Primitives",
    subtitle: "Smooth scroll · WebGL · View Transitions",
    color: "#E89968",
    tasks: [
      { id: "S2-T1", name: "Lenis smooth scroll wrapper (lerp 0.10)", done: true },
      { id: "S2-T2", name: "GSAP ScrollTrigger on Lenis events", done: false },
      { id: "S2-T3", name: "Motion spring presets — spring-bed/card/soft", done: true },
      { id: "S2-T4", name: "Raw WebGL Hearth shader (<60kb, 30fps)", done: true },
      { id: "S2-T5", name: "View Transitions API route cross-fade", done: false },
      { id: "S2-T6", name: "Performance budget enforcement — Lighthouse CI", done: false },
    ],
    exit: "/motion-lab demo route exercising all four tools.",
  },
  {
    id: "S3",
    title: "Core Page Features",
    subtitle: "Hero · Explorer · Stay · Dashboard",
    color: "#B89A6E",
    tasks: [
      { id: "S3-T1", name: "Landing — hero + editorial cards + magnetic CTA", done: true },
      { id: "S3-T2", name: "Explorer — Bed Matrix Morph + orbital stay card", done: true },
      { id: "S3-T3", name: "Stay Detail — Stay Story Scroll (4 chapters pinned)", done: false },
      { id: "S3-T4", name: "Dashboard — heatmap + sparklines + recon queue", done: true },
      { id: "S3-T5", name: "Forms — React Hook Form + Zod, optimistic mutations", done: false },
      { id: "S3-T6", name: "Service worker + IndexedDB outbox", done: false },
    ],
    exit: "Deployable preview with real auth data on all four routes.",
  },
  {
    id: "S4",
    title: "Polish & Performance",
    subtitle: "Micro-animation · A11y · Benchmarking",
    color: "#6B7A5A",
    tasks: [
      { id: "S4-T1", name: "Micro-animations — hover ticks, focus rings, pulses", done: false },
      { id: "S4-T2", name: "Sound design — optional subtle hover ticks", done: false },
      { id: "S4-T3", name: "Lighthouse + Core Web Vitals benchmark", done: false },
      { id: "S4-T4", name: "WCAG 2.2 AA accessibility audit", done: false },
      { id: "S4-T5", name: "Reduced-motion fallback pass", done: true },
      { id: "S4-T6", name: "Role chrome — RBAC affordances surfaced visually", done: false },
      { id: "S4-T7", name: "Production deployment + monitoring", done: false },
    ],
    exit: "Lighthouse 95+ on all 4 routes · WCAG 2.2 AA · reduced-motion parity.",
  },
];

export function RoadmapSection() {
  return (
    <section id="roadmap" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember">
          Phase 5 · Implementation Roadmap
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Four sprints. Each one a <span className="italic text-ember">complete artifact.</span>
        </h2>
        <p className="mt-4 max-w-2xl font-body-serif text-base text-stone">
          No sprint ships until its predecessor's exit criteria are met.
          The discipline: each sprint produces a demonstrable checkpoint.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {SPRINTS.map((sprint, i) => {
          const doneCount = sprint.tasks.filter((t) => t.done).length;
          const pct = Math.round((doneCount / sprint.tasks.length) * 100);
          return (
            <motion.div
              key={sprint.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }}
              className="rounded-md border border-border bg-card p-6"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono text-2xl tabular-nums"
                      style={{ color: sprint.color }}
                    >
                      {sprint.id}
                    </span>
                    <div>
                      <div className="font-subsection text-lg text-bone">
                        {sprint.title}
                      </div>
                      <div className="font-mono text-[10px] tracking-mono text-stone">
                        {sprint.subtitle}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-mono text-2xl tabular-nums"
                    style={{ color: sprint.color }}
                  >
                    {pct}%
                  </div>
                  <div className="font-mono text-[9px] tracking-mono text-stone">
                    {doneCount}/{sprint.tasks.length}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-4 h-1 overflow-hidden rounded-full bg-border">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  className="h-full rounded-full"
                  style={{ background: sprint.color }}
                />
              </div>

              <ul className="space-y-1.5">
                {sprint.tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 font-mono text-xs"
                  >
                    <span
                      className={`inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm border ${
                        task.done
                          ? "border-ember bg-ember/20"
                          : "border-border"
                      }`}
                    >
                      {task.done && (
                        <svg
                          viewBox="0 0 8 8"
                          className="h-2 w-2"
                          fill="none"
                          stroke={sprint.color}
                          strokeWidth="1.5"
                        >
                          <path d="M1 4 L3 6 L7 2" />
                        </svg>
                      )}
                    </span>
                    <span className="text-stone">{task.id}</span>
                    <span className={task.done ? "text-bone-muted" : "text-stone"}>
                      {task.name}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-border pt-3">
                <div className="font-mono text-[9px] tracking-mono text-stone">
                  EXIT CRITERION
                </div>
                <div className="mt-1 font-body-serif italic text-sm text-bone-muted">
                  {sprint.exit}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
