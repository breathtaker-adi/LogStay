// src/lib/room-grid.ts
// Pure architectural floor-grid transformation & editorial labeling helpers.
// Extracted from UI component for deterministic Vitest verification.

import { bedState, BedState } from './bed-state';
import { resolveFloorNo } from './floors';

export interface GridRoomRecord {
  id: string;
  label: string;
  kind?: 'dorm' | 'private' | string | null;
  floor?: string | null;
  floor_no?: number | null;
  description?: string | null;
}

export interface GridUnitRecord {
  id: string;
  room_id: string;
  label: string;
  housekeeping_status?: string | null;
}

export interface RoomGridTile {
  roomId: string;
  primaryUnitId: string | null;
  rawLabel: string;
  shortLabel: string;
  isDorm: boolean;
  state: BedState;
  freeBeds: number;
  totalBeds: number;
  dormSubLabel?: string;
}

export interface FloorGridSection {
  key: string;
  floorNo: number | null;
  eyebrow: string;
  descriptor: string;
  countLabel: string;
  tiles: RoomGridTile[];
}

export interface AvailabilitySummary {
  totalRooms: number;
  totalBeds: number;
  /** Rooms that have at least one clean/free unit or bed */
  availableRooms: number;
  /** Rooms where every active unit/bed is clean/free */
  fullyFreeRooms: number;
  freeBeds: number;
  occupiedBeds: number;
  dirtyBeds: number;
  maintenanceBeds: number;
}

function getOrdinalWord(n: number): string {
  const words: Record<number, string> = {
    1: 'First',
    2: 'Second',
    3: 'Third',
    4: 'Fourth',
    5: 'Fifth',
    6: 'Sixth',
    7: 'Seventh',
    8: 'Eighth',
    9: 'Ninth',
    10: 'Tenth',
  };
  if (words[n]) return `${words[n]} Floor`;
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix} Floor`;
}

export function formatFloorEyebrow(floorNo: number | null): string {
  if (floorNo === null || floorNo === undefined) return 'UNASSIGNED';
  if (floorNo === 0) return 'GROUND';
  if (floorNo === -1) return 'BASEMENT';
  if (floorNo < -1) return `SUB-B${Math.abs(floorNo)}`;
  return `FLOOR ${floorNo}`;
}

export function deriveFloorDescriptor(
  floorNo: number | null,
  rawRooms: GridRoomRecord[]
): string {
  let prefix = 'Other Levels';
  if (floorNo === 0) prefix = 'Ground Floor';
  else if (floorNo === -1) prefix = 'Basement Level';
  else if (floorNo !== null && floorNo < -1) prefix = `Lower Basement ${Math.abs(floorNo)}`;
  else if (floorNo !== null && floorNo > 0) prefix = getOrdinalWord(floorNo);

  const hasDorm = rawRooms.some((r) => r.kind === 'dorm');
  const hasPrivate = rawRooms.some((r) => r.kind !== 'dorm');
  const hasSuite = rawRooms.some((r) =>
    /suite|penthouse|deluxe/i.test(`${r.label} ${r.description || ''}`)
  );

  let category = 'Guest Rooms';
  if (hasDorm && hasPrivate) category = 'Standard & Dorms';
  else if (hasDorm) category = 'Dormitories';
  else if (hasSuite) category = 'Suites & Rooms';

  return `${prefix} · ${category}`;
}

/**
 * Strips verbose prefixes ("Room 301" -> "301") for crisp architectural tile typography.
 */
export function compactRoomTileLabel(label: string): string {
  const cleaned = label.trim().replace(/^room\s+/i, '').trim();
  return cleaned || label.trim();
}

/**
 * Groups property rooms and bed units into descending architectural floor sections
 * (highest floor at top down to Ground / Basement, unassigned last).
 */
export function buildFloorMapSections(
  rooms: GridRoomRecord[],
  units: GridUnitRecord[],
  activeUnitIds: Set<string>,
  statusFilter: BedState | null = null
): { sections: FloorGridSection[]; counts: Record<BedState, number> } {
  const counts: Record<BedState, number> = {
    clean: 0,
    occupied: 0,
    dirty: 0,
    maintenance: 0,
  };

  const unitsByRoom = new Map<string, GridUnitRecord[]>();
  for (const u of units) {
    if (!unitsByRoom.has(u.room_id)) unitsByRoom.set(u.room_id, []);
    unitsByRoom.get(u.room_id)!.push(u);
  }

  const byFloor = new Map<number | null, { raw: GridRoomRecord; tile: RoomGridTile }[]>();

  for (const room of rooms) {
    const roomUnits = unitsByRoom.get(room.id) || [];
    const isDorm = room.kind === 'dorm' || roomUnits.length > 1;

    let state: BedState = 'clean';
    let freeBeds = 0;
    let occBeds = 0;
    let dirtyBeds = 0;
    let maintBeds = 0;

    if (roomUnits.length === 0) {
      freeBeds = 1;
      state = 'clean';
    } else {
      for (const u of roomUnits) {
        const s = bedState(u, activeUnitIds);
        if (s === 'occupied') occBeds++;
        else if (s === 'dirty') dirtyBeds++;
        else if (s === 'maintenance') maintBeds++;
        else freeBeds++;
      }

      if (isDorm) {
        if (maintBeds === roomUnits.length) state = 'maintenance';
        else if (occBeds > 0) state = 'occupied';
        else if (dirtyBeds > 0) state = 'dirty';
        else state = 'clean';
      } else {
        state = bedState(roomUnits[0], activeUnitIds);
      }
    }

    counts[state]++;

    if (statusFilter && state !== statusFilter) {
      continue;
    }

    const tile: RoomGridTile = {
      roomId: room.id,
      primaryUnitId: roomUnits[0]?.id ?? null,
      rawLabel: room.label,
      shortLabel: compactRoomTileLabel(room.label),
      isDorm,
      state,
      freeBeds,
      totalBeds: roomUnits.length,
      dormSubLabel: isDorm && roomUnits.length > 0 ? `${freeBeds}/${roomUnits.length}` : undefined,
    };

    const floorNo = resolveFloorNo(room);
    if (!byFloor.has(floorNo)) byFloor.set(floorNo, []);
    byFloor.get(floorNo)!.push({ raw: room, tile });
  }

  const sortedFloorKeys = [...byFloor.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });

  const sections: FloorGridSection[] = sortedFloorKeys.map((floorNo) => {
    const entries = byFloor
      .get(floorNo)!
      .sort((x, y) =>
        x.tile.rawLabel.localeCompare(y.tile.rawLabel, undefined, { numeric: true })
      );
    const totalCount = entries.length;
    return {
      key: floorNo === null ? 'floor_none' : `floor_${floorNo}`,
      floorNo,
      eyebrow: formatFloorEyebrow(floorNo),
      descriptor: deriveFloorDescriptor(
        floorNo,
        entries.map((e) => e.raw)
      ),
      countLabel: `${totalCount} ${totalCount === 1 ? 'room' : 'rooms'}`,
      tiles: entries.map((e) => e.tile),
    };
  });

  return { sections, counts };
}

/**
 * Separates property-level room counts from unit/bed capacity counts so
 * mixed private-room + dormitory properties never mislabel free dorm beds as "Free Rooms".
 */
export function computeAvailabilitySummary(
  rooms: GridRoomRecord[],
  units: GridUnitRecord[],
  activeUnitIds: Set<string>
): AvailabilitySummary {
  const unitsByRoom = new Map<string, GridUnitRecord[]>();
  for (const unit of units) {
    if (!unitsByRoom.has(unit.room_id)) unitsByRoom.set(unit.room_id, []);
    unitsByRoom.get(unit.room_id)!.push(unit);
  }

  let totalBeds = 0;
  let availableRooms = 0;
  let fullyFreeRooms = 0;
  let freeBeds = 0;
  let occupiedBeds = 0;
  let dirtyBeds = 0;
  let maintenanceBeds = 0;

  for (const room of rooms) {
    const roomUnits = unitsByRoom.get(room.id) || [];
    if (roomUnits.length === 0) continue;

    let roomFree = 0;
    for (const unit of roomUnits) {
      totalBeds++;
      const state = bedState(unit, activeUnitIds);
      if (state === 'occupied') occupiedBeds++;
      else if (state === 'dirty') dirtyBeds++;
      else if (state === 'maintenance') maintenanceBeds++;
      else {
        freeBeds++;
        roomFree++;
      }
    }

    if (roomFree > 0) availableRooms++;
    if (roomFree === roomUnits.length) fullyFreeRooms++;
  }

  return {
    totalRooms: rooms.length,
    totalBeds,
    availableRooms,
    fullyFreeRooms,
    freeBeds,
    occupiedBeds,
    dirtyBeds,
    maintenanceBeds,
  };
}

/**
 * Formats the primary free-capacity headline for Home footer & Bottom Sheet.
 */
export function formatAvailabilityLabel(summary: AvailabilitySummary): string {
  const hasDormsOrMultiBed = summary.totalBeds > summary.totalRooms;
  if (!hasDormsOrMultiBed) {
    const roomWord = summary.availableRooms === 1 ? 'Room' : 'Rooms';
    return `${summary.availableRooms} Free ${roomWord} Available`;
  }
  const roomWord = summary.availableRooms === 1 ? 'Room' : 'Rooms';
  const bedWord = summary.freeBeds === 1 ? 'Bed' : 'Beds';
  return `${summary.availableRooms} ${roomWord} • ${summary.freeBeds} ${bedWord} Free`;
}


