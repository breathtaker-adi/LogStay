"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * MagneticButton — cursor-tracking primitive with spring physics.
 *
 * Pulls toward cursor within `radius` pixels (default 80),
 * settles back when cursor leaves. Matches spec token spring-soft:
 *   stiffness 120 / damping 18 / ~680ms settle.
 */
export function MagneticButton({
  children,
  onClick,
  radius = 80,
  strength = 0.4,
  className = "",
  as = "button",
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  radius?: number;
  strength?: number;
  className?: string;
  as?: "button" | "a";
  href?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    setOffset({ x: dx * strength, y: dy * strength });
  };

  const handleMouseLeave = () => setOffset({ x: 0, y: 0 });

  const Comp = as === "a" ? motion.a : motion.button;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ display: "inline-block" }}
    >
      <Comp
        href={href}
        onClick={onClick}
        className={className}
        animate={{ x: offset.x, y: offset.y }}
        transition={{
          type: "spring",
          stiffness: 120,
          damping: 18,
          mass: 0.5,
        }}
      >
        {children}
      </Comp>
    </motion.div>
  );
}
