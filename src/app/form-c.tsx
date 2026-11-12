// src/app/form-c.tsx
// Bureau of Immigration (BoI) Form C Compliance Tracker
// High-fidelity UI with filter pills, status badges, guest avatars, and smooth animations

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  LayoutAnimation,
  Pressable
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { ScreenHeader } from "@/lib/screen-header";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";

type FormCFilter = 'all' | 'pending' | 'filed';

export default function FormCScreen() {
  const theme = useTheme();
  const [foreignStays, setForeignStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FormCFilter>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchForeignGuests = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();

      if (!memberData) return;

      // Fetch stays + foreign details + guest names
      const { data: staysData, error } = await supabase
        .from('stays')
        .select('id, check_in, status, guests(name, nationality), foreign_details(passport_no, form_c_filed)')
        .eq('property_id', memberData.property_id)
        .order('check_in', { ascending: false });

      if (error) throw error;

      // Domestic nationalities that should NEVER appear in Form C
      const DOMESTIC_TERMS = ['india', 'indian', 'ind', 'nepal', 'bhutan'];
      const isDomestic = (nat?: string) => {
        if (!nat) return false;
        const n = nat.toLowerCase().trim();
        return DOMESTIC_TERMS.some(d => n === d || n.startsWith('india'));
      };

      // Strict foreign tourist filter
      const foreignOnly = (staysData || []).filter((stay: any) => {
        const guest = Array.isArray(stay.guests) ? stay.guests[0] : stay.guests;
        const nat = guest?.nationality;
        const fd = Array.isArray(stay.foreign_details) ? stay.foreign_details[0] : stay.foreign_details;

        // Rule 1: Exclude if nationality is domestic
        if (isDomestic(nat)) return false;

        // Rule 2: Must have a foreign passport or a non-domestic nationality
        const hasPassport = Boolean(fd?.passport_no);
        const hasForeignNat = Boolean(nat && !isDomestic(nat));

        return hasPassport || hasForeignNat;
      });

      setForeignStays(foreignOnly);
    } catch (error) {
      console.error("Error fetching foreign guests", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchForeignGuests();
  }, [fetchForeignGuests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchForeignGuests();
  }, [fetchForeignGuests]);

  const setFilterWithAnimation = (filter: FormCFilter) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFilter(filter);
  };

  async function markAsFiled(stayId: string) {
    try {
      setActionLoadingId(stayId);
      const { error } = await supabase.rpc('mark_form_c_filed', {
        p_stay_id: stayId,
        p_staff_id: null
      });

      if (error) throw error;
      Alert.alert("Success", "Form C marked as filed!");
      fetchForeignGuests();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setActionLoadingId(null);
    }
  }

  const pendingCount = foreignStays.filter(s => !s.foreign_details?.form_c_filed).length;
  const filedCount = foreignStays.filter(s => s.foreign_details?.form_c_filed).length;

  const filteredStays = foreignStays.filter(stay => {
    const isFiled = stay.foreign_details?.form_c_filed;
    if (activeFilter === 'pending') return !isFiled;
    if (activeFilter === 'filed') return isFiled;
    return true;
  });

  if (loading && foreignStays.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accentText} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Form C Tracker"
        subtitle={`Bureau of Immigration Compliance • ${pendingCount} Pending`}
      />

      {/* ── FILTER TABS ─────────────────────────────────────────── */}
      <View style={[styles.filterBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable
          style={[
            styles.filterPill,
            { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            activeFilter === 'all' && { backgroundColor: theme.accent, borderColor: theme.accent }
          ]}
          onPress={() => setFilterWithAnimation('all')}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'all' ? '#ffffff' : theme.textSecondary }]}>
            All ({foreignStays.length})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.filterPill,
            { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            activeFilter === 'pending' && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }
          ]}
          onPress={() => setFilterWithAnimation('pending')}
        >
          <View style={[styles.filterDot, { backgroundColor: activeFilter === 'pending' ? '#ffffff' : '#f59e0b' }]} />
          <Text style={[styles.filterText, { color: activeFilter === 'pending' ? '#ffffff' : theme.textSecondary }]}>
            Pending ({pendingCount})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.filterPill,
            { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            activeFilter === 'filed' && { backgroundColor: '#16a34a', borderColor: '#16a34a' }
          ]}
          onPress={() => setFilterWithAnimation('filed')}
        >
          <View style={[styles.filterDot, { backgroundColor: activeFilter === 'filed' ? '#ffffff' : '#16a34a' }]} />
          <Text style={[styles.filterText, { color: activeFilter === 'filed' ? '#ffffff' : theme.textSecondary }]}>
            Filed ({filedCount})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredStays}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentText} />}
        renderItem={({ item }) => {
          const isFiled = item.foreign_details?.form_c_filed;
          const guest = Array.isArray(item.guests) ? item.guests[0] : item.guests;
          const guestName = guest?.name || 'Foreign Guest';
          const nationality = guest?.nationality || 'Foreign National';
          const passportNo = item.foreign_details?.passport_no || 'Not recorded';
          const isActing = actionLoadingId === item.id;

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: isFiled ? '#86efac' : '#fde68a'
                }
              ]}
            >
              <View style={styles.cardTopRow}>
                <View
                  style={[
                    styles.avatarBox,
                    { backgroundColor: isFiled ? '#dcfce7' : '#fef3c7' }
                  ]}
                >
                  <Ionicons name="earth" size={20} color={isFiled ? '#16a34a' : '#d97706'} />
                </View>

                <View style={styles.cardDetails}>
                  <Text style={[styles.guestName, { color: theme.text }]}>{guestName}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.nationalityBadge, { backgroundColor: theme.accentSubtle }]}>
                      <Text style={[styles.nationalityText, { color: theme.accentText }]}>{nationality}</Text>
                    </View>
                    <View style={[styles.passportBadge, { backgroundColor: theme.surfaceSubtle }]}>
                      <Ionicons name="document-text-outline" size={11} color={theme.textSecondary} />
                      <Text style={[styles.passportText, { color: theme.textSecondary }]}>Passport: {passportNo}</Text>
                    </View>
                  </View>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: isFiled ? '#dcfce7' : '#fef3c7' }
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: isFiled ? '#16a34a' : '#d97706' }]} />
                  <Text style={[styles.statusText, { color: isFiled ? '#15803d' : '#b45309' }]}>
                    {isFiled ? "Filed" : "Pending"}
                  </Text>
                </View>
              </View>

              <View style={[styles.cardDivider, { backgroundColor: theme.borderSubtle }]} />

              <View style={styles.cardFooter}>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                  <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                    Arrival: {new Date(item.check_in).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>

                {isFiled ? (
                  <View style={[styles.filedConfirmBadge, { backgroundColor: '#dcfce7' }]}>
                    <Ionicons name="checkmark-circle" size={15} color="#16a34a" />
                    <Text style={[styles.filedConfirmText, { color: '#15803d' }]}>BoI Recorded</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.markFiledBtn, { backgroundColor: theme.accent }]}
                    onPress={() => markAsFiled(item.id)}
                    disabled={isActing}
                    activeOpacity={0.8}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-outline" size={15} color="#ffffff" />
                        <Text style={styles.markFiledText}>Mark as Filed</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconBox, { backgroundColor: theme.surfaceSubtle }]}>
              <MaterialCommunityIcons name="passport-biometric" size={42} color={theme.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {activeFilter === 'pending'
                ? 'No Pending Form C Filings'
                : activeFilter === 'filed'
                ? 'No Filed Form C Records'
                : 'No Foreign Guests Found'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {activeFilter === 'pending'
                ? 'All registered foreign guests have had their Form C recorded.'
                : 'Foreign guests checked in at your property will appear here for compliance.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc"
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  filterPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  filterPillActivePending: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b'
  },
  filterPillActiveFiled: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a'
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    fontVariant: ['tabular-nums']
  },
  filterTextActive: {
    color: '#ffffff'
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  listContent: {
    padding: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardPending: {
    borderColor: "#fde68a"
  },
  cardFiled: {
    borderColor: "#86efac"
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  avatarPending: {
    backgroundColor: "#fef3c7"
  },
  avatarFiled: {
    backgroundColor: "#dcfce7"
  },
  cardDetails: {
    flex: 1
  },
  guestName: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    fontWeight: "600",
    color: "#0f172a"
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5
  },
  nationalityBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  nationalityText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#2563eb'
  },
  passportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  passportText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#475569'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7'
  },
  statusBadgeFiled: {
    backgroundColor: '#dcfce7'
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  dateText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ['tabular-nums']
  },
  filedConfirmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  filedConfirmText: {
    color: "#15803d",
    fontSize: 12,
    fontWeight: "700"
  },
  markFiledBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  markFiledText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 20
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 6,
    textAlign: "center"
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18
  }
});