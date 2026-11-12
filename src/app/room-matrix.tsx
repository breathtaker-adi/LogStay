// src/app/room-matrix.tsx
// Full-Screen Architectural Hotel & Hostel Room Matrix
// Visual floor-by-floor blueprint showing every room tile, floor header, and live status.

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStaff } from '@/lib/staff-context';
import { ScreenHeader } from '@/lib/screen-header';
import { BedState } from '@/lib/bed-state';
import { hapticSelection } from '@/lib/haptics';
import {
  buildFloorMapSections,
  computeAvailabilitySummary,
  formatAvailabilityLabel,
  GridRoomRecord,
  GridUnitRecord,
  RoomGridTile,
} from '@/lib/room-grid';
import {
  cacheRooms,
  cacheStays,
  cacheUnits,
  getRoomsCache,
  getStaysCache,
  getUnitsCache,
  isOnline,
  processOutbox,
} from '@/lib/offline';
import { supabase } from '@/lib/supabase';

export default function RoomMatrixScreen() {
  const theme = useTheme();
  const { can } = useStaff();
  const { width: screenWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BedState | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null | 'all'>('all');

  const [rooms, setRooms] = useState<GridRoomRecord[]>([]);
  const [units, setUnits] = useState<GridUnitRecord[]>([]);
  const [activeUnitIds, setActiveUnitIds] = useState<Set<string>>(new Set());

  const loadMatrixData = useCallback(async () => {
    try {
      const online = await isOnline();

      if (online) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: memberData } = await supabase
          .from('members')
          .select('property_id')
          .eq('user_id', user?.id)
          .single();

        if (memberData?.property_id) {
          const propId = memberData.property_id;

          const { data: roomsData } = await supabase
            .from('rooms')
            .select('id, property_id, label, kind, floor, floor_no, description')
            .eq('property_id', propId)
            .is('archived_at', null)
            .order('label');

          const roomIds = (roomsData || []).map((r) => r.id);
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

          const { data: staysData } = await supabase
            .from('stays')
            .select('id, property_id, unit_id, status')
            .eq('property_id', propId)
            .eq('status', 'checked_in');

          cacheRooms(roomsData || []);
          cacheUnits(unitsData || []);
          cacheStays(staysData || []);

          setRooms(roomsData || []);
          setUnits(unitsData || []);
          setActiveUnitIds(new Set((staysData || []).map((s) => s.unit_id)));
          return;
        }
      }

      const [cRooms, cUnits, cStays] = await Promise.all([
        getRoomsCache(),
        getUnitsCache(),
        getStaysCache(),
      ]);
      setRooms(cRooms || []);
      setUnits(cUnits || []);
      setActiveUnitIds(new Set((cStays || []).map((s: any) => s.unit_id)));
    } catch (err) {
      console.error('Error loading room matrix:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMatrixData();
    }, [loadMatrixData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (await isOnline()) {
      await processOutbox().catch(() => {});
    }
    await loadMatrixData();
    setRefreshing(false);
  };

  const { sections, counts } = useMemo(
    () => buildFloorMapSections(rooms, units, activeUnitIds, statusFilter),
    [rooms, units, activeUnitIds, statusFilter]
  );

  const allSections = useMemo(
    () => buildFloorMapSections(rooms, units, activeUnitIds, null).sections,
    [rooms, units, activeUnitIds]
  );

  const visibleSections = useMemo(() => {
    if (selectedFloor === 'all') return sections;
    return sections.filter((s) => s.floorNo === selectedFloor);
  }, [sections, selectedFloor]);

  const availabilitySummary = useMemo(
    () => computeAvailabilitySummary(rooms, units, activeUnitIds),
    [rooms, units, activeUnitIds]
  );
  const availabilityLabel = useMemo(
    () => formatAvailabilityLabel(availabilitySummary),
    [availabilitySummary]
  );

  // Responsive architectural tile sizing (crisp squares on mobile and up to 10-across on wide viewports)
  const gridMetrics = useMemo(() => {
    const outerWidth = Math.min(screenWidth - 28, 920);
    const innerWidth = Math.max(240, outerWidth - 36);
    const gap = 8;
    const minTile = screenWidth >= 700 ? 68 : 58;
    const cols = Math.max(4, Math.min(10, Math.floor((innerWidth + gap) / (minTile + gap))));
    const tileWidth = Math.floor((innerWidth - gap * (cols - 1)) / cols);
    return { tileWidth, gap, cols };
  }, [screenWidth]);

  const tileStyleFor = (state: BedState) => {
    switch (state) {
      case 'clean':
        return {
          bg: theme.roomCleanBg,
          border: theme.roomCleanBorder,
          fg: theme.roomCleanFg,
          icon: 'sparkles-outline' as const,
          label: 'Free',
          dot: null,
        };
      case 'occupied':
        return {
          bg: theme.roomOccupiedBg,
          border: theme.roomOccupiedBorder,
          fg: theme.roomOccupiedFg,
          icon: 'people-outline' as const,
          label: 'Occupied',
          dot: theme.roomOccupiedDot,
        };
      case 'dirty':
        return {
          bg: theme.roomDirtyBg,
          border: theme.roomDirtyBorder,
          fg: theme.roomDirtyFg,
          icon: 'bed-outline' as const,
          label: 'Dirty',
          dot: null,
        };
      case 'maintenance':
        return {
          bg: theme.roomMaintBg,
          border: theme.roomMaintBorder,
          fg: theme.roomMaintFg,
          icon: 'build-outline' as const,
          label: 'Maintenance',
          dot: null,
        };
    }
  };

  const legendItems: { key: BedState; title: string }[] = [
    { key: 'clean', title: 'Free' },
    { key: 'occupied', title: 'Occupied' },
    { key: 'dirty', title: 'Dirty' },
    { key: 'maintenance', title: 'Maint' },
  ];

  const handleToggleFilter = (key: BedState) => {
    void hapticSelection();
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  const handleSelectTile = (tile: RoomGridTile) => {
    void hapticSelection();
    if (tile.isDorm) {
      router.push({ pathname: '/dorm/[roomId]', params: { roomId: tile.roomId } });
    } else if (tile.primaryUnitId) {
      router.push(`/room/${tile.primaryUnitId}`);
    } else {
      Alert.alert('Notice', 'No unit found for this room.');
    }
  };

  if (loading && rooms.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Room Matrix"
        subtitle={
          rooms.length > 0
            ? `${availabilityLabel} • ${rooms.length} ${rooms.length === 1 ? 'Room' : 'Rooms'}`
            : 'Floor-by-Floor Blueprint'
        }
        right={
          <TouchableOpacity
            style={[
              styles.headerRoomsBtn,
              { backgroundColor: theme.accentSubtle, borderColor: theme.border },
            ]}
            onPress={() => router.push('/rooms')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open detailed rooms and beds list"
          >
            <Ionicons name="list-outline" size={15} color={theme.accent} />
            <Text style={[styles.headerRoomsBtnText, { color: theme.accent }]}>List</Text>
          </TouchableOpacity>
        }
      />

      {/* ── STATUS FILTER BAR ─────────────────────────────────────── */}
      <View
        style={[
          styles.controlsBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.legendScroll}
        >
          <Pressable
            onPress={() => {
              void hapticSelection();
              setStatusFilter(null);
            }}
            style={({ pressed }) => [
              styles.legendChip,
              statusFilter === null
                ? { backgroundColor: theme.text, borderColor: theme.text }
                : { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              { opacity: pressed ? 0.78 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: statusFilter === null }}
          >
            <Text
              style={[
                styles.legendChipText,
                { color: statusFilter === null ? theme.surface : theme.textSecondary },
              ]}
            >
              All ({rooms.length})
            </Text>
          </Pressable>

          {legendItems.map((item) => {
            const spec = tileStyleFor(item.key);
            const active = statusFilter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => handleToggleFilter(item.key)}
                style={({ pressed }) => [
                  styles.legendChip,
                  {
                    backgroundColor: active ? spec.fg : spec.bg,
                    borderColor: active ? spec.fg : spec.border,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter by ${spec.label}: ${counts[item.key]} rooms`}
              >
                <Ionicons
                  name={spec.icon}
                  size={13}
                  color={active ? '#FFFFFF' : spec.fg}
                />
                <Text
                  style={[
                    styles.legendChipText,
                    { color: active ? '#FFFFFF' : spec.fg },
                  ]}
                  numberOfLines={1}
                >
                  {item.title} {counts[item.key]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Floor Quick Chips */}
        {allSections.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorChipScroll}
          >
            <Pressable
              onPress={() => {
                void hapticSelection();
                setSelectedFloor('all');
              }}
              style={[
                styles.floorChip,
                selectedFloor === 'all'
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.floorChipText,
                  { color: selectedFloor === 'all' ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                All Floors
              </Text>
            </Pressable>

            {allSections.map((sec) => {
              const active = selectedFloor === sec.floorNo;
              return (
                <Pressable
                  key={sec.key}
                  onPress={() => {
                    void hapticSelection();
                    setSelectedFloor(active ? 'all' : sec.floorNo);
                  }}
                  style={[
                    styles.floorChip,
                    active
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.floorChipText,
                      { color: active ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {sec.eyebrow}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── ARCHITECTURAL FULL-SCREEN MATRIX CANVAS ───────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.matrixSheetCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          {visibleSections.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="grid-outline" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {statusFilter ? `No ${statusFilter} rooms on selected floor` : 'No rooms configured yet'}
              </Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                {statusFilter
                  ? 'Tap "All" in the filter bar above to display all property floors.'
                  : 'Create rooms and dormitories to populate your visual architectural matrix.'}
              </Text>
              {statusFilter ? (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: theme.accent }]}
                  onPress={() => {
                    setStatusFilter(null);
                    setSelectedFloor('all');
                  }}
                >
                  <Text style={styles.emptyBtnText}>Show All Rooms</Text>
                </TouchableOpacity>
              ) : can('settings') ? (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: theme.accent }]}
                  onPress={() => router.push('/add-room')}
                >
                  <Text style={styles.emptyBtnText}>+ Add First Room</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.floorsStack}>
              {visibleSections.map((section) => (
                <View key={section.key} style={styles.floorBlock}>
                  {/* Editorial Floor Header matching architectural map */}
                  <View style={styles.floorHeaderRow}>
                    <Text style={[styles.floorEyebrow, { color: theme.roomEyebrow }]}>
                      {section.eyebrow}
                    </Text>
                    <Text
                      style={[
                        styles.floorDescriptor,
                        { color: theme.text, fontFamily: Fonts.serif },
                      ]}
                      numberOfLines={1}
                    >
                      {section.descriptor}
                    </Text>
                    <View style={[styles.floorHairline, { backgroundColor: theme.roomHairline }]} />
                    <Text style={[styles.floorCount, { color: theme.roomEyebrow }]}>
                      {section.countLabel}
                    </Text>
                  </View>

                  {/* Square Architectural Room Tiles Grid */}
                  <View style={[styles.tilesWrap, { gap: gridMetrics.gap }]}>
                    {section.tiles.map((tile) => {
                      const spec = tileStyleFor(tile.state);
                      const stateNote = tile.isDorm
                        ? `${tile.freeBeds} of ${tile.totalBeds} beds free`
                        : spec.label;

                      return (
                        <Pressable
                          key={tile.roomId}
                          onPress={() => handleSelectTile(tile)}
                          style={({ pressed }) => [
                            styles.roomTile,
                            {
                              width: gridMetrics.tileWidth,
                              minHeight: Math.max(58, Math.round(gridMetrics.tileWidth * 0.94)),
                              backgroundColor: spec.bg,
                              borderColor: spec.border,
                              opacity: pressed ? 0.72 : 1,
                              transform: [{ scale: pressed ? 0.96 : 1 }],
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${tile.rawLabel}, ${stateNote}`}
                          accessibilityHint="Opens room details and management options"
                        >
                          {spec.dot && (
                            <View style={[styles.occupiedDot, { backgroundColor: spec.dot }]} />
                          )}

                          <Ionicons name={spec.icon} size={17} color={spec.fg} />

                          <Text
                            style={[styles.tileNumber, { color: spec.fg }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                          >
                            {tile.shortLabel}
                          </Text>

                          {tile.dormSubLabel && (
                            <Text
                              style={[styles.dormMicroLabel, { color: spec.fg }]}
                              numberOfLines={1}
                            >
                              {tile.dormSubLabel} free
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRoomsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRoomsBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  controlsBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    gap: 8,
  },
  legendScroll: {
    paddingHorizontal: 14,
    gap: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
  },
  legendChipText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  floorChipScroll: {
    paddingHorizontal: 14,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  floorChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  floorChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
    alignItems: 'center',
  },
  matrixSheetCard: {
    width: '100%',
    maxWidth: 920,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  floorsStack: {
    gap: 24,
  },
  floorBlock: {
    gap: 12,
  },
  floorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floorEyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  floorDescriptor: {
    fontSize: 15,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  floorHairline: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    minWidth: 12,
  },
  floorCount: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  tilesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  roomTile: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 8,
    gap: 4,
    position: 'relative',
  },
  occupiedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tileNumber: {
    fontSize: 13.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  dormMicroLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    opacity: 0.9,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 44,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 19,
  },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
