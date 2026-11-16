"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import {
  ScanLine,
  Check,
  RefreshCw,
  Camera,
  User,
  Flag,
  Calendar,
  Hash,
  ArrowRight,
} from "lucide-react";

/**
 * PassportScanDemo — LogStay's signature 3-second check-in, made interactive.
 *
 * Click "Scan Passport" → camera viewfinder locks on → MRZ lines decode
 * character by character → guest fields auto-populate → success state.
 *
 * This is the marketing-site embodiment of the "3-second check-in" claim.
 */

type ScanPhase = "idle" | "scanning" | "decoding" | "complete";

interface GuestData {
  name: string;
  nationality: string;
  passportNo: string;
  dob: string;
  expiry: string;
  sex: string;
}

// Mock MRZ data (ICAO 9303 Type 3 format — 2 lines × 44 chars)
const MRZ_LINE_1 = "P<INDSINGH<<RAJESH<KUMAR<<<<<<<<<<<<<<<<<<<<<<<";
const MRZ_LINE_2 = "B1234567<8IND8504159M3001015<<<<<<<<<<<<<<06";

const GUEST: GuestData = {
  name: "Rajesh Kumar Singh",
  nationality: "India",
  passportNo: "B1234567",
  dob: "15 Apr 1985",
  expiry: "01 Jan 2030",
  sex: "M",
};

const FIELDS: {
  key: keyof GuestData;
  label: string;
  icon: typeof User;
  delay: number;
}[] = [
  { key: "name", label: "Full Name", icon: User, delay: 0 },
  { key: "nationality", label: "Nationality", icon: Flag, delay: 0.15 },
  { key: "passportNo", label: "Passport No.", icon: Hash, delay: 0.3 },
  { key: "dob", label: "Date of Birth", icon: Calendar, delay: 0.45 },
  { key: "sex", label: "Sex", icon: User, delay: 0.6 },
  { key: "expiry", label: "Expiry Date", icon: Calendar, delay: 0.75 },
];

export function PassportScanDemo() {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [mrzProgress, setMrzProgress] = useState(0); // 0-44 chars decoded
  const [populatedFields, setPopulatedFields] = useState<Set<number>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const reset = () => {
    clearTimers();
    setPhase("idle");
    setMrzProgress(0);
    setPopulatedFields(new Set());
  };

  useEffect(() => {
    return clearTimers;
  }, []);

  const startScan = () => {
    if (phase !== "idle") return;
    clearTimers();
    setPhase("scanning");

    // Phase 1: Scanning (camera locks on) — 800ms
    timersRef.current.push(
      setTimeout(() => {
        setPhase("decoding");
        // Phase 2: MRZ decodes character by character — ~1.2s total
        for (let i = 1; i <= 44; i++) {
          timersRef.current.push(
            setTimeout(() => setMrzProgress(i), (i - 1) * 28),
          );
        }
        // Phase 3: Fields populate — starts after MRZ is ~60% decoded
        for (let i = 0; i < FIELDS.length; i++) {
          timersRef.current.push(
            setTimeout(() => {
              setPopulatedFields((prev) => new Set(prev).add(i));
            }, 700 + FIELDS[i].delay * 1000),
          );
        }
        // Phase 4: Complete
        timersRef.current.push(
          setTimeout(() => setPhase("complete"), 2200),
        );
      }, 800),
    );
  };

  return (
    <section
      id="scan-demo"
      className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:px-12"
    >
      <div className="mb-12 max-w-3xl">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          Try it yourself
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Scan a passport in <span className="italic text-ember-readable">three seconds.</span>
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          No typing. No cloud OCR. No waiting. Point the camera, let LogStay
          read the machine-readable zone, and watch the guest profile fill
          itself in. Tap below to see it happen.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Camera viewfinder */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-card p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-ember-readable" />
              <span className="font-mono text-[10px] tracking-mono text-stone">
                Camera · ICAO 9303 MRZ Reader
              </span>
            </div>
            <span
              className={`font-mono text-[10px] tracking-mono ${
                phase === "idle"
                  ? "text-stone"
                  : phase === "complete"
                  ? "text-sage"
                  : "text-ember-readable"
              }`}
            >
              {phase === "idle"
                ? "READY"
                : phase === "scanning"
                ? "SCANNING..."
                : phase === "decoding"
                ? "DECODING..."
                : "SCAN COMPLETE"}
            </span>
          </div>

          {/* Viewfinder */}
          <div className="relative aspect-[3/2] overflow-hidden rounded-md border border-border bg-gradient-to-br from-[#1a1612] to-[#0e0c0a]">
            {/* Grid overlay */}
            <div className="absolute inset-0 grid-bg opacity-30" />

            {/* Passport mockup */}
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <motion.div
                initial={false}
                animate={{
                  scale: phase === "idle" ? 1 : 1.02,
                  filter:
                    phase === "scanning"
                      ? "brightness(1.15)"
                      : phase === "complete"
                      ? "brightness(1)"
                      : "brightness(1.05)",
                }}
                transition={{ duration: 0.4 }}
                className="relative w-[70%] max-w-[280px]"
              >
                {/* Passport card */}
                <div className="relative aspect-[1.4/1] rounded-md border border-border bg-gradient-to-br from-[#2a241d] to-[#1c1814] p-3 shadow-2xl">
                  {/* Passport header */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-mono text-[7px] tracking-mono text-stone">
                      {GUEST.nationality.toUpperCase()} · PASSPORT
                    </div>
                    <div className="h-3 w-4 rounded-sm bg-ember/30" />
                  </div>
                  {/* Photo placeholder */}
                  <div className="mb-2 flex gap-2">
                    <div className="h-8 w-6 rounded-sm bg-border" />
                    <div className="flex-1 space-y-0.5">
                      <div className="h-1 w-full rounded bg-bone/20" />
                      <div className="h-1 w-2/3 rounded bg-bone/15" />
                      <div className="h-1 w-3/4 rounded bg-bone/10" />
                    </div>
                  </div>
                  {/* MRZ zone */}
                  <div className="absolute inset-x-2 bottom-2 space-y-0.5">
                    <MrzLine
                      text={MRZ_LINE_1}
                      progress={mrzProgress}
                      isActive={phase === "decoding" || phase === "complete"}
                    />
                    <MrzLine
                      text={MRZ_LINE_2}
                      progress={Math.max(0, mrzProgress)}
                      isActive={phase === "decoding" || phase === "complete"}
                    />
                  </div>
                </div>

                {/* Corner brackets — lock on during scanning */}
                <AnimatePresence>
                  {phase !== "idle" && (
                    <>
                      {[
                        "top-0 left-0",
                        "top-0 right-0 rotate-90",
                        "bottom-0 right-0 rotate-180",
                        "bottom-0 left-0 -rotate-90",
                      ].map((pos, i) => (
                        <motion.div
                          key={pos}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ delay: i * 0.05, duration: 0.2 }}
                          className={`absolute ${pos}`}
                        >
                          <div
                            className="h-4 w-4 border-l-2 border-t-2"
                            style={{
                              borderColor:
                                phase === "complete"
                                  ? "var(--sage)"
                                  : "var(--ember)",
                            }}
                          />
                        </motion.div>
                      ))}
                    </>
                  )}
                </AnimatePresence>

                {/* Scan line */}
                <AnimatePresence>
                  {phase === "scanning" && (
                    <motion.div
                      initial={{ top: "0%" }}
                      animate={{ top: "100%" }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 1.2,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse",
                      }}
                      className="absolute inset-x-0 h-0.5"
                      style={{
                        background:
                          "linear-gradient(to right, transparent, var(--ember), transparent)",
                        boxShadow: "0 0 12px rgba(194,104,61,0.8)",
                      }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Vignette */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(14,12,10,0.6) 100%)",
              }}
            />
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center gap-3">
            {phase === "idle" ? (
              <button
                onClick={startScan}
                className="group inline-flex items-center gap-2 rounded-full border border-ember bg-ember px-5 py-2.5 font-mono text-xs tracking-mono text-background transition-colors hover:bg-ember-bright"
              >
                <ScanLine className="h-3.5 w-3.5" />
                Scan Passport
              </button>
            ) : phase === "complete" ? (
              <button
                onClick={reset}
                className="group inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 font-mono text-xs tracking-mono text-bone-muted transition-colors hover:border-ember/50 hover:text-bone"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Scan Again
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-5 py-2.5 font-mono text-xs tracking-mono text-ember-readable">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <ScanLine className="h-3.5 w-3.5" />
                </motion.div>
                Reading...
              </div>
            )}

            {/* Timer */}
            <div className="font-mono text-[10px] tracking-mono text-stone">
              {phase === "idle" && "Ready to scan"}
              {phase === "scanning" && "Aligning camera..."}
              {phase === "decoding" && "Decoding MRZ..."}
              {phase === "complete" && "Done in 2.8s"}
            </div>
          </div>
        </div>

        {/* Right: Guest intake form */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-card p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-ember-readable" />
              <span className="font-mono text-[10px] tracking-mono text-stone">
                Guest Profile · Auto-filled
              </span>
            </div>
            <span
              className={`font-mono text-[10px] tracking-mono ${
                populatedFields.size === FIELDS.length
                  ? "text-sage"
                  : "text-stone"
              }`}
            >
              {populatedFields.size}/{FIELDS.length} FIELDS
            </span>
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            {FIELDS.map((field, i) => {
              const Icon = field.icon;
              const isPopulated = populatedFields.has(i);
              return (
                <div key={field.key}>
                  <div className="mb-1 font-mono text-[9px] tracking-mono text-stone">
                    {field.label}
                  </div>
                  <div
                    className={`relative flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      isPopulated
                        ? "border-ember/40 bg-ember/5"
                        : "border-border bg-background/40"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 flex-shrink-0 ${
                        isPopulated ? "text-ember-readable" : "text-stone"
                      }`}
                    />
                    <AnimatePresence mode="wait">
                      {isPopulated ? (
                        <motion.div
                          key="filled"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="flex flex-1 items-center justify-between"
                        >
                          <span className="font-body-serif text-sm text-bone">
                            {GUEST[field.key]}
                          </span>
                          <Check className="h-3.5 w-3.5 text-sage" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex-1"
                        >
                          <div className="h-3 w-full rounded bg-border/60" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success state */}
          <AnimatePresence>
            {phase === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-5 rounded-md border border-sage/40 bg-sage/10 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/20">
                    <Check className="h-4 w-4 text-sage" />
                  </div>
                  <div className="flex-1">
                    <div className="font-body-serif text-sm text-bone">
                      Guest profile complete. Ready to assign a room.
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] tracking-mono text-stone">
                      No typing required · 0 errors · 2.8 seconds total
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-sage" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Idle hint */}
          {phase === "idle" && (
            <div className="mt-5 rounded-md border border-dashed border-border bg-background/20 p-4 text-center">
              <div className="font-mono text-[10px] tracking-mono text-stone">
                Tap “Scan Passport” to see the guest profile fill itself in.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature bullets below */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Works fully offline",
            body: "The camera reads the passport on the phone itself. No cloud OCR, no internet needed.",
          },
          {
            title: "Validates check digits",
            body: "Every field is mathematically verified against ICAO 9303 checksums before it’s accepted.",
          },
          {
            title: "Zero per-scan cost",
            body: "Cloud OCR charges $0.05–0.15 per scan. LogStay’s runs on-device, at no cost.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-md border border-border bg-card/50 p-4"
          >
            <div className="font-body-serif text-sm text-bone">
              {f.title}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-stone">
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Renders an MRZ line with progressive character reveal. */
function MrzLine({
  text,
  progress,
  isActive,
}: {
  text: string;
  progress: number;
  isActive: boolean;
}) {
  return (
    <div className="flex font-mono text-[7px] leading-tight tracking-tight">
      {text.split("").map((char, i) => {
        const decoded = i < progress;
        return (
          <span
            key={i}
            className={decoded ? "text-ember-readable" : "text-stone/40"}
            style={{
              transition: "color 0.1s",
              textShadow: decoded && isActive
                ? "0 0 4px rgba(194,104,61,0.5)"
                : "none",
            }}
          >
            {char === " " ? "·" : char === "<" ? "‹" : char}
          </span>
        );
      })}
    </div>
  );
}
