import { describe, it, expect } from 'vitest';
import {
  floorLabel,
  floorChipLabel,
  parseFloorString,
  resolveFloorNo,
  groupByFloor,
} from './floors';

describe('src/lib/floors.ts (Floor Grouping, Parsing & Natural Sorting)', () => {
  describe('floorLabel formatting', () => {
    it.each([
      [-3, 'Sub-Basement (-3)'],
      [-2, 'Sub-Basement (-2)'],
      [-1, 'Basement'],
      [0, 'Ground floor'],
      [1, 'Floor 1'],
      [2, 'Floor 2'],
      [10, 'Floor 10'],
      [null, 'No floor set'],
      [undefined, 'No floor set'],
    ])('formats floor %s to label "%s"', (floor, expected) => {
      expect(floorLabel(floor)).toBe(expected);
    });
  });

  describe('floorChipLabel formatting', () => {
    it.each([
      [-3, 'B3'],
      [-2, 'B2'],
      [-1, 'B'],
      [0, 'G'],
      [1, 'F1'],
      [2, 'F2'],
      [10, 'F10'],
      [null, 'None'],
      [undefined, 'None'],
    ])('formats floor %s to compact chip "%s"', (floor, expected) => {
      expect(floorChipLabel(floor)).toBe(expected);
    });
  });

  describe('parseFloorString text normalizer', () => {
    it.each([
      ['0', 0],
      ['G', 0],
      ['g', 0],
      ['GF', 0],
      ['gf', 0],
      ['Ground', 0],
      ['ground floor', 0],
      ['groundfloor', 0],
      ['main floor', 0],
      [' -1 ', -1],
      ['b', -1],
      ['B', -1],
      ['b1', -1],
      ['Basement', -1],
      ['b2', -2],
      ['sub-basement', -2],
      ['1st', 1],
      ['1st floor', 1],
      ['1st Floor', 1],
      ['2nd', 2],
      ['3rd Floor', 3],
      ['4th', 4],
      ['10', 10],
      ['10th Floor', 10],
    ])('parses "%s" to floor number %i', (input, expected) => {
      expect(parseFloorString(input)).toBe(expected);
    });

    it.each(['', '   ', 'invalid_floor', 'wing-a', null, undefined])(
      'returns null for invalid or empty input "%s"',
      (input) => {
        expect(parseFloorString(input)).toBeNull();
      }
    );
  });

  describe('resolveFloorNo precedence', () => {
    it('prefers explicit numeric floor_no over legacy floor text string', () => {
      const room = { floor_no: 2, floor: 'Ground' };
      expect(resolveFloorNo(room)).toBe(2);
    });

    it('falls back to parsing legacy floor string if floor_no is null or undefined', () => {
      expect(resolveFloorNo({ floor_no: null, floor: 'Basement' })).toBe(-1);
      expect(resolveFloorNo({ floor: 'Ground' })).toBe(0);
      expect(resolveFloorNo({ floor: '3rd' })).toBe(3);
    });

    it('returns null if item is missing or has no floor metadata', () => {
      expect(resolveFloorNo(null)).toBeNull();
      expect(resolveFloorNo(undefined)).toBeNull();
      expect(resolveFloorNo({})).toBeNull();
      expect(resolveFloorNo({ floor: 'Unknown' })).toBeNull();
    });
  });

  describe('groupByFloor hierarchy & natural sorting', () => {
    const rooms = [
      { id: 'r_none', label: 'Suite No Floor', floor: null, floor_no: null },
      { id: 'r_10_b', label: 'Room 1002', floor: '10', floor_no: 10 },
      { id: 'r_10_a', label: 'Room 1001', floor: '10', floor_no: 10 },
      { id: 'r_2_b', label: 'Room 210', floor: '2', floor_no: 2 },
      { id: 'r_2_a', label: 'Room 202', floor: '2', floor_no: 2 },
      { id: 'r_0_b', label: 'Room 002', floor: 'Ground', floor_no: 0 },
      { id: 'r_0_a', label: 'Room 001', floor: 'Ground', floor_no: 0 },
      { id: 'r_b2', label: 'Cellar 02', floor: 'sub-basement', floor_no: -2 },
      { id: 'r_b1', label: 'Room B01', floor: 'Basement', floor_no: -1 },
    ];

    it('orders floors strictly: -2, -1 (Basement), 0 (Ground), 2, 10, with null ("No floor set") last', () => {
      const grouped = groupByFloor(rooms);

      expect(grouped.length).toBe(6);
      expect(grouped[0].floor).toBe(-2);
      expect(grouped[0].title).toBe('Sub-Basement (-2)');
      expect(grouped[0].chipLabel).toBe('B2');

      expect(grouped[1].floor).toBe(-1);
      expect(grouped[1].title).toBe('Basement');
      expect(grouped[1].chipLabel).toBe('B');

      expect(grouped[2].floor).toBe(0);
      expect(grouped[2].title).toBe('Ground floor');
      expect(grouped[2].chipLabel).toBe('G');

      expect(grouped[3].floor).toBe(2);
      expect(grouped[3].title).toBe('Floor 2');

      expect(grouped[4].floor).toBe(10);
      expect(grouped[4].title).toBe('Floor 10');

      expect(grouped[5].floor).toBeNull();
      expect(grouped[5].title).toBe('No floor set');
    });

    it('sorts rooms naturally within each floor (e.g. 202 before 210, 1001 before 1002)', () => {
      const grouped = groupByFloor(rooms);

      const floor2 = grouped.find((g) => g.floor === 2);
      expect(floor2?.data.map((r) => r.label)).toEqual(['Room 202', 'Room 210']);

      const floor10 = grouped.find((g) => g.floor === 10);
      expect(floor10?.data.map((r) => r.label)).toEqual(['Room 1001', 'Room 1002']);
    });

    it('does not mutate the original input array', () => {
      const copy = [...rooms];
      groupByFloor(rooms);
      expect(rooms).toEqual(copy);
    });

    it('returns empty array when input is empty', () => {
      expect(groupByFloor([])).toEqual([]);
    });
  });
});

