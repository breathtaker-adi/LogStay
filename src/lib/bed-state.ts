// Standardized bed and unit state evaluation across LogStay
// Section 3F: Single source of truth for occupancy and housekeeping colors

export type BedState = 'maintenance' | 'occupied' | 'dirty' | 'clean';

export interface BedUnit {
  id: string;
  room_id?: string;
  label?: string;
  housekeeping_status?: string | null;
  archived_at?: string | null;
}

/**
 * Computes unit state with explicit priority:
 * 1. Maintenance always overrides
 * 2. Active guest check-in (occupied) overrides dirty/clean
 * 3. Dirty overrides clean
 * 4. Clean is the default state
 */
export function bedState(
  unit: { id: string; housekeeping_status?: string | null },
  activeUnitIds: Set<string>
): BedState {
  if (unit.housekeeping_status === 'maintenance') return 'maintenance';
  if (activeUnitIds.has(unit.id)) return 'occupied';
  return unit.housekeeping_status === 'dirty' ? 'dirty' : 'clean';
}

export const BED_COLOR: Record<BedState, string> = {
  occupied: '#dc2626',   // Red
  dirty: '#f59e0b',      // Amber
  clean: '#16a34a',      // Green
  maintenance: '#6b7280' // Gray
};

export const BED_BG_LIGHT: Record<BedState, string> = {
  occupied: '#fee2e2',
  dirty: '#fef3c7',
  clean: '#dcfce7',
  maintenance: '#f3f4f6'
};

export const BED_LABELS: Record<BedState, string> = {
  occupied: 'Occupied',
  dirty: 'Dirty',
  clean: 'Clean',
  maintenance: 'Maintenance'
};

/**
 * Evaluates aggregated state of a dormitory room based on individual bed states.
 */
export function aggregateDormStatus(bedStates: BedState[]) {
  const total = bedStates.length;
  if (total === 0) {
    return { status: 'all_free' as const, freeCount: 0, totalCount: 0, badgeColor: BED_COLOR.clean, badgeText: '0 Beds' };
  }

  let occupied = 0;
  let dirty = 0;
  let maintenance = 0;
  let clean = 0;

  for (const s of bedStates) {
    if (s === 'occupied') occupied++;
    else if (s === 'dirty') dirty++;
    else if (s === 'maintenance') maintenance++;
    else clean++;
  }

  const freeCount = clean;

  if (occupied === total) {
    return { status: 'full' as const, freeCount: 0, totalCount: total, badgeColor: BED_COLOR.occupied, badgeText: 'Full' };
  }
  if (occupied === 0 && dirty === 0 && maintenance === 0) {
    return { status: 'all_free' as const, freeCount, totalCount: total, badgeColor: BED_COLOR.clean, badgeText: 'All Free' };
  }
  if (dirty > 0 && freeCount === 0 && occupied < total) {
    return { status: 'dirty' as const, freeCount, totalCount: total, badgeColor: BED_COLOR.dirty, badgeText: `${dirty} Dirty` };
  }

  return {
    status: 'some_free' as const,
    freeCount,
    totalCount: total,
    badgeColor: freeCount > 0 ? BED_COLOR.clean : BED_COLOR.occupied,
    badgeText: `${freeCount} available`
  };
}

/**
 * Progressive disclosure threshold:
 * If inventory exceeds 20 beds, check-in flow presents floors first, then rooms/beds.
 */
export function shouldShowFloorFirst(totalBedsCount: number): boolean {
  return totalBedsCount > 20;
}

/**
 * Validates gender compatibility for dorm assignment.
 * Female-only dorm strictly forbids male guests unless overridden.
 * Male-only dorm forbids female guests.
 * Mixed dorm allows all genders.
 */
export function isGenderAllowed(
  dormGenderRule?: string | null,
  guestGender?: string | null
): boolean {
  if (!dormGenderRule) return true;
  const rule = dormGenderRule.trim().toLowerCase();
  const gender = (guestGender || '').trim().toLowerCase();

  if (rule === 'female' || rule === 'female-only' || rule === 'female_only') {
    return gender === 'female';
  }
  if (rule === 'male' || rule === 'male-only' || rule === 'male_only') {
    return gender === 'male';
  }
  return true; // 'mixed' or any other rule allows all
}

/**
 * Calculates billable nights between check-in and check-out.
 * Standard hospitality: minimum 1 night.
 */
export function calculateStayNights(
  checkIn: Date | string,
  checkOut: Date | string
): number {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);

  // Normalize to dates ignoring time-of-day
  const inUtc = Date.UTC(inDate.getFullYear(), inDate.getMonth(), inDate.getDate());
  const outUtc = Date.UTC(outDate.getFullYear(), outDate.getMonth(), outDate.getDate());

  const diffMs = outUtc - inUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export interface DigestMetricsInput {
  totalUnits: number;
  maintenanceUnits: number;
  occupiedUnits: number;
  totalRoomRevenue: number;
}

export interface DigestMetricsOutput {
  availableUnits: number;
  occupancyRate: number; // Percentage 0 - 100
  adr: number;           // Average Daily Rate
  revpar: number;        // Revenue Per Available Room
}

/**
 * Computes hospitality KPIs (Occupancy %, ADR, RevPAR).
 * Out-of-order / maintenance rooms are subtracted from available inventory.
 */
export function calculateDigestMetrics(input: DigestMetricsInput): DigestMetricsOutput {
  const availableUnits = Math.max(0, input.totalUnits - input.maintenanceUnits);
  const occupiedUnits = Math.min(input.occupiedUnits, availableUnits);

  const occupancyRate =
    availableUnits > 0 ? (occupiedUnits / availableUnits) * 100 : 0;

  const adr =
    occupiedUnits > 0 ? input.totalRoomRevenue / occupiedUnits : 0;

  const revpar =
    availableUnits > 0 ? input.totalRoomRevenue / availableUnits : 0;

  return {
    availableUnits,
    occupancyRate: Math.round(occupancyRate * 10) / 10,
    adr: Math.round(adr * 100) / 100,
    revpar: Math.round(revpar * 100) / 100,
  };
}
