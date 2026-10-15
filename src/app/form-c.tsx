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

type FormCFilter = 'all' | 'pending' | 'filed';

export default function FormCScreen() {
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Form C Tracker"
        subtitle={`Bureau of Immigration Compliance • ${pendingCount} Pending`}
      />

      {/* ── FILTER TABS ─────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        <Pressable
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
          onPress={() => setFilterWithAnimation('all')}
        >
          <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
            All ({foreignStays.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterPill, activeFilter === 'pending' && styles.filterPillActivePending]}
          onPress={() => setFilterWithAnimation('pending')}
        >
          <View style={[styles.filterDot, { backgroundColor: '#d97706' }]} />
          <Text style={[styles.filterText, activeFilter === 'pending' && { color: '#ffffff' }]}>
            Pending ({pendingCount})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterPill, activeFilter === 'filed' && styles.filterPillActiveFiled]}
          onPress={() => setFilterWithAnimation('filed')}
        >
          <View style={[styles.filterDot, { backgroundColor: '#16a34a' }]} />
          <Text style={[styles.filterText, activeFilter === 'filed' && { color: '#ffffff' }]}>
            Filed ({filedCount})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredStays}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const isFiled = item.foreign_details?.form_c_filed;
          const guest = Array.isArray(item.guests) ? item.guests[0] : item.guests;
          const guestName = guest?.name || 'Foreign Guest';
          const nationality = guest?.nationality || 'Foreign National';
          const passportNo = item.foreign_details?.passport_no || 'Not recorded';
          const isActing = actionLoadingId === item.id;

          return (
            <View style={[styles.card, isFiled ? styles.cardFiled : styles.cardPending]}>
              <View style={styles.cardTopRow}>
                <View style={[styles.avatarBox, isFiled ? styles.avatarFiled : styles.avatarPending]}>
                  <Ionicons name="earth" size={20} color={isFiled ? "#16a34a" : "#d97706"} />
                </View>

                <View style={styles.cardDetails}>
                  <Text style={styles.guestName}>{guestName}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.nationalityBadge}>
                      <Text style={styles.nationalityText}>{nationality}</Text>
                    </View>
                    <View style={styles.passportBadge}>
                      <Ionicons name="document-text-outline" size={11} color="#475569" />
                      <Text style={styles.passportText}>Passport: {passportNo}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.statusBadge, isFiled ? styles.statusBadgeFiled : styles.statusBadgePending]}>
                  <View style={[styles.statusDot, { backgroundColor: isFiled ? "#16a34a" : "#d97706" }]} />
                  <Text style={[styles.statusText, { color: isFiled ? "#166534" : "#92400e" }]}>
                    {isFiled ? "Filed" : "Pending"}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardFooter}>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={13} color="#64748b" />
                  <Text style={styles.dateText}>
                    Arrival: {new Date(item.check_in).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>

                {isFiled ? (
                  <View style={styles.filedConfirmBadge}>
                    <Ionicons name="checkmark-circle" size={15} color="#16a34a" />
                    <Text style={styles.filedConfirmText}>BoI Recorded</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.markFiledBtn}
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
            <View style={styles.emptyIconBox}>
              <MaterialCommunityIcons name="passport-biometric" size={42} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'pending'
                ? 'No Pending Form C Filings'
                : activeFilter === 'filed'
                ? 'No Filed Form C Records'
                : 'No Foreign Guests Found'}
            </Text>
            <Text style={styles.emptyText}>
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
    borderBottomColor: '#f1f5f9'
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
    backgroundColor: '#0f172a',
    borderColor: '#0f172a'
  },
  filterPillActivePending: {
    backgroundColor: '#d97706',
    borderColor: '#d97706'
  },
  filterPillActiveFiled: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a'
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
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
    borderRadius: 18,
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
    borderColor: "#bbf7d0"
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  avatarPending: {
    backgroundColor: "#fffbeb"
  },
  avatarFiled: {
    backgroundColor: "#f0fdf4"
  },
  cardDetails: {
    flex: 1
  },
  guestName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4
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
    fontWeight: "500"
  },
  filedConfirmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  filedConfirmText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700"
  },
  markFiledBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#d97706",
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
    fontSize: 16,
    fontWeight: "700",
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