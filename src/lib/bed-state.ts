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
