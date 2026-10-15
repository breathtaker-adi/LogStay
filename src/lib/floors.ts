// src/lib/floors.ts
// Standardized floor grouping, parsing, and labeling utilities for LogStay

export const floorLabel = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return 'No floor set';
  if (n < -1) return `Sub-Basement (${n})`;
  if (n === -1) return 'Basement';
  if (n === 0) return 'Ground floor';
  return `Floor ${n}`;
};

export const floorChipLabel = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return 'None';
  if (n < -1) return `B${Math.abs(n)}`;
  if (n === -1) return 'B';
  if (n === 0) return 'G';
  return `F${n}`;
};

export function parseFloorString(str?: string | null): number | null {
  if (!str) return null;
  const tr = str.trim().toLowerCase();
  if (/^-?\d+$/.test(tr)) return parseInt(tr, 10);
  if (['g', 'gf', 'ground', 'ground floor', 'groundfloor', 'main floor'].includes(tr)) return 0;
  if (['b', 'basement', 'b1'].includes(tr)) return -1;
  if (['b2', 'sub-basement'].includes(tr)) return -2;
  const numMatch = tr.match(/^(\d+)(?:st|nd|rd|th)?(?:\s*floor)?$/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return null;
}

export function resolveFloorNo(item?: { floor_no?: number | null; floor?: string | null } | null): number | null {
  if (!item) return null;
  if (item.floor_no !== undefined && item.floor_no !== null) return item.floor_no;
  return parseFloorString(item.floor);
}

export interface FloorGroup<T> {
  floor: number | null;
  title: string;
  chipLabel: string;
  data: T[];
}

export function groupByFloor<T extends { floor_no?: number | null; floor?: string | null; label: string }>(
  rooms: T[]
): FloorGroup<T>[] {
  const map = new Map<number | null, T[]>();
  for (const r of rooms) {
    const k = resolveFloorNo(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }

  // Sort floors: -2, -1 (Basement), 0 (Ground), 1, 2, 3 ... and null ("No floor set") last
  return [...map.keys()]
    .sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(k => ({
      floor: k,
      title: floorLabel(k),
      chipLabel: floorChipLabel(k),
      data: map.get(k)!.sort((x, y) =>
        x.label.localeCompare(y.label, undefined, { numeric: true })
      )
    }));
}
