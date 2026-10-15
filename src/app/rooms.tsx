// src/app/rooms.tsx
// Comprehensive Floor-Grouped Room & Bed Matrix
// High-fidelity UI matching HomeScreen aesthetics with status pills, bed matrix, and animations

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  LayoutAnimation
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { ScreenHeader } from '@/lib/screen-header';
import {
  isOnline,
  processOutbox,
  getRoomsCache,
  getUnitsCache,
  getStaysCache,
  cacheRooms,
  cacheUnits,
  cacheStays
} from '@/lib/offline';
import { bedState, BED_COLOR, BED_LABELS, BedState } from '@/lib/bed-state';
import { groupByFloor } from '@/lib/floors';

interface UnitItem {
  id: string;
  room_id: string;
  label: string;
  housekeeping_status: string;
  gender_rule?: string;
}

interface RoomGroup {
  id: string;
  label: string;
  kind: 'dorm' | 'private';
  floor?: string | null;
  floor_no?: number | null;
  units: UnitItem[];
}

type FilterStatus = 'free' | 'occupied' | 'dirty' | 'maintenance';

export default function RoomsScreen() {
  const { can } = useStaff();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = (params.filter as FilterStatus) || null;

  const [activeFilter, setActiveFilter] = useState<FilterStatus | null>(initialFilter);
  const [selectedFloor, setSelectedFloor] = useState<number | null | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>('');
  
  const [rooms, setRooms] = useState<RoomGroup[]>([]);
  const [activeUnitIds, setActiveUnitIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState({ free: 0, occupied: 0, dirty: 0, maintenance: 0, totalBeds: 0 });

  useEffect(() => {
    if (params.filter !== undefined) {
      setActiveFilter((params.filter as FilterStatus) || null);
    }
  }, [params.filter]);

  const loadData = useCallback(async () => {
    try {
      const online = await isOnline();

      if (online) {
        const { data: memberData } = await supabase
          .from('members')
          .select('property_id')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (memberData?.property_id) {
          const propId = memberData.property_id;
          
          // 1. Fetch active rooms
          const { data: roomsData } = await supabase
            .from('rooms')
            .select('id, property_id, label, kind, floor, floor_no')
            .eq('property_id', propId)
            .is('archived_at', null)
            .order('label');

          const roomIds = (roomsData || []).map(r => r.id);

          // 2. Fetch active units
          let unitsData: any[] = [];
          if (roomIds.length > 0) {
            const { data: uData } = await supabase
              .from('units')
              .select('id, room_id, label, gender_rule, housekeeping_status')
              .in('room_id', roomIds)
              .is('archived_at', null)
              .order('label');
            unitsData = uData || [];
          }

          // 3. Fetch active stays
          const { data: staysData } = await supabase
            .from('stays')
            .select('id, property_id, unit_id, status')
            .eq('property_id', propId)
            .eq('status', 'checked_in');

          // Update SQLite caches
          if (roomsData) cacheRooms(roomsData);
          if (unitsData) cacheUnits(unitsData);
          if (staysData) cacheStays(staysData);
        }
      }

      // Read from standardized SQLite cache
      const cachedRooms = getRoomsCache() || [];
      const cachedUnits = getUnitsCache() || [];
      const cachedStays = getStaysCache() || [];

      const occIds = new Set<string>(cachedStays.map((s: any) => s.unit_id));
      setActiveUnitIds(occIds);

      // Group units by room
      const grouped: RoomGroup[] = cachedRooms.map((r: any) => {
        const roomUnits = cachedUnits.filter((u: any) => u.room_id === r.id);
        return {
          id: r.id,
          label: r.label,
          kind: r.kind || 'private',
          floor: r.floor || null,
          floor_no: r.floor_no !== undefined ? r.floor_no : null,
          units: roomUnits
        };
      });

      setRooms(grouped);

      // Compute status counts
      let freeCount = 0;
      let occCount = 0;
      let dirtyCount = 0;
      let maintCount = 0;

      cachedUnits.forEach((u: any) => {
        const state = bedState(u, occIds);
        if (state === 'occupied') occCount++;
        else if (state === 'dirty') dirtyCount++;
        else if (state === 'maintenance') maintCount++;
        else freeCount++;
      });

      setCounts({
        free: freeCount,
        occupied: occCount,
        dirty: dirtyCount,
        maintenance: maintCount,
        totalBeds: cachedUnits.length
      });

      setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      console.error('Error loading rooms matrix:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await processOutbox();
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const setFilterWithAnimation = (filter: FilterStatus | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFilter(filter);
  };

  // Apply status filter — only show rooms that contain at least one matching unit
  const filteredRooms = activeFilter
    ? rooms.map(room => ({
        ...room,
        units: room.units.filter(u => {
          const state = bedState(u, activeUnitIds);
          if (activeFilter === 'free') return state === 'clean';
          return state === activeFilter;
        })
      })).filter(room => room.units.length > 0)
    : rooms;

  // Group rooms by floor using standardized utility
  const allFloorGroups = groupByFloor(rooms);
  const floorGroups = groupByFloor(filteredRooms).filter(fg => {
    if (selectedFloor === 'all') return true;
    return fg.floor === selectedFloor;
  });

  if (loading && rooms.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Rooms & Beds"
        subtitle={lastSynced ? `Synced ${lastSynced} • ${counts.totalBeds} Total Beds` : `${counts.totalBeds} Total Beds`}
        right={
          can('settings') ? (
            <TouchableOpacity
              style={styles.addRoomBtn}
              onPress={() => router.push('/add-room')}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={styles.addRoomText}>Add Room</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ── FLOOR BAR (ROW OF CHIPS) ─────────────────────────────── */}
      {allFloorGroups.length > 0 && (
        <View style={styles.floorBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorBarScroll}
          >
            <Pressable
              style={[
                styles.floorChip,
                selectedFloor === 'all' ? styles.floorChipActive : styles.floorChipInactive
              ]}
              onPress={() => setSelectedFloor('all')}
            >
              <Ionicons
                name="layers-outline"
                size={13}
                color={selectedFloor === 'all' ? '#ffffff' : '#475569'}
              />
              <Text
                style={[
                  styles.floorChipText,
                  selectedFloor === 'all' && styles.floorChipTextActive
                ]}
              >
                All ({rooms.length})
              </Text>
            </Pressable>

            {allFloorGroups.map(fg => {
              const isSelected = selectedFloor === fg.floor;
              return (
                <Pressable
                  key={fg.floor !== null ? `chip_${fg.floor}` : 'chip_none'}
                  style={[
                    styles.floorChip,
                    isSelected ? styles.floorChipActive : styles.floorChipInactive
                  ]}
                  onPress={() => setSelectedFloor(isSelected ? 'all' : fg.floor)}
                >
                  <Text
                    style={[
                      styles.floorChipText,
                      isSelected && styles.floorChipTextActive
                    ]}
                  >
                    {fg.chipLabel} ({fg.data.length})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── INTERACTIVE STATUS FILTER PILLS ───────────────────────── */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {/* All Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === null ? styles.filterPillActiveAll : styles.filterPillInactive
            ]}
            onPress={() => setFilterWithAnimation(null)}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === null ? styles.filterPillTextActive : styles.filterPillTextInactive
              ]}
            >
              All Beds ({counts.totalBeds})
            </Text>
          </Pressable>

          {/* Free Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === 'free'
                ? { backgroundColor: '#16a34a', borderColor: '#16a34a' }
                : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'free' ? null : 'free')}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'free' ? '#ffffff' : '#16a34a' }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'free' ? '#ffffff' : '#166534' }
              ]}
            >
              Free: {counts.free}
            </Text>
          </Pressable>

          {/* Occupied Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === 'occupied'
                ? { backgroundColor: '#dc2626', borderColor: '#dc2626' }
                : { backgroundColor: '#fef2f2', borderColor: '#fecaca' }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'occupied' ? null : 'occupied')}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'occupied' ? '#ffffff' : '#dc2626' }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'occupied' ? '#ffffff' : '#991b1b' }
              ]}
            >
              Occupied: {counts.occupied}
            </Text>
          </Pressable>

          {/* Dirty Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === 'dirty'
                ? { backgroundColor: '#ca8a04', borderColor: '#ca8a04' }
                : { backgroundColor: '#fffbeb', borderColor: '#fde68a' }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'dirty' ? null : 'dirty')}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'dirty' ? '#ffffff' : '#ca8a04' }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'dirty' ? '#ffffff' : '#854d0e' }
              ]}
            >
              Dirty: {counts.dirty}
            </Text>
          </Pressable>

          {/* Maintenance Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === 'maintenance'
                ? { backgroundColor: '#475569', borderColor: '#475569' }
                : { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'maintenance' ? null : 'maintenance')}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'maintenance' ? '#ffffff' : '#64748b' }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'maintenance' ? '#ffffff' : '#334155' }
              ]}
            >
              Maint: {counts.maintenance}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ── ROOMS & BEDS CONTENT ─────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {floorGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="bed-outline" size={42} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter ? `No ${activeFilter} rooms found` : 'No rooms added yet'}
            </Text>
            <Text style={styles.emptyText}>
              {activeFilter
                ? 'Try selecting another status filter or reset to view all rooms.'
                : 'Get started by creating your property rooms and dorm beds.'}
            </Text>
            {activeFilter ? (
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setFilterWithAnimation(null)}
              >
                <Text style={styles.emptyActionText}>Show All Rooms</Text>
              </TouchableOpacity>
            ) : can('settings') ? (
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => router.push('/add-room')}
              >
                <Text style={styles.emptyActionText}>+ Create Your First Room</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          floorGroups.map(fg => {
            const floorRooms = fg.data;

            // Compute floor-level occupancy and cleaning counts
            let floorTotalBeds = 0;
            let floorOccupiedBeds = 0;
            let floorDirtyBeds = 0;
            let floorMaintBeds = 0;

            floorRooms.forEach(r => {
              r.units.forEach(u => {
                floorTotalBeds++;
                const s = bedState(u, activeUnitIds);
                if (s === 'occupied') floorOccupiedBeds++;
                else if (s === 'dirty') floorDirtyBeds++;
                else if (s === 'maintenance') floorMaintBeds++;
              });
            });

            const floorCleanBeds = floorTotalBeds - floorOccupiedBeds - floorDirtyBeds - floorMaintBeds;
            let floorCountsText = `${floorOccupiedBeds} of ${floorTotalBeds} beds taken`;
            if (floorDirtyBeds > 0) {
              floorCountsText += `, ${floorDirtyBeds} needs cleaning`;
            } else if (floorTotalBeds > 0 && floorCleanBeds === floorTotalBeds) {
              floorCountsText = `All ${floorTotalBeds} beds free`;
            } else if (floorOccupiedBeds === floorTotalBeds && floorTotalBeds > 0) {
              floorCountsText = `Full (${floorTotalBeds} beds)`;
            }

            return (
              <View key={fg.floor !== null ? `floor_${fg.floor}` : 'floor_none'} style={styles.floorSection}>
                <View style={styles.floorHeaderRow}>
                  <View style={styles.floorBadge}>
                    <Ionicons name="layers-outline" size={13} color="#475569" />
                    <Text style={styles.floorTitle}>{fg.title.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.floorCountText}>{floorCountsText}</Text>
                </View>

                {fg.floor === null && can('settings') && (
                  <View style={styles.noFloorNotice}>
                    <Ionicons name="alert-circle-outline" size={15} color="#b45309" />
                    <Text style={styles.noFloorNoticeText}>
                      No floor set for these rooms. Edit room details to assign a floor.
                    </Text>
                  </View>
                )}

                <View style={styles.grid}>
                  {floorRooms.map(room => {
                    const isDorm = room.kind === 'dorm';
                    const units = room.units;
                    const totalBeds = units.length;
                    const occupiedBeds = units.filter(u => activeUnitIds.has(u.id)).length;
                    const dirtyBeds = units.filter(u => u.housekeeping_status === 'dirty').length;
                    const maintBeds = units.filter(u => u.housekeeping_status === 'maintenance').length;
                    const cleanBeds = totalBeds - occupiedBeds - dirtyBeds - maintBeds;

                    if (isDorm) {
                      // Composite status evaluation
                      let dormStatusBadge = { text: 'All Free', bg: '#dcfce7', color: '#166534', dot: '#16a34a' };
                      if (totalBeds > 0 && occupiedBeds === totalBeds) {
                        dormStatusBadge = { text: 'Full', bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' };
                      } else if (occupiedBeds > 0) {
                        dormStatusBadge = { text: `${occupiedBeds}/${totalBeds} Taken`, bg: '#fffbeb', color: '#b45309', dot: '#d97706' };
                      } else if (dirtyBeds > 0) {
                        dormStatusBadge = { text: 'Needs Clean', bg: '#fef3c7', color: '#92400e', dot: '#ca8a04' };
                      }

                      const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) : 0;

                      return (
                        <Pressable
                          key={room.id}
                          style={styles.card}
                          onPress={() => router.push({ pathname: '/dorm/[roomId]', params: { roomId: room.id } })}
                        >
                          {/* Top Header */}
                          <View style={styles.cardHeader}>
                            <View style={styles.roomIconWrapper}>
                              <MaterialCommunityIcons name="bunk-bed-outline" size={20} color="#2563eb" />
                            </View>
                            <View style={styles.roomTitleGroup}>
                              <Text style={styles.roomLabel} numberOfLines={1}>{room.label}</Text>
                              <Text style={styles.roomKindText}>Dorm • {totalBeds} Beds</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: dormStatusBadge.bg }]}>
                              <View style={[styles.statusDot, { backgroundColor: dormStatusBadge.dot }]} />
                              <Text style={[styles.statusPillText, { color: dormStatusBadge.color }]}>
                                {dormStatusBadge.text}
                              </Text>
                            </View>
                          </View>

                          {/* Occupancy Bar */}
                          <View style={styles.progressContainer}>
                            <View
                              style={[
                                styles.progressBar,
                                {
                                  width: `${Math.round(occupancyRate * 100)}%`,
                                  backgroundColor: occupancyRate === 1 ? '#dc2626' : '#2563eb'
                                }
                              ]}
                            />
                          </View>

                          {/* Mini Bed Matrix Preview */}
                          <View style={styles.bedChipsRow}>
                            {units.slice(0, 8).map(u => {
                              const bState = bedState(u, activeUnitIds);
                              const bColor = BED_COLOR[bState];
                              return (
                                <View key={u.id} style={styles.miniBedChip}>
                                  <View style={[styles.miniBedDot, { backgroundColor: bColor }]} />
                                  <Text style={styles.miniBedText} numberOfLines={1}>{u.label}</Text>
                                </View>
                              );
                            })}
                            {units.length > 8 && (
                              <Text style={styles.moreBedsText}>+{units.length - 8} more</Text>
                            )}
                          </View>

                          {/* Warnings & Footer */}
                          <View style={styles.cardFooter}>
                            {dirtyBeds > 0 ? (
                              <View style={styles.dirtyBadge}>
                                <Ionicons name="sparkles" size={11} color="#b45309" />
                                <Text style={styles.dirtyBadgeText}>
                                  {dirtyBeds} dirty
                                </Text>
                              </View>
                            ) : maintBeds > 0 ? (
                              <View style={[styles.dirtyBadge, { backgroundColor: '#f1f5f9' }]}>
                                <Ionicons name="construct" size={11} color="#475569" />
                                <Text style={[styles.dirtyBadgeText, { color: '#475569' }]}>
                                  {maintBeds} maint
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.cleanBadgeText}>
                                {cleanBeds} available
                              </Text>
                            )}
                            <View style={styles.viewLink}>
                              <Text style={styles.viewLinkText}>View Beds</Text>
                              <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                            </View>
                          </View>
                        </Pressable>
                      );
                    }

                    // Private room: represents a single unit
                    const unit = units[0];
                    const state: BedState = unit ? bedState(unit, activeUnitIds) : 'clean';
                    const stateLabel = BED_LABELS[state];

                    const stateTheme = {
                      clean: { bg: '#dcfce7', text: '#166534', dot: '#16a34a', icon: 'checkmark-circle-outline' },
                      occupied: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626', icon: 'person-circle-outline' },
                      dirty: { bg: '#fffbeb', text: '#92400e', dot: '#d97706', icon: 'sparkles-outline' },
                      maintenance: { bg: '#f1f5f9', text: '#334155', dot: '#64748b', icon: 'construct-outline' }
                    }[state] || { bg: '#f1f5f9', text: '#334155', dot: '#64748b', icon: 'help-circle-outline' };

                    return (
                      <Pressable
                        key={room.id}
                        style={styles.card}
                        onPress={() => {
                          if (unit) {
                            router.push(`/room/${unit.id}`);
                          } else {
                            Alert.alert('Notice', 'No unit found for this room.');
                          }
                        }}
                      >
                        <View style={styles.cardHeader}>
                          <View style={[styles.roomIconWrapper, { backgroundColor: '#f0fdf4' }]}>
                            <MaterialCommunityIcons name="bed-king-outline" size={20} color="#059669" />
                          </View>
                          <View style={styles.roomTitleGroup}>
                            <Text style={styles.roomLabel} numberOfLines={1}>{room.label}</Text>
                            <Text style={styles.roomKindText}>Private Room</Text>
                          </View>
                          <View style={[styles.statusPill, { backgroundColor: stateTheme.bg }]}>
                            <View style={[styles.statusDot, { backgroundColor: stateTheme.dot }]} />
                            <Text style={[styles.statusPillText, { color: stateTheme.text }]}>
                              {stateLabel}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.privateInfoRow}>
                          <Ionicons name={stateTheme.icon as any} size={15} color={stateTheme.text} />
                          <Text style={[styles.privateInfoText, { color: stateTheme.text }]}>
                            {state === 'clean'
                              ? 'Ready for instant check-in'
                              : state === 'occupied'
                              ? 'Currently occupied by guest'
                              : state === 'dirty'
                              ? 'Awaiting housekeeping service'
                              : 'Temporarily out of service'}
                          </Text>
                        </View>

                        <View style={styles.cardFooter}>
                          <Text style={styles.floorPillText}>{room.floor}</Text>
                          <View style={styles.viewLink}>
                            <Text style={styles.viewLinkText}>Manage</Text>
                            <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  addRoomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  addRoomText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  },
  floorBarContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8
  },
  floorBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1
  },
  floorChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  floorChipInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  },
  floorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  floorChipTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  noFloorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
    marginBottom: 10
  },
  noFloorNoticeText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '500',
    flex: 1
  },
  filterBarContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 10
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1
  },
  filterPillActiveAll: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a'
  },
  filterPillInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700'
  },
  filterPillTextActive: {
    color: '#ffffff'
  },
  filterPillTextInactive: {
    color: '#475569'
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  floorSection: {
    marginBottom: 20
  },
  floorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  floorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  floorTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.6
  },
  floorCountText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
  },
  grid: {
    gap: 12
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  roomIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  roomTitleGroup: {
    flex: 1
  },
  roomLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  roomKindText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700'
  },
  progressContainer: {
    height: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12
  },
  progressBar: {
    height: '100%',
    borderRadius: 3
  },
  bedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12
  },
  miniBedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  miniBedDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  miniBedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155'
  },
  moreBedsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    alignSelf: 'center',
    marginLeft: 2
  },
  privateInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  privateInfoText: {
    fontSize: 12,
    fontWeight: '600'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc'
  },
  dirtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  dirtyBadgeText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '700'
  },
  cleanBadgeText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600'
  },
  floorPillText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500'
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  viewLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb'
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center'
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20
  },
  emptyActionBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10
  },
  emptyActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  }
});
