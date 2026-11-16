"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * StatStrip — JetBrains Mono numeric row counting up on reveal.
 * Throttled to 30fps to avoid jank.
 */
export function StatStrip({
  stats,
}: {
  stats: { label: string; value: number; prefix?: string; suffix?: string; color?: string }[];
}) {
  return (
    <section className="relative z-10 border-y border-border bg-popover/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-border md:grid-cols-4">
        {stats.map((s, i) => (
          <CountUp key={s.label} stat={s} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}

function CountUp({
  stat,
  delay,
}: {
  stat: { label: string; value: number; prefix?: string; suffix?: string; color?: string };
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out-expo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(stat.value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, stat.value]);

  const value = Math.round(display);
  const formatted =
    stat.value >= 1000 ? value.toLocaleString("en-IN") : value.toString();

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
      className="px-6 py-8 text-center md:px-8 md:py-10"
    >
      <div
        className="font-mono text-3xl tabular-nums md:text-5xl"
        style={{ color: stat.color || "var(--bone)" }}
      >
        {stat.prefix}
        {formatted}
        {stat.suffix}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-mono text-stone">
        {stat.label}
      </div>
    </motion.div>
  );
}
