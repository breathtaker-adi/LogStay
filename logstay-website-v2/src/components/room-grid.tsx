"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Wrench, Sparkles, BedDouble, ArrowUpRight } from "lucide-react";

/**
 * RoomGrid — LogStay's live room availability matrix.
 *
 * Shows the property's rooms and dorm beds in real time, color-coded by status.
 * Hover any room to see the guest details. Tap a filter to focus on one status.
 *
 * (Was "Bed Matrix Morph" — reframed in plain language for the marketing site.)
 */

type RoomStatus = "vacant_clean" | "vacant_dirty" | "occupied" | "maintenance";

interface Room {
  id: string;
  room: string;
  floor: number;
  status: RoomStatus;
  guest?: { name: string; nights: number; folio: number };
}

// Deterministic seeded PRNG — prevents hydration mismatch
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GUEST_NAMES = [
  "A. Mehta", "L. Chen", "R. Singh", "M. Okafor",
  "S. Tanaka", "P. Dubois", "K. Andersen", "J. Costa",
  "N. Yamamoto", "E. Volkov", "T. Rahman", "C. Bauer",
];

// Generate rooms deterministically — same output on server and client
function generateRooms(): Room[] {
  const floors = [
    { floor: 3, count: 8 },
    { floor: 2, count: 10 },
    { floor: 1, count: 12 },
  ];
  const rand = mulberry32(42);
  const rooms: Room[] = [];
  floors.forEach(({ floor, count }) => {
    for (let i = 1; i <= count; i++) {
      const id = `${floor}${i.toString().padStart(2, "0")}`;
      const roll = rand();
      let status: RoomStatus;
      let guest: Room["guest"];
      if (roll < 0.48) {
        status = "occupied";
        guest = {
          name: GUEST_NAMES[Math.floor(rand() * GUEST_NAMES.length)],
          nights: 1 + Math.floor(rand() * 5),
          folio: 1800 + Math.floor(rand() * 6500),
        };
      } else if (roll < 0.74) {
        status = "vacant_clean";
      } else if (roll < 0.90) {
        status = "vacant_dirty";
      } else {
        status = "maintenance";
      }
      rooms.push({
        id,
        room: `${floor}${i.toString().padStart(2, "0")}`,
        floor,
        status,
        guest,
      });
    }
  });
  return rooms;
}

const STATUS_CONFIG: Record<
  RoomStatus,
  { label: string; short: string; bg: string; border: string; text: string; icon: typeof Users }
> = {
  vacant_clean: {
    label: "Ready for guests",
    short: "Ready",
    bg: "rgba(107, 122, 90, 0.18)",
    border: "rgba(107, 122, 90, 0.55)",
    text: "#A8B594",
    icon: Sparkles,
  },
  vacant_dirty: {
    label: "Needs cleaning",
    short: "Cleaning",
    bg: "rgba(184, 154, 110, 0.16)",
    border: "rgba(184, 154, 110, 0.55)",
    text: "#D6B98A",
    icon: BedDouble,
  },
  occupied: {
    label: "Guest checked in",
    short: "Occupied",
    bg: "rgba(194, 104, 61, 0.20)",
    border: "rgba(194, 104, 61, 0.65)",
    text: "#F0A878",
    icon: Users,
  },
  maintenance: {
    label: "Under maintenance",
    short: "Fixing",
    bg: "rgba(74, 70, 64, 0.40)",
    border: "rgba(138, 126, 108, 0.45)",
    text: "#8A7E6C",
    icon: Wrench,
  },
};

const FLOOR_LABELS: Record<number, string> = {
  3: "Third Floor · Suites",
  2: "Second Floor · Premium Rooms",
  1: "First Floor · Standard & Dorms",
};

export function RoomGrid() {
  const rooms = useMemo(() => generateRooms(), []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RoomStatus | "all">("all");

  const hovered = rooms.find((r) => r.id === hoveredId);
  const filteredRooms = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);

  const byFloor = filteredRooms.reduce<Record<number, Room[]>>((acc, room) => {
    (acc[room.floor] ||= []).push(room);
    return acc;
  }, {});

  const stats = useMemo(() => {
    const total = rooms.length;
    const occupied = rooms.filter((r) => r.status === "occupied").length;
    const clean = rooms.filter((r) => r.status === "vacant_clean").length;
    const dirty = rooms.filter((r) => r.status === "vacant_dirty").length;
    const maint = rooms.filter((r) => r.status === "maintenance").length;
    return { total, occupied, clean, dirty, maint };
  }, [rooms]);

  return (
    <section id="rooms" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
            See it in action
          </div>
          <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
            Your whole property, <span className="italic text-ember-readable">at a glance.</span>
          </h2>
          <p className="mt-3 max-w-xl font-body-serif text-base text-stone">
            Every room and dorm bed, live and color-coded. Tap to filter,
            hover any room to see who's staying there. This is what your
            front desk sees — every second of every day.
          </p>
        </div>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All Rooms", "#EDE6D8"],
            ["occupied", "Occupied", STATUS_CONFIG.occupied.text],
            ["vacant_clean", "Ready", STATUS_CONFIG.vacant_clean.text],
            ["vacant_dirty", "Cleaning", STATUS_CONFIG.vacant_dirty.text],
            ["maintenance", "Fixing", STATUS_CONFIG.maintenance.text],
          ] as const).map(([key, label, color]) => (
            <button
              key={key}
              onClick={() => setFilter(key as RoomStatus | "all")}
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-mono transition-colors ${
                filter === key
                  ? "border-ember bg-ember/10 text-bone"
                  : "border-border text-stone hover:border-ember/50 hover:text-bone-muted"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: color }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-5">
        {[
          { label: "Total Rooms", value: stats.total, color: "var(--bone)" },
          { label: "Occupied", value: stats.occupied, color: STATUS_CONFIG.occupied.text },
          { label: "Ready for Guests", value: stats.clean, color: STATUS_CONFIG.vacant_clean.text },
          { label: "Needs Cleaning", value: stats.dirty, color: STATUS_CONFIG.vacant_dirty.text },
          { label: "Under Maintenance", value: stats.maint, color: STATUS_CONFIG.maintenance.text },
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

      {/* The grid */}
      <div className="relative overflow-hidden rounded-md border border-border bg-popover/50 p-6 md:p-8">
        <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />

        <div className="relative space-y-8">
          {Object.entries(byFloor)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([floorStr, floorRooms]) => {
              const floor = Number(floorStr);
              return (
                <div key={floor}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-mono text-[10px] tracking-mono text-stone">
                      Floor {floor}
                    </span>
                    <span className="font-body-serif italic text-sm text-bone-muted">
                      {FLOOR_LABELS[floor]}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    <span className="font-mono text-[10px] text-stone">
                      {floorRooms.length} rooms
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                    {floorRooms.map((room) => (
                      <RoomTile
                        key={room.id}
                        room={room}
                        isHovered={hoveredId === room.id}
                        onHover={(h) => setHoveredId(h ? room.id : null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Guest details card on hover */}
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
                <div className="font-mono text-[10px] tracking-mono text-ember-readable">
                  Currently Staying
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-ember-readable" />
              </div>
              <div className="font-mono text-2xl tabular-nums text-bone">
                Room {hovered.room}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <div className="font-body-serif text-sm text-bone-muted">
                  {hovered.guest.name}
                </div>
                <div className="mt-1 font-mono text-[10px] tracking-mono text-stone">
                  {hovered.guest.nights} {hovered.guest.nights === 1 ? "night" : "nights"} · ₹ {hovered.guest.folio.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-mono text-stone">
                  Status
                </span>
                <span
                  className="font-mono text-[10px] tracking-mono"
                  style={{ color: STATUS_CONFIG[hovered.status].text }}
                >
                  {STATUS_CONFIG[hovered.status].label}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function RoomTile({
  room,
  isHovered,
  onHover,
}: {
  room: Room;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
}) {
  const cfg = STATUS_CONFIG[room.status];
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
        boxShadow: isHovered
          ? `0 0 0 1px ${cfg.text}, 0 8px 20px rgba(0,0,0,0.3)`
          : "none",
      }}
    >
      <Icon
        className="mb-1 h-3 w-3"
        style={{ color: cfg.text, opacity: room.status === "maintenance" ? 0.5 : 1 }}
      />
      <div
        className="font-mono text-[10px] tabular-nums"
        style={{ color: cfg.text }}
      >
        {room.room}
      </div>
      {room.status === "occupied" && room.guest && (
        <div
          className="absolute right-1 top-1 h-1 w-1 rounded-full"
          style={{ background: cfg.text }}
        />
      )}
    </motion.div>
  );
}
