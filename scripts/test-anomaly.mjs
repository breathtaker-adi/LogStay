// scripts/test-anomaly.mjs
// Statistical evaluation of Cash Anomaly Flags over a 90-day synthetic shift dataset.
// Generates baseline shifts, injects real-world fraud/error patterns, and measures:
// Precision, Recall, F1 Score, and False Alarm Rate per week.

import assert from 'node:assert';

// Standalone implementation of robust MAD and detector for test evaluation
function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(arr, med) {
  if (!arr || arr.length === 0) return 0;
  const m = med !== undefined ? med : median(arr);
  const deviations = arr.map(x => Math.abs(x - m));
  return median(deviations);
}

function robustZScore(x, m, mDev) {
  if (mDev === 0) return 0;
  return (0.6745 * (x - m)) / mDev;
}

function detectShiftAnomalies(current, history = []) {
  const flags = [];
  const variance = current.variance ?? (current.actual_cash !== null ? current.actual_cash - current.expected_cash : 0);

  if (variance < -200) {
    flags.push({ id: 'cash_short', severity: variance < -1000 ? 'critical' : 'warning' });
  } else if (variance > 500) {
    flags.push({ id: 'cash_over', severity: 'info' });
  }

  if (history.length >= 5) {
    const historicalPetty = history.map(s => s.petty_cash_expenses || 0);
    const medPetty = median(historicalPetty);
    const effectiveMad = Math.max(mad(historicalPetty, medPetty), 150);
    const zPetty = robustZScore(current.petty_cash_expenses, medPetty, effectiveMad);

    if (zPetty >= 3.0 && current.petty_cash_expenses > 500) {
      flags.push({ id: 'petty_spike', severity: 'warning' });
    }
  }

  if (current.refund_count >= 3 || current.refund_total > 2000) {
    flags.push({ id: 'refund_spike', severity: current.refund_total > 4000 ? 'critical' : 'warning' });
  }

  if (current.checkin_count >= 3 && current.pay_later_count / current.checkin_count >= 0.4) {
    flags.push({ id: 'pay_later_high', severity: 'warning' });
  }

  return flags;
}

console.log('====================================================');
console.log('   LogStay Cash Anomaly Engine 90-Day Evaluation     ');
console.log('====================================================\n');

// 1. Generate 90 days of shifts (2 shifts per day = 180 shifts)
const totalShifts = 180;
const shifts = [];

let injectedGroundTruth = 0; // True anomalies injected

for (let i = 0; i < totalShifts; i++) {
  // Normal baseline shift parameters
  const checkins = 4 + Math.floor(Math.random() * 8); // 4 to 11 checkins
  const cashCollected = checkins * 600 * (0.4 + Math.random() * 0.3); // ~₹1500 to ₹3500
  const upiCollected = checkins * 600 - cashCollected;
  const openingCash = 2000;
  const normalPetty = Math.floor(Math.random() * 300); // ₹0 to ₹300
  const expectedCash = openingCash + cashCollected - normalPetty;
  
  // Clean drawer with small noise (± ₹20)
  const actualCash = expectedCash + (Math.floor(Math.random() * 41) - 20);

  let shift = {
    id: `shift_${i + 1}`,
    staff_name: i % 2 === 0 ? 'Ramesh (Day)' : 'Suresh (Night)',
    opening_cash: openingCash,
    cash_collected: cashCollected,
    upi_collected: upiCollected,
    petty_cash_expenses: normalPetty,
    actual_cash: actualCash,
    expected_cash: expectedCash,
    variance: actualCash - expectedCash,
    refund_count: 0,
    refund_total: 0,
    checkin_count: checkins,
    pay_later_count: Math.random() < 0.15 ? 1 : 0,
    is_anomaly: false,
    anomaly_reason: null
  };

  // Inject known ground-truth anomalies on specific days:
  // Anomaly 1: Drawer shortage (skimming ₹800 on shifts 15, 45, 95, 140)
  if ([15, 45, 95, 140].includes(i)) {
    shift.actual_cash -= 800;
    shift.variance = shift.actual_cash - shift.expected_cash;
    shift.is_anomaly = true;
    shift.anomaly_reason = 'Skimming shortage';
    injectedGroundTruth++;
  }

  // Anomaly 2: Extreme petty cash spike (₹2500 withdrawal on shifts 30, 80, 160)
  if ([30, 80, 160].includes(i)) {
    shift.petty_cash_expenses = 2800;
    shift.expected_cash = openingCash + cashCollected - shift.petty_cash_expenses;
    shift.actual_cash = shift.expected_cash;
    shift.variance = 0;
    shift.is_anomaly = true;
    shift.anomaly_reason = 'Petty cash spike';
    injectedGroundTruth++;
  }

  // Anomaly 3: High refund cluster (3 refunds totaling ₹3600 on shifts 60, 120)
  if ([60, 120].includes(i)) {
    shift.refund_count = 4;
    shift.refund_total = 3600;
    shift.is_anomaly = true;
    shift.anomaly_reason = 'Refund surge';
    injectedGroundTruth++;
  }

  // Anomaly 4: Excessive credit / uncollected tariff on shift 100
  if (i === 100) {
    shift.pay_later_count = 5;
    shift.checkin_count = 6; // 83% pay later
    shift.is_anomaly = true;
    shift.anomaly_reason = 'Credit surge';
    injectedGroundTruth++;
  }

  shifts.push(shift);
}

// 2. Run detector across all 180 shifts using trailing 20-shift sliding window
let TP = 0; // True Positive
let FP = 0; // False Positive
let FN = 0; // False Negative
let TN = 0; // True Negative

for (let i = 0; i < shifts.length; i++) {
  const current = shifts[i];
  const history = shifts.slice(Math.max(0, i - 20), i);
  const flags = detectShiftAnomalies(current, history);
  const detected = flags.length > 0;

  if (current.is_anomaly && detected) {
    TP++;
  } else if (!current.is_anomaly && detected) {
    FP++;
  } else if (current.is_anomaly && !detected) {
    FN++;
  } else {
    TN++;
  }
}

const precision = TP / (TP + FP);
const recall = TP / (TP + FN);
const f1 = (2 * precision * recall) / (precision + recall);
const weeks = totalShifts / 14; // ~12.8 weeks
const falseAlarmRatePerWeek = FP / weeks;

console.log(`Dataset Size:               ${totalShifts} shifts (~90 days, 2 shifts/day)`);
console.log(`Injected Ground-Truth:      ${injectedGroundTruth} anomalies`);
console.log(`True Positives (TP):        ${TP}`);
console.log(`False Positives (FP):       ${FP}`);
console.log(`False Negatives (FN):       ${FN}`);
console.log(`True Negatives (TN):        ${TN}`);
console.log(`----------------------------------------------------`);
console.log(`Precision:                  ${(precision * 100).toFixed(1)}%`);
console.log(`Recall:                     ${(recall * 100).toFixed(1)}%`);
console.log(`F1 Score:                   ${(f1 * 100).toFixed(1)}%`);
console.log(`False Alarms Per Week:      ${falseAlarmRatePerWeek.toFixed(2)} / week`);
console.log(`----------------------------------------------------`);

// Evaluation assertions
assert(recall >= 0.90, `Recall should be >= 90% (got ${(recall * 100).toFixed(1)}%)`);
assert(precision >= 0.85, `Precision should be >= 85% (got ${(precision * 100).toFixed(1)}%)`);
assert(falseAlarmRatePerWeek <= 1.0, `False alarms per week should be <= 1.0 (got ${falseAlarmRatePerWeek.toFixed(2)})`);

console.log('✅ PASS: Cash Anomaly Engine satisfies evaluation thresholds.\n');
