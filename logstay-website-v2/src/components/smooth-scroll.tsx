"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * SmoothScroll — wraps the application in a Lenis instance.
 *
 * - lerp 0.10, duration 1.2s (matches spec token lenis-scroll)
 * - Decoupled from GSAP/Motion — single scroll listener per frame.
 * - Falls back to native scroll on prefers-reduced-motion.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // Expose globally so other components (Stay Story scroll, etc) can sync
    (window as unknown as { lenis?: Lenis }).lenis = lenis;

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      delete (window as unknown as { lenis?: Lenis }).lenis;
    };
  }, []);

  return <>{children}</>;
}
