"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Wrench, Sparkles, BedDouble, ArrowUpRight } from "lucide-react";

/**
 * Bed Matrix Morph — Atelier Noir signature interaction #2.
 *
 * Multi-floor bed matrix where each bed is a morphing tile.
 * - Spring state transitions (stiffness 320 / damping 28) — physical squash/stretch
 * - Hovering a bed orbits a radial stay card into view (spring 180/22, ~520ms)
 * - State colors derived from semantic tokens (sage/sandstone/ember/smoke)
 */

type BedState = "vacant_clean" | "vacant_dirty" | "occupied" | "maintenance";

interface Bed {
  id: string;
  room: string;
  floor: number;
  state: BedState;
  guest?: { name: string; nights: number; folio: number };
}

interface BedMatrixMorphProps {
  occupancyTarget?: number; // for the orbital info
}

const STATE_CONFIG: Record<
  BedState,
  { label: string; bg: string; border: string; text: string; icon: typeof Users }
> = {
  vacant_clean: {
    label: "Vacant · Clean",
    bg: "rgba(107, 122, 90, 0.18)",
    border: "rgba(107, 122, 90, 0.55)",
    text: "#A8B594",
    icon: Sparkles,
  },
  vacant_dirty: {
    label: "Vacant · Dirty",
    bg: "rgba(184, 154, 110, 0.16)",
    border: "rgba(184, 154, 110, 0.55)",
    text: "#D6B98A",
    icon: BedDouble,
  },
  occupied: {
    label: "Occupied",
    bg: "rgba(194, 104, 61, 0.20)",
    border: "rgba(194, 104, 61, 0.65)",
    text: "#E89968",
    icon: Users,
  },
  maintenance: {
    label: "Maintenance",
    bg: "rgba(74, 70, 64, 0.40)",
    border: "rgba(138, 126, 108, 0.45)",
    text: "#8A7E6C",
    icon: Wrench,
  },
};

// Generate a realistic bed matrix across floors
function generateBeds(): Bed[] {
  const floors = [
    { floor: 3, rooms: 8 },
    { floor: 2, rooms: 10 },
    { floor: 1, rooms: 12 },
  ];
  const beds: Bed[] = [];
  floors.forEach(({ floor, rooms }) => {
    for (let i = 1; i <= rooms; i++) {
      const id = `${floor}${i.toString().padStart(2, "0")}`;
      const stateRoll = Math.random();
      let state: BedState;
      let guest: Bed["guest"];
      if (stateRoll < 0.45) {
        state = "occupied";
        guest = {
          name: ["A. Mehta", "L. Chen", "R. Singh", "M. Okafor", "S. Tanaka", "P. Dubois", "K. Andersen"][
            Math.floor(Math.random() * 7)
          ],
          nights: 1 + Math.floor(Math.random() * 5),
          folio: 1800 + Math.floor(Math.random() * 6500),
        };
      } else if (stateRoll < 0.72) {
        state = "vacant_clean";
      } else if (stateRoll < 0.88) {
        state = "vacant_dirty";
      } else {
        state = "maintenance";
      }
      beds.push({
        id,
        room: `${floor}${i.toString().padStart(2, "0")}`,
        floor,
        state,
        guest,
      });
    }
  });
  return beds;
}

const FLOOR_LABELS: Record<number, string> = {
  3: "Third Floor · Suites",
  2: "Second Floor · Premium",
  1: "First Floor · Standard",
};

export function BedMatrixMorph({ occupancyTarget = 0.45 }: BedMatrixMorphProps) {
  const beds = useMemo(() => generateBeds(), []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BedState | "all">("all");

  const hovered = beds.find((b) => b.id === hoveredId);

  const filteredBeds = filter === "all" ? beds : beds.filter((b) => b.state === filter);

  const byFloor = filteredBeds.reduce<Record<number, Bed[]>>((acc, bed) => {
    (acc[bed.floor] ||= []).push(bed);
    return acc;
  }, {});

  const stats = useMemo(() => {
    const total = beds.length;
    const occupied = beds.filter((b) => b.state === "occupied").length;
    const clean = beds.filter((b) => b.state === "vacant_clean").length;
    const dirty = beds.filter((b) => b.state === "vacant_dirty").length;
    const maint = beds.filter((b) => b.state === "maintenance").length;
    return { total, occupied, clean, dirty, maint, ratio: occupied / total };
  }, [beds]);

  return (
    <section id="explorer" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember">
            Phase 4.2 · Explorer / Bed Matrix Morph
          </div>
          <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
            The bed matrix, <span className="italic text-ember">breathing.</span>
          </h2>
          <p className="mt-3 max-w-xl font-body-serif text-base text-stone">
            A tactile state machine. Every bed is a morphing tile that physically
            transitions between states with spring physics — squash, stretch, settle.
          </p>
        </div>
        {/* Filter rail */}
        <div className="flex flex-wrap gap-2">
          {(["all", "occupied", "vacant_clean", "vacant_dirty", "maintenance"] as const).map((f) => {
            const cfg =
              f === "all"
                ? { label: "All", color: "#EDE6D8" }
                : { label: STATE_CONFIG[f].label.split("·")[1]?.trim() || STATE_CONFIG[f].label, color: STATE_CONFIG[f].text };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-mono transition-colors ${
                  filter === f
                    ? "border-ember bg-ember/10 text-bone"
                    : "border-border text-stone hover:border-ember/50 hover:text-bone-muted"
                }`}
                style={filter === f ? {} : { color: undefined }}
              >
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: cfg.color }}
                />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-5">
        {[
          { label: "Total Beds", value: stats.total, color: "#EDE6D8" },
          { label: "Occupied", value: stats.occupied, color: STATE_CONFIG.occupied.text },
          { label: "Vacant · Clean", value: stats.clean, color: STATE_CONFIG.vacant_clean.text },
          { label: "Vacant · Dirty", value: stats.dirty, color: STATE_CONFIG.vacant_dirty.text },
          { label: "Maintenance", value: stats.maint, color: STATE_CONFIG.maintenance.text },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <div className="font-mono text-2xl tabular-nums" style={{ color: s.color }}>
              {s.value.toString().padStart(2, "0")}
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-mono text-stone">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Matrix */}
      <div className="relative overflow-hidden rounded-md border border-border bg-popover/50 p-6 md:p-8">
        <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />

        <div className="relative space-y-8">
          {Object.entries(byFloor)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([floorStr, floorBeds]) => {
              const floor = Number(floorStr);
              return (
                <div key={floor}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-mono text-[10px] tracking-mono text-stone">
                      F · {floor.toString().padStart(2, "0")}
                    </span>
                    <span className="font-body-serif italic text-sm text-bone-muted">
                      {FLOOR_LABELS[floor]}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    <span className="font-mono text-[10px] text-stone">
                      {floorBeds.length} units
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                    {floorBeds.map((bed) => (
                      <BedTile
                        key={bed.id}
                        bed={bed}
                        isHovered={hoveredId === bed.id}
                        onHover={(h) => setHoveredId(h ? bed.id : null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Orbital stay card */}
        <AnimatePresence>
          {hovered && hovered.guest && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 20 }}
              transition={{ type: "spring", stiffness: 180, damping: 22, mass: 0.6 }}
              className="pointer-events-none absolute right-6 top-6 z-20 w-64 rounded-md border border-ember/40 bg-card p-5 ember-glow-accent md:right-8 md:top-8"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-mono text-ember">
                  STAY · #{Math.floor(1000 + Math.random() * 9000)}
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-ember" />
              </div>
              <div className="font-mono text-2xl tabular-nums text-bone">
                RM {hovered.room}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <div className="font-body-serif text-sm text-bone-muted">
                  {hovered.guest.name}
                </div>
                <div className="mt-1 font-mono text-[10px] tracking-mono text-stone">
                  {hovered.guest.nights} {hovered.guest.nights === 1 ? "NIGHT" : "NIGHTS"} · ₹ {hovered.guest.folio.toLocaleString("en-IN")}.00
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  STATE
                </span>
                <span
                  className="font-mono text-[10px] tracking-mono"
                  style={{ color: STATE_CONFIG[hovered.state].text }}
                >
                  {STATE_CONFIG[hovered.state].label.toUpperCase()}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function BedTile({
  bed,
  isHovered,
  onHover,
}: {
  bed: Bed;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
}) {
  const cfg = STATE_CONFIG[bed.state];
  const Icon = cfg.icon;

  return (
    <motion.div
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
      onClick={() => onHover(!isHovered)}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.4 }}
      className="relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border"
      style={{
        background: cfg.bg,
        borderColor: isHovered ? cfg.text : cfg.border,
        boxShadow: isHovered ? `0 0 0 1px ${cfg.text}, 0 8px 20px rgba(0,0,0,0.3)` : "none",
      }}
    >
      <Icon
        className="mb-1 h-3 w-3"
        style={{ color: cfg.text, opacity: bed.state === "maintenance" ? 0.5 : 1 }}
      />
      <div
        className="font-mono text-[10px] tabular-nums"
        style={{ color: cfg.text }}
      >
        {bed.room}
      </div>
      {bed.state === "occupied" && bed.guest && (
        <div className="absolute right-1 top-1 h-1 w-1 rounded-full" style={{ background: cfg.text }} />
      )}
    </motion.div>
  );
}
