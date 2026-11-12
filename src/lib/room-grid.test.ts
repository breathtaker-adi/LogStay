// src/lib/room-grid.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildFloorMapSections,
  compactRoomTileLabel,
  computeAvailabilitySummary,
  deriveFloorDescriptor,
  formatAvailabilityLabel,
  formatFloorEyebrow,
} from './room-grid';

describe('src/lib/room-grid.ts (Architectural Floor Map Grouping)', () => {
  const sampleRooms = [
    { id: 'r101', label: '101', kind: 'private', floor_no: 1 },
    { id: 'r102', label: 'Room 102', kind: 'private', floor_no: 1 },
    { id: 'r103', label: 'Dorm 103', kind: 'dorm', floor_no: 1 },
    { id: 'r201', label: '201', kind: 'private', floor_no: 2 },
    { id: 'r301', label: '301', kind: 'private', floor_no: 3, description: 'Corner Suite' },
    { id: 'r001', label: 'G1', kind: 'private', floor: 'Ground Floor' },
  ];

  const sampleUnits = [
    { id: 'u101', room_id: 'r101', label: '101', housekeeping_status: 'dirty' },
    { id: 'u102', room_id: 'r102', label: '102', housekeeping_status: 'clean' },
    { id: 'u103a', room_id: 'r103', label: 'Bed A', housekeeping_status: 'clean' },
    { id: 'u103b', room_id: 'r103', label: 'Bed B', housekeeping_status: 'clean' },
    { id: 'u201', room_id: 'r201', label: '201', housekeeping_status: 'maintenance' },
    { id: 'u301', room_id: 'r301', label: '301', housekeeping_status: 'clean' },
    { id: 'u001', room_id: 'r001', label: 'G1', housekeeping_status: 'clean' },
  ];

  it('orders floors from highest level at top down to ground and computes editorial headers', () => {
    const activeIds = new Set(['u301', 'u103a']);
    const { sections, counts } = buildFloorMapSections(sampleRooms, sampleUnits, activeIds);

    expect(sections.map((s) => s.eyebrow)).toEqual(['FLOOR 3', 'FLOOR 2', 'FLOOR 1', 'GROUND']);
    expect(sections[0].descriptor).toBe('Third Floor · Suites & Rooms');
    expect(sections[0].countLabel).toBe('1 room');
    expect(sections[2].descriptor).toBe('First Floor · Standard & Dorms');
    expect(sections[2].countLabel).toBe('3 rooms');

    expect(counts).toEqual({
      clean: 2, // 102 + G1
      occupied: 2, // 301 + Dorm 103 (1 of 2 occupied)
      dirty: 1, // 101
      maintenance: 1, // 201
    });

    const dormTile = sections[2].tiles.find((t) => t.roomId === 'r103');
    expect(dormTile?.isDorm).toBe(true);
    expect(dormTile?.freeBeds).toBe(1);
    expect(dormTile?.totalBeds).toBe(2);
    expect(dormTile?.dormSubLabel).toBe('1/2');
  });

  it('strips "Room " prefix cleanly and filters tiles by status', () => {
    expect(compactRoomTileLabel('Room 302')).toBe('302');
    expect(compactRoomTileLabel('Deluxe A')).toBe('Deluxe A');

    const { sections } = buildFloorMapSections(
      sampleRooms,
      sampleUnits,
      new Set(['u301']),
      'dirty'
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].tiles[0].roomId).toBe('r101');
  });

  it('formats special floor eyebrows and descriptors reliably', () => {
    expect(formatFloorEyebrow(null)).toBe('UNASSIGNED');
    expect(formatFloorEyebrow(-1)).toBe('BASEMENT');
    expect(deriveFloorDescriptor(0, [{ id: '1', label: 'D1', kind: 'dorm' }])).toBe(
      'Ground Floor · Dormitories'
    );
  });

  it('separates Rooms vs Beds free math when a property has 1 private room + 1 4-bed dorm', () => {
    const rooms = [
      { id: 'priv-1', label: '101', kind: 'private', floor_no: 1 },
      { id: 'dorm-1', label: 'Dorm A', kind: 'dorm', floor_no: 1 },
    ];
    const units = [
      { id: 'u-priv-1', room_id: 'priv-1', label: '101', housekeeping_status: 'clean' },
      { id: 'u-dorm-1', room_id: 'dorm-1', label: 'Bed 1', housekeeping_status: 'clean' },
      { id: 'u-dorm-2', room_id: 'dorm-1', label: 'Bed 2', housekeeping_status: 'clean' },
      { id: 'u-dorm-3', room_id: 'dorm-1', label: 'Bed 3', housekeeping_status: 'clean' },
      { id: 'u-dorm-4', room_id: 'dorm-1', label: 'Bed 4', housekeeping_status: 'clean' },
    ];

    const summary = computeAvailabilitySummary(rooms, units, new Set());
    expect(summary).toEqual({
      totalRooms: 2,
      totalBeds: 5,
      availableRooms: 2,
      fullyFreeRooms: 2,
      freeBeds: 5,
      occupiedBeds: 0,
      dirtyBeds: 0,
      maintenanceBeds: 0,
    });
    expect(formatAvailabilityLabel(summary)).toBe('2 Rooms • 5 Beds Free');

    const partial = computeAvailabilitySummary(rooms, units, new Set(['u-priv-1', 'u-dorm-1']));
    expect(partial.availableRooms).toBe(1);
    expect(partial.fullyFreeRooms).toBe(0);
    expect(partial.freeBeds).toBe(3);
    expect(formatAvailabilityLabel(partial)).toBe('1 Room • 3 Beds Free');
  });

  it('uses "N Free Rooms Available" only when every room is single-unit private', () => {
    const rooms = [
      { id: 'r1', label: '101', kind: 'private', floor_no: 1 },
      { id: 'r2', label: '102', kind: 'private', floor_no: 1 },
    ];
    const units = [
      { id: 'u1', room_id: 'r1', label: '101', housekeeping_status: 'clean' },
      { id: 'u2', room_id: 'r2', label: '102', housekeeping_status: 'clean' },
    ];

    const oneFree = computeAvailabilitySummary(rooms, units, new Set(['u1']));
    expect(formatAvailabilityLabel(oneFree)).toBe('1 Free Room Available');

    const twoFree = computeAvailabilitySummary(rooms, units, new Set());
    expect(formatAvailabilityLabel(twoFree)).toBe('2 Free Rooms Available');
  });
});

