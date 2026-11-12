// src/components/room-grid-map.tsx
// Architectural Floor-Grouped Hotel & Hostel Room Grid Map.
// Designed after Apple HIG Collections & Color guidelines with shape+tint redundancy.

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BedState } from '@/lib/bed-state';
import { hapticSelection } from '@/lib/haptics';
import {
  buildFloorMapSections,
  FloorGridSection,
  GridRoomRecord,
  GridUnitRecord,
  RoomGridTile,
} from '@/lib/room-grid';

export type { FloorGridSection, GridRoomRecord, GridUnitRecord, RoomGridTile };
export { buildFloorMapSections };

interface RoomGridMapProps {
  rooms: GridRoomRecord[];
  units: GridUnitRecord[];
  activeUnitIds: Set<string>;
  onSelectTile: (tile: RoomGridTile) => void;
  onOpenFullMatrix: () => void;
}

export function RoomGridMap({
  rooms,
  units,
  activeUnitIds,
  onSelectTile,
  onOpenFullMatrix,
}: RoomGridMapProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [statusFilter, setStatusFilter] = useState<BedState | null>(null);

  const { sections, counts } = useMemo(
    () => buildFloorMapSections(rooms, units, activeUnitIds, statusFilter),
    [rooms, units, activeUnitIds, statusFilter]
  );

  // Responsive column count with ≥56pt square tiles & comfortable gutters
  const gridMetrics = useMemo(() => {
    const outerWidth = Math.min(screenWidth - 32, 760);
    const innerWidth = Math.max(240, outerWidth - 32);
    const gap = 8;
    const minTile = 62;
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

  return (
    <View style={styles.wrapper}>
      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={[styles.sectionEyebrow, { color: theme.textSecondary }]}>
            FLOOR GRID MAP
          </Text>
          <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>
            Tap any room tile to manage check-in or housekeeping
          </Text>
        </View>
        <Pressable
          onPress={onOpenFullMatrix}
          style={({ pressed }) => [styles.matrixLinkBtn, { opacity: pressed ? 0.65 : 1 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Open full room and bed matrix screen"
        >
          <Text style={[styles.matrixLinkText, { color: theme.accent }]}>Full Matrix</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.accent} />
        </Pressable>
      </View>

      {/* Architectural Floor-Plan Card */}
      <View
        style={[
          styles.planCard,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.separator,
          },
        ]}
      >
        {/* Interactive Status Legend (Color + Shape Icons) */}
        <View style={styles.legendRow}>
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
        </View>

        {sections.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="bed-outline" size={32} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {statusFilter ? `No ${statusFilter} rooms right now` : 'No rooms configured yet'}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              {statusFilter
                ? 'Tap the active status pill above to show all floors.'
                : 'Add rooms or dorms from settings to visualize your property floor plan.'}
            </Text>
          </View>
        ) : (
          <View style={styles.floorsStack}>
            {sections.map((section) => (
              <View key={section.key} style={styles.floorBlock}>
                {/* Editorial Floor Header: FLOOR 3  Third Floor · Suites ─────── 8 rooms */}
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

                {/* Wrapped Multi-Column Floor Tile Grid */}
                <View style={[styles.tilesWrap, { gap: gridMetrics.gap }]}>
                  {section.tiles.map((tile) => {
                    const spec = tileStyleFor(tile.state);
                    const stateNote = tile.isDorm
                      ? `${tile.freeBeds} of ${tile.totalBeds} beds free`
                      : spec.label;

                    return (
                      <Pressable
                        key={tile.roomId}
                        onPress={() => {
                          void hapticSelection();
                          onSelectTile(tile);
                        }}
                        style={({ pressed }) => [
                          styles.roomTile,
                          {
                            width: gridMetrics.tileWidth,
                            minHeight: Math.max(56, Math.round(gridMetrics.tileWidth * 0.92)),
                            backgroundColor: spec.bg,
                            borderColor: spec.border,
                            opacity: pressed ? 0.72 : 1,
                            transform: [{ scale: pressed ? 0.96 : 1 }],
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${tile.rawLabel}, ${stateNote}`}
                        accessibilityHint="Opens room details and quick actions"
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  matrixLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
    paddingLeft: 8,
  },
  matrixLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  planCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 16,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
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
  floorsStack: {
    gap: 20,
  },
  floorBlock: {
    gap: 10,
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
    fontSize: 14.5,
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
    borderRadius: 12,
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
    paddingVertical: 28,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
});
