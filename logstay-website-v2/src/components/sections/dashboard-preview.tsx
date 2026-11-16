"use client";

import { motion } from "framer-motion";
import { TrendingUp, Activity, ShieldCheck, ScrollText } from "lucide-react";

/**
 * DashboardPreview — Phase 4.4 condensed.
 * Owner-grade instrument panel: occupancy heatmap, revenue sparkline,
 * UPI reconciliation queue, audit stream.
 */

// 7-day × 8-bed occupancy heatmap (0 = vacant, 1 = occupied, 0.5 = partial)
const HEATMAP_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const HEATMAP_BEDS = ["301", "302", "303", "304", "305", "306", "307", "308"];
const HEATMAP_DATA: number[][] = HEATMAP_BEDS.map((_, bedIdx) =>
  HEATMAP_DAYS.map((_, dayIdx) => {
    const v = Math.sin(bedIdx * 0.7 + dayIdx * 0.9) * 0.5 + 0.5;
    return Math.max(0, Math.min(1, v));
  }),
);

// 30-day revenue sparkline
const SPARKLINE = Array.from({ length: 30 }, (_, i) =>
  2400 + Math.sin(i * 0.4) * 800 + Math.cos(i * 0.2) * 400 + i * 30,
);

const RECON_QUEUE = [
  { id: "UPI-8842", folio: "STAY#0142", amount: 4800, age: "2m", status: "pending" },
  { id: "UPI-8841", folio: "STAY#0140", amount: 6300, age: "8m", status: "pending" },
  { id: "UPI-8840", folio: "STAY#0138", amount: 2700, age: "14m", status: "pending" },
];

const AUDIT_STREAM = [
  { time: "14:32:08", actor: "desk · r.singh", action: "StayService.checkin", target: "STAY#0142" },
  { time: "14:31:42", actor: "owner · a.mehta", action: "ApprovalService.approve", target: "STAFF#0089" },
  { time: "14:30:11", actor: "housekeeping", action: "HousekeepingService.markClean", target: "BED#304" },
  { time: "14:28:55", actor: "system · cron", action: "AuditService.purgePhotos", target: "DPDP cron" },
];

export function DashboardPreview() {
  return (
    <section id="dashboard" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-12">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember">
          Phase 4.4 · Dashboard / Analytics
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          The owner reads the property <span className="italic text-ember">as a whole.</span>
        </h2>
        <p className="mt-4 max-w-2xl font-body-serif text-base text-stone">
          Dense by design — Owners benefit from density. Organized by the same editorial cadence:
          Fraunces header, italic dek, mono data layer.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Occupancy heatmap (spans 2 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-md border border-border bg-card p-6 lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-ember" />
              <span className="font-mono text-[10px] tracking-mono text-stone">
                OCCUPANCY HEATMAP · 7-DAY × 8-BED
              </span>
            </div>
            <span className="font-mono text-[10px] text-ember">68% ARR</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              {/* Day headers */}
              <div className="mb-2 grid" style={{ gridTemplateColumns: `48px repeat(${HEATMAP_DAYS.length}, 1fr)` }}>
                <div />
                {HEATMAP_DAYS.map((d) => (
                  <div key={d} className="text-center font-mono text-[9px] tracking-mono text-stone">
                    {d}
                  </div>
                ))}
              </div>
              {/* Bed rows */}
              {HEATMAP_BEDS.map((bed, bedIdx) => (
                <div
                  key={bed}
                  className="mb-1 grid items-center"
                  style={{ gridTemplateColumns: `48px repeat(${HEATMAP_DAYS.length}, 1fr)` }}
                >
                  <div className="font-mono text-[10px] tabular-nums text-stone">
                    RM {bed}
                  </div>
                  {HEATMAP_DATA[bedIdx].map((v, dayIdx) => {
                    const alpha = 0.15 + v * 0.7;
                    const color =
                      v > 0.6
                        ? `rgba(194, 104, 61, ${alpha})`
                        : v > 0.3
                        ? `rgba(184, 154, 110, ${alpha})`
                        : `rgba(107, 122, 90, ${alpha})`;
                    return (
                      <div key={dayIdx} className="px-1">
                        <div
                          className="aspect-square rounded-sm transition-transform hover:scale-110"
                          style={{ background: color }}
                          title={`${bed} · ${HEATMAP_DAYS[dayIdx]} · ${Math.round(v * 100)}%`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Revenue sparkline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="rounded-md border border-border bg-card p-6"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-ember" />
            <span className="font-mono text-[10px] tracking-mono text-stone">
              REVENUE · 30-DAY
            </span>
          </div>
          <Sparkline data={SPARKLINE} />
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-3xl tabular-nums text-bone">
              ₹ 84.6k
            </span>
            <span className="font-mono text-[10px] tracking-mono text-ember">
              +12.4%
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-mono text-stone">
            ADR ₹ 4,200 · ARR 68%
          </div>
        </motion.div>

        {/* UPI reconciliation queue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
          className="rounded-md border border-border bg-card p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-ember" />
              <span className="font-mono text-[10px] tracking-mono text-stone">
                UPI RECONCILIATION
              </span>
            </div>
            <span className="rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[10px] text-ember">
              3 PENDING
            </span>
          </div>
          <div className="space-y-2">
            {RECON_QUEUE.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border border-border bg-background/40 px-3 py-2 transition-colors hover:border-ember/40"
              >
                <div>
                  <div className="font-mono text-[10px] text-ember-light">
                    {item.id}
                  </div>
                  <div className="font-mono text-[10px] text-stone">
                    {item.folio} · {item.age} ago
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums text-bone">
                    ₹ {item.amount.toLocaleString("en-IN")}
                  </div>
                  <button className="font-mono text-[10px] tracking-mono text-ember hover:underline">
                    VERIFY →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Audit stream */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.24 }}
          className="rounded-md border border-border bg-card p-6 lg:col-span-2"
        >
          <div className="mb-4 flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-ember" />
            <span className="font-mono text-[10px] tracking-mono text-stone">
              AUDIT LEDGER · LIVE STREAM
            </span>
          </div>
          <div className="space-y-1 font-mono text-xs">
            {AUDIT_STREAM.map((entry, i) => (
              <motion.div
                key={`${entry.time}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className="grid grid-cols-1 gap-1 rounded px-2 py-1.5 hover:bg-background/40 md:grid-cols-[80px_140px_1fr_auto]"
              >
                <span className="text-stone">{entry.time}</span>
                <span className="text-bone-muted">{entry.actor}</span>
                <span className="text-ember-light">{entry.action}</span>
                <span className="text-bone">{entry.target}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 240;
  const h = 80;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C2683D" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#C2683D" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sparkfill)" />
      <polyline
        points={points}
        fill="none"
        stroke="#C2683D"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
