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
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
import { useTheme } from '@/hooks/use-theme';

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
  description?: string | null;
  units: UnitItem[];
}

type FilterStatus = 'free' | 'occupied' | 'dirty' | 'maintenance';

export default function RoomsScreen() {
  const { can } = useStaff();
  const theme = useTheme();
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
            .select('id, property_id, label, kind, floor, floor_no, description')
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
          description: r.description || null,
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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Rooms & Beds"
        subtitle={lastSynced ? `Synced ${lastSynced} • ${counts.totalBeds} Total Beds` : `${counts.totalBeds} Total Beds`}
        right={
          can('settings') ? (
            <TouchableOpacity
              style={[styles.addRoomBtn, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/add-room')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add new room"
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={styles.addRoomText}>Add Room</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ── FLOOR BAR (ROW OF CHIPS) ─────────────────────────────── */}
      {allFloorGroups.length > 0 && (
        <View style={[styles.floorBarContainer, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.separator }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorBarScroll}
          >
            <Pressable
              style={[
                styles.floorChip,
                selectedFloor === 'all'
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }
              ]}
              onPress={() => setSelectedFloor('all')}
              accessibilityRole="button"
              accessibilityLabel={`All floors, ${rooms.length} rooms`}
            >
              <Ionicons
                name="layers-outline"
                size={13}
                color={selectedFloor === 'all' ? '#ffffff' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.floorChipText,
                  { color: selectedFloor === 'all' ? '#ffffff' : theme.textSecondary },
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
                    isSelected
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }
                  ]}
                  onPress={() => setSelectedFloor(isSelected ? 'all' : fg.floor)}
                  accessibilityRole="button"
                  accessibilityLabel={`${fg.chipLabel}, ${fg.data.length} rooms`}
                >
                  <Text
                    style={[
                      styles.floorChipText,
                      { color: isSelected ? '#ffffff' : theme.textSecondary },
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
      <View style={[styles.filterBarContainer, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.separator }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {/* All Filter Pill */}
          <Pressable
            style={[
              styles.filterPill,
              activeFilter === null
                ? { backgroundColor: theme.text, borderColor: theme.text }
                : { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }
            ]}
            onPress={() => setFilterWithAnimation(null)}
            accessibilityRole="button"
            accessibilityLabel={`All beds, ${counts.totalBeds} total`}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === null ? theme.backgroundElement : theme.textSecondary }
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
                ? { backgroundColor: theme.free, borderColor: theme.free }
                : { backgroundColor: theme.freeSubtle, borderColor: theme.freeSubtle }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'free' ? null : 'free')}
            accessibilityRole="button"
            accessibilityLabel={`Filter by Free beds, ${counts.free} available`}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'free' ? '#ffffff' : theme.free }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'free' ? '#ffffff' : theme.free }
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
                ? { backgroundColor: theme.occupied, borderColor: theme.occupied }
                : { backgroundColor: theme.occupiedSubtle, borderColor: theme.occupiedSubtle }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'occupied' ? null : 'occupied')}
            accessibilityRole="button"
            accessibilityLabel={`Filter by Occupied beds, ${counts.occupied} occupied`}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'occupied' ? '#ffffff' : theme.occupied }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'occupied' ? '#ffffff' : theme.occupied }
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
                ? { backgroundColor: theme.dirty, borderColor: theme.dirty }
                : { backgroundColor: theme.dirtySubtle, borderColor: theme.dirtySubtle }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'dirty' ? null : 'dirty')}
            accessibilityRole="button"
            accessibilityLabel={`Filter by Dirty beds, ${counts.dirty} dirty`}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'dirty' ? '#ffffff' : theme.dirty }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'dirty' ? '#ffffff' : theme.dirty }
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
                ? { backgroundColor: theme.maintenance, borderColor: theme.maintenance }
                : { backgroundColor: theme.maintenanceSubtle, borderColor: theme.separator }
            ]}
            onPress={() => setFilterWithAnimation(activeFilter === 'maintenance' ? null : 'maintenance')}
            accessibilityRole="button"
            accessibilityLabel={`Filter by Maintenance beds, ${counts.maintenance} in maintenance`}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: activeFilter === 'maintenance' ? '#ffffff' : theme.maintenance }
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === 'maintenance' ? '#ffffff' : theme.maintenance }
              ]}
            >
              Maintenance: {counts.maintenance}
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
            <View style={[styles.emptyIconBox, { backgroundColor: theme.backgroundSubtle }]}>
              <Ionicons name="bed-outline" size={42} color={theme.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {activeFilter ? `No ${activeFilter} rooms found` : 'No rooms added yet'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {activeFilter
                ? 'Try selecting another status filter or reset to view all rooms.'
                : 'Get started by creating your property rooms and dorm beds.'}
            </Text>
            {activeFilter ? (
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: theme.accent }]}
                onPress={() => setFilterWithAnimation(null)}
              >
                <Text style={styles.emptyActionText}>Show All Rooms</Text>
              </TouchableOpacity>
            ) : can('settings') ? (
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: theme.accent }]}
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
                  <View style={[styles.floorBadge, { backgroundColor: theme.backgroundSubtle }]}>
                    <Ionicons name="layers-outline" size={13} color={theme.textSecondary} />
                    <Text style={[styles.floorTitle, { color: theme.textSecondary }]}>{fg.title.toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.floorCountText, { color: theme.textSecondary }]}>{floorCountsText}</Text>
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

                    if (isDorm) {
                      // Composite status evaluation
                      let dormStatusBadge: { text: string; bg: string; color: string; dot: string } = {
                        text: 'All Free',
                        bg: theme.freeSubtle,
                        color: theme.free,
                        dot: theme.free
                      };
                      if (totalBeds > 0 && occupiedBeds === totalBeds) {
                        dormStatusBadge = { text: 'Full', bg: theme.occupiedSubtle, color: theme.occupied, dot: theme.occupied };
                      } else if (occupiedBeds > 0) {
                        dormStatusBadge = { text: `${occupiedBeds}/${totalBeds} Taken`, bg: theme.accentSubtle, color: theme.accent, dot: theme.accent };
                      } else if (dirtyBeds > 0) {
                        dormStatusBadge = { text: 'Needs Clean', bg: theme.dirtySubtle, color: theme.dirty, dot: theme.dirty };
                      }

                      const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) : 0;

                      return (
                        <Pressable
                          key={room.id}
                          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
                          onPress={() => router.push({ pathname: '/dorm/[roomId]', params: { roomId: room.id } })}
                        >
                          {/* Top Header */}
                          <View style={styles.cardHeader}>
                            <View style={[styles.roomIconWrapper, { backgroundColor: theme.accentSubtle }]}>
                              <MaterialCommunityIcons name="bunk-bed-outline" size={20} color={theme.accent} />
                            </View>
                            <View style={styles.roomTitleGroup}>
                              <Text style={[styles.roomLabel, { color: theme.text }]} numberOfLines={1}>{room.label}</Text>
                              <Text style={[styles.roomKindText, { color: theme.textSecondary }]}>
                                {room.description ? `Dorm • ${room.description}` : `Dorm • ${totalBeds} Beds`}
                              </Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: dormStatusBadge.bg }]}>
                              <View style={[styles.statusDot, { backgroundColor: dormStatusBadge.dot }]} />
                              <Text style={[styles.statusPillText, { color: dormStatusBadge.color }]}>
                                {dormStatusBadge.text}
                              </Text>
                            </View>
                          </View>

                          {/* Occupancy Bar */}
                          <View style={[styles.progressContainer, { backgroundColor: theme.backgroundSubtle }]}>
                            <View
                              style={[
                                styles.progressBar,
                                {
                                  width: `${Math.round(occupancyRate * 100)}%`,
                                  backgroundColor: occupancyRate === 1 ? theme.occupied : theme.accent
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
                                <View key={u.id} style={[styles.miniBedChip, { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }]}>
                                  <View style={[styles.miniBedDot, { backgroundColor: bColor }]} />
                                  <Text style={[styles.miniBedText, { color: theme.text }]} numberOfLines={1}>{u.label}</Text>
                                </View>
                              );
                            })}
                            {units.length > 8 && (
                              <Text style={[styles.moreBedsText, { color: theme.textSecondary }]}>+{units.length - 8} more</Text>
                            )}
                          </View>

                          {/* Warnings & Footer */}
                          <View style={[styles.cardFooter, { borderTopColor: theme.separator }]}>
                            {dirtyBeds > 0 ? (
                              <View style={[styles.dirtyBadge, { backgroundColor: theme.dirtySubtle }]}>
                                <Ionicons name="sparkles" size={11} color={theme.dirty} />
                                <Text style={[styles.dirtyBadgeText, { color: theme.dirty }]}>
                                  {dirtyBeds} dirty
                                </Text>
                              </View>
                            ) : maintBeds > 0 ? (
                              <View style={[styles.dirtyBadge, { backgroundColor: theme.maintenanceSubtle }]}>
                                <Ionicons name="construct" size={11} color={theme.maintenance} />
                                <Text style={[styles.dirtyBadgeText, { color: theme.maintenance }]}>
                                  {maintBeds} maint
                                </Text>
                              </View>
                            ) : (
                              <View />
                            )}
                            <View style={styles.viewLink}>
                              <Text style={[styles.viewLinkText, { color: theme.accent }]}>View Beds</Text>
                              <Ionicons name="chevron-forward" size={14} color={theme.accent} />
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
                      clean: { bg: theme.freeSubtle, text: theme.free, dot: theme.free, icon: 'checkmark-circle-outline' },
                      occupied: { bg: theme.occupiedSubtle, text: theme.occupied, dot: theme.occupied, icon: 'person-circle-outline' },
                      dirty: { bg: theme.dirtySubtle, text: theme.dirty, dot: theme.dirty, icon: 'sparkles-outline' },
                      maintenance: { bg: theme.maintenanceSubtle, text: theme.maintenance, dot: theme.maintenance, icon: 'construct-outline' }
                    }[state] || { bg: theme.maintenanceSubtle, text: theme.maintenance, dot: theme.maintenance, icon: 'help-circle-outline' };

                    return (
                      <Pressable
                        key={room.id}
                        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
                        onPress={() => {
                          if (unit) {
                            router.push(`/room/${unit.id}`);
                          } else {
                            Alert.alert('Notice', 'No unit found for this room.');
                          }
                        }}
                      >
                        <View style={styles.cardHeader}>
                          <View style={[styles.roomIconWrapper, { backgroundColor: theme.freeSubtle }]}>
                            <MaterialCommunityIcons name="bed-king-outline" size={20} color={theme.free} />
                          </View>
                          <View style={styles.roomTitleGroup}>
                            <Text style={[styles.roomLabel, { color: theme.text }]} numberOfLines={1}>{room.label}</Text>
                            <Text style={[styles.roomKindText, { color: theme.textSecondary }]}>
                              {room.description ? `Private Room • ${room.description}` : 'Private Room'}
                            </Text>
                          </View>
                          <View style={[styles.statusPill, { backgroundColor: stateTheme.bg }]}>
                            <View style={[styles.statusDot, { backgroundColor: stateTheme.dot }]} />
                            <Text style={[styles.statusPillText, { color: stateTheme.text }]}>
                              {stateLabel}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.cardFooter, { borderTopColor: theme.separator, justifyContent: 'flex-end' }]}>
                          <View style={styles.viewLink}>
                            <Text style={[styles.viewLinkText, { color: theme.accent }]}>Manage</Text>
                            <Ionicons name="chevron-forward" size={14} color={theme.accent} />
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
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addRoomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  addRoomText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  floorBarContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  floorChipActive: {
  },
  floorChipInactive: {
  },
  floorChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  floorChipTextActive: {
    fontWeight: '600'
  },
  noFloorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10
  },
  noFloorNoticeText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1
  },
  filterBarContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 34,
  },
  filterPillActiveAll: {
  },
  filterPillInactive: {
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600'
  },
  filterPillTextActive: {
  },
  filterPillTextInactive: {
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  floorTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6
  },
  floorCountText: {
    fontSize: 13,
    fontWeight: '400'
  },
  grid: {
    gap: 12
  },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  roomIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  roomTitleGroup: {
    flex: 1
  },
  roomLabel: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2
  },
  roomKindText: {
    fontSize: 13,
    marginTop: 2
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600'
  },
  progressContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12
  },
  progressBar: {
    height: '100%',
    borderRadius: 2
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
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  miniBedDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  miniBedText: {
    fontSize: 11,
    fontWeight: '500',
  },
  moreBedsText: {
    fontSize: 11,
    fontWeight: '500',
    alignSelf: 'center',
    marginLeft: 2
  },
  privateInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  privateInfoText: {
    fontSize: 13,
    fontWeight: '500'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dirtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  dirtyBadgeText: {
    fontSize: 12,
    fontWeight: '600'
  },
  cleanBadgeText: {
    fontSize: 12,
    fontWeight: '500'
  },
  floorPillText: {
    fontSize: 12,
    fontWeight: '500'
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  viewLinkText: {
    fontSize: 13,
    fontWeight: '600',
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center'
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20
  },
  emptyActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  emptyActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  }
});
