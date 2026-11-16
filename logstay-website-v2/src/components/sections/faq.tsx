"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Plus, Minus } from "lucide-react";

/**
 * FAQSection — objection busters in plain language.
 */
const FAQS = [
  {
    q: "My desk clerks quit every three months. Won't training take weeks?",
    a: "No. LogStay is built around the same gestures as WhatsApp or Instagram — point the camera, tap what you want, confirm. The entire check-in is three steps. New receptionists are at full operational speed in 15 minutes, not three weeks.",
  },
  {
    q: "What if a receptionist's phone gets dropped in a pool or stolen?",
    a: "Nothing is lost. Every action syncs to an encrypted cloud backup the moment there's a connection. You log in from any other phone or tablet, revoke the lost device's session with one tap, and the entire property restores onto the new device in seconds.",
  },
  {
    q: "Can't I just keep using a Google Sheet? It's free.",
    a: "A spreadsheet feels free while quietly leaking money. It can't scan a passport. It can't stop two clerks booking the same bed at once. It can't catch a missing ₹500 from the drawer. And it gives you zero protection when an employee downloads guest passports onto their personal laptop. LogStay pays for itself in the first 30 days.",
  },
  {
    q: "What if two clerks check in different guests to the same bed offline?",
    a: "When the devices reconnect, the first check-in wins the bed. The second guest's booking is still saved — their payment is secured — and LogStay immediately shows the second clerk the nearest equivalent vacant bed to reassign them to, with one tap. No data lost, no double-charges.",
  },
  {
    q: "Could a malicious employee steal the database off a phone?",
    a: "Three layers prevent it. The database lives in the phone's encrypted private sandbox — other apps and file browsers can't see it. Raw passport photos never stay on the device; they're encrypted and uploaded, then wiped immediately. And if a device is compromised, revoking its session server-side cuts off all future access instantly.",
  },
  {
    q: "Are we locked in if we ever want to leave?",
    a: "No. LogStay runs on standard open-source foundations. You can export your entire property database — guests, transactions, room histories, audit records — as plain CSV or JSON at any time, or pull a direct database dump. Your data is yours.",
  },
  {
    q: "Does it work on a crumpled, faded passport in bad lighting?",
    a: "The camera continuously scans 30 frames per second and runs adaptive contrast correction for glare, shadows, and laminated film. It only accepts a scan when every check digit mathematically validates. If the passport is physically torn through the readable zone, a manual entry form appears instantly — so the desk never stalls.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative z-10 mx-auto w-full max-w-3xl px-6 py-24 md:px-12">
      <div className="mb-12 text-center">
        <div className="mb-3 font-mono text-xs tracking-eyebrow text-ember-readable">
          Questions, honestly answered
        </div>
        <h2 className="font-headline text-4xl leading-tight text-bone md:text-5xl">
          Ask anything.
        </h2>
        <p className="mt-4 font-body-serif text-base text-stone">
          The skeptic's questions — and the architect's answers.
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-6 md:py-5"
                aria-expanded={isOpen}
              >
                <span className="font-body-serif text-base text-bone md:text-lg">
                  {faq.q}
                </span>
                <span className="flex-shrink-0">
                  {isOpen ? (
                    <Minus className="h-4 w-4 text-ember-readable" />
                  ) : (
                    <Plus className="h-4 w-4 text-stone" />
                  )}
                </span>
              </button>
              <motion.div
                initial={false}
                animate={{
                  height: isOpen ? "auto" : 0,
                  opacity: isOpen ? 1 : 0,
                }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
                <p className="px-5 pb-5 text-sm leading-relaxed text-stone md:px-6 md:pb-6">
                  {faq.a}
                </p>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
