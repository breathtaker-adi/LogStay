// src/services/room.service.ts
// Business Logic for Rooms, Units, and Floor Operations

import { supabase } from '@/lib/supabase';
import { floorLabel } from '@/lib/floors';

export interface RoomRecord {
  id: string;
  property_id: string;
  label: string;
  kind: 'dorm' | 'private';
  floor?: string | null;
  floor_no?: number | null;
  description?: string | null;
  archived_at?: string | null;
  created_at?: string;
}

export interface UnitRecord {
  id: string;
  room_id: string;
  label: string;
  housekeeping_status: string;
  gender_rule?: string;
  archived_at?: string | null;
}

export interface CreateRoomParams {
  roomId?: string;
  label: string;
  kind: 'private' | 'dorm';
  floorNo: number;
  bedCount?: number;
  description?: string;
  unitIds?: string[];
}

export class RoomService {
  /**
   * Fetches active rooms for a property
   */
  static async getRooms(propertyId: string): Promise<RoomRecord[]> {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', propertyId)
      .is('archived_at', null)
      .order('label', { ascending: true });

    if (error) throw error;
    return (data || []) as RoomRecord[];
  }

  /**
   * Fetches units belonging to active rooms
   */
  static async getUnits(propertyId: string): Promise<UnitRecord[]> {
    const { data, error } = await supabase
      .from('units')
      .select('id, room_id, label, housekeeping_status, gender_rule, archived_at')
      .eq('property_id', propertyId)
      .is('archived_at', null)
      .order('label', { ascending: true });

    if (error) throw error;
    return (data || []) as UnitRecord[];
  }

  /**
   * Adds a room with units atomically via RPC
   */
  static async addRoomWithUnits(params: CreateRoomParams): Promise<void> {
    const numBeds = params.kind === 'dorm' ? (params.bedCount || 1) : 1;
    const unitIds = params.unitIds || Array.from({ length: numBeds }, () =>
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          })
    );
    const roomId =
      params.roomId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));
    const floorStr = floorLabel(params.floorNo);

    const { error } = await supabase.rpc('add_room_with_units', {
      p_room_id: roomId,
      p_label: params.label.trim(),
      p_kind: params.kind,
      p_floor: floorStr,
      p_unit_ids: unitIds,
      p_unit_labels: null,
      p_gender_rule: 'any',
      p_floor_no: params.floorNo,
      p_description: params.description?.trim() || null,
    });

    if (error) throw error;
  }

  /**
   * Soft-archives a room
   */
  static async archiveRoom(roomId: string): Promise<void> {
    const { error } = await supabase
      .from('rooms')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', roomId);

    if (error) throw error;
  }
}
