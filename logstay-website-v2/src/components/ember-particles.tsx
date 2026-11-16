"use client";

import { useEffect, useRef } from "react";

/**
 * EmberParticles — floating ember sparks rising slowly upward.
 * Canvas-based, lightweight, pauses on reduced-motion and tab hidden.
 */
export function EmberParticles({ count = 30 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // Seeded particle field (deterministic — no hydration mismatch)
    const particles = Array.from({ length: count }, (_, i) => {
      const seed = i * 9301 + 49297;
      const rand = (n: number) => ((Math.sin(seed * n) + 1) / 2);
      return {
        x: rand(0.1) * W(),
        y: rand(0.2) * H(),
        r: 0.8 + rand(0.3) * 1.4,
        vy: 0.15 + rand(0.4) * 0.35,
        vx: -0.1 + rand(0.5) * 0.2,
        alpha: 0.3 + rand(0.6) * 0.5,
        flicker: rand(0.7) * Math.PI * 2,
      };
    });

    let isHidden = false;
    const onVisibility = () => { isHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    const render = (now: number) => {
      rafRef.current = requestAnimationFrame(render);
      if (isHidden) return;

      ctx.clearRect(0, 0, W(), H());

      particles.forEach((p) => {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(now * 0.0005 + p.flicker) * 0.15;

        if (p.y < -10) {
          p.y = H() + 10;
          p.x = Math.random() * W();
        }
        if (p.x < -10) p.x = W() + 10;
        if (p.x > W() + 10) p.x = -10;

        const flicker = 0.6 + Math.sin(now * 0.003 + p.flicker) * 0.4;
        const alpha = p.alpha * flicker;

        // Glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        grad.addColorStop(0, `rgba(240, 168, 120, ${alpha})`);
        grad.addColorStop(0.4, `rgba(194, 104, 61, ${alpha * 0.4})`);
        grad.addColorStop(1, "rgba(194, 104, 61, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(255, 220, 180, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full hidden dark:block"
    />
  );
}
