// scripts/test-floors.mjs
// Unit tests for floor grouping, sorting, and labeling utilities

import assert from 'node:assert';

// Import floor logic
function floorLabel(n) {
  if (n === null || n === undefined) return 'No floor set';
  if (n < -1) return `Sub-Basement (${n})`;
  if (n === -1) return 'Basement';
  if (n === 0) return 'Ground floor';
  return `Floor ${n}`;
}

function floorChipLabel(n) {
  if (n === null || n === undefined) return 'None';
  if (n < -1) return `B${Math.abs(n)}`;
  if (n === -1) return 'B';
  if (n === 0) return 'G';
  return `F${n}`;
}

function parseFloorString(str) {
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

function resolveFloorNo(item) {
  if (item.floor_no !== undefined && item.floor_no !== null) return item.floor_no;
  return parseFloorString(item.floor);
}

function groupByFloor(rooms) {
  const map = new Map();
  for (const r of rooms) {
    const k = resolveFloorNo(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }

  return [...map.keys()]
    .sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(k => ({
      floor: k,
      title: floorLabel(k),
      chipLabel: floorChipLabel(k),
      data: map.get(k).sort((x, y) =>
        x.label.localeCompare(y.label, undefined, { numeric: true })
      )
    }));
}

console.log('--- Testing Floor Utilities ---');

// Test 1: Labels
assert.strictEqual(floorLabel(-1), 'Basement');
assert.strictEqual(floorLabel(0), 'Ground floor');
assert.strictEqual(floorLabel(1), 'Floor 1');
assert.strictEqual(floorLabel(10), 'Floor 10');
assert.strictEqual(floorLabel(null), 'No floor set');
console.log('✅ Test 1: floorLabel() formats correctly');

// Test 2: Parsing strings
assert.strictEqual(parseFloorString('Ground'), 0);
assert.strictEqual(parseFloorString('GF'), 0);
assert.strictEqual(parseFloorString('1st Floor'), 1);
assert.strictEqual(parseFloorString('2nd'), 2);
assert.strictEqual(parseFloorString('10'), 10);
assert.strictEqual(parseFloorString('Basement'), -1);
assert.strictEqual(parseFloorString('B'), -1);
assert.strictEqual(parseFloorString('invalid_text'), null);
console.log('✅ Test 2: parseFloorString() handles text formats');

// Test 3: groupByFloor with Basement, Ground, Floor 2, Floor 10, and No Floor
const mockRooms = [
  { id: 'r_none', label: 'Room Without Floor', floor: null, floor_no: null },
  { id: 'r_10_b', label: 'Room 1002', floor: '10', floor_no: 10 },
  { id: 'r_10_a', label: 'Room 1001', floor: '10', floor_no: 10 },
  { id: 'r_2', label: 'Room 201', floor: '2', floor_no: 2 },
  { id: 'r_0', label: 'Room 001', floor: 'Ground', floor_no: 0 },
  { id: 'r_b', label: 'Room B01', floor: 'Basement', floor_no: -1 }
];

const grouped = groupByFloor(mockRooms);

// Floors must be in order: -1 (Basement), 0 (Ground), 2 (Floor 2), 10 (Floor 10), and null (No floor set) last!
assert.strictEqual(grouped.length, 5);
assert.strictEqual(grouped[0].floor, -1, 'First floor should be Basement (-1)');
assert.strictEqual(grouped[1].floor, 0, 'Second floor should be Ground (0)');
assert.strictEqual(grouped[2].floor, 2, 'Third floor should be Floor 2');
assert.strictEqual(grouped[3].floor, 10, 'Fourth floor should be Floor 10 (2 must come before 10)');
assert.strictEqual(grouped[4].floor, null, 'Last group should be null (No floor set)');

// Room labels within Floor 10 must be sorted numerically (Room 1001 before Room 1002)
assert.strictEqual(grouped[3].data[0].label, 'Room 1001');
assert.strictEqual(grouped[3].data[1].label, 'Room 1002');

console.log('✅ Test 3: groupByFloor() properly sorts Basement -> Ground -> Floor 2 -> Floor 10 -> No Floor last');
console.log('--- ALL UNIT TESTS PASSED ---');
