import { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Crypto from 'expo-crypto';
import { supabase } from "../lib/supabase";
import { isOnline, saveToOutbox, getCachedPropertyId, setCachedPropertyId } from "../lib/offline";
import { useStaff } from "../lib/staff-context";
import { can } from "../lib/permissions";
import { ScreenHeader } from "@/lib/screen-header";
import { exportShiftReportPDF } from "@/lib/pdf-reports";

export default function ShiftScreen() {
  const { activeStaff } = useStaff();
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [pastShifts, setPastShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // RBAC Protection: Housekeepers cannot access Shift
  useEffect(() => {
    if (activeStaff && !can(activeStaff.role as any, 'shift')) {
      Alert.alert(
        "Access Restricted",
        "Shift and cash drawer controls are restricted to Front Desk and Owners."
      );
      router.replace('/home');
    }
  }, [activeStaff]);

  // Form states
  const [openingCash, setOpeningCash] = useState("");
  const [pettyAmount, setPettyAmount] = useState("");
  const [pettyNote, setPettyNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [coSignPin, setCoSignPin] = useState("");

  useEffect(() => {
    fetchShiftData();
  }, []);

  const handleExportShiftPDF = async (targetShift?: any) => {
    const s = targetShift || activeShift;
    if (!s) return;
    try {
      const pettyTotal = entries.filter(e => e.kind === 'petty').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const cashInTotal = entries.filter(e => e.kind === 'collection').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const expected = Number(s.opening_cash || 0) + cashInTotal - pettyTotal;
      const counted = Number(s.counted_cash || expectedCash || 0);

      await exportShiftReportPDF({
        propertyName: 'LogStay Hospitality',
        shiftId: s.id,
        staffName: activeStaff?.name || 'Duty Staff',
        openedAt: s.opened_at,
        closedAt: s.closed_at,
        openingCash: Number(s.opening_cash || 0),
        cashCollected: cashInTotal,
        upiCollected: 0,
        pettyExpenses: pettyTotal,
        expectedDrawer: expected,
        countedCash: counted,
        variance: counted - expected,
        notes: s.notes || undefined
      });
    } catch (err: any) {
      Alert.alert('PDF Export Error', err?.message || 'Could not export Shift PDF report');
    }
  };

  async function fetchShiftData() {
    setLoading(true);
    try {
      if (!(await isOnline())) {
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;
      await setCachedPropertyId(memberData.property_id);

      // 1. Fetch Active Shift
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('property_id', memberData.property_id)
        .eq('status', 'open')
        .single();

      if (shiftData) {
        setActiveShift(shiftData);
        const { data: entriesData } = await supabase
          .from('cash_entries')
          .select('*')
          .eq('shift_id', shiftData.id)
          .order('created_at', { ascending: false });
        setEntries(entriesData || []);
      }

      // 2. Fetch Past Shifts (For Owner History)
      const { data: historyData } = await supabase
        .from('shifts')
        .select('*')
        .eq('property_id', memberData.property_id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(10);

      setPastShifts(historyData || []);

    } catch (error) {
      console.error("Error fetching shift", error);
    } finally {
      setLoading(false);
    }
  }

  async function startShift() {
    if (!openingCash) return Alert.alert("Missing Info", "Please enter opening cash amount.");
    
    try {
      let propertyId: string | null = null;
      let userId: string | undefined;

      if (await isOnline()) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
        const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
        if (memberData?.property_id) {
          propertyId = memberData.property_id;
          await setCachedPropertyId(propertyId);
        }
      }

      if (!propertyId) {
        propertyId = await getCachedPropertyId();
      }

      if (!propertyId) {
        Alert.alert("Setup Required", "Please connect to the internet once to load property details.");
        return;
      }
      const validPropertyId = propertyId;

      const shiftId = Crypto.randomUUID();
      const amount = parseFloat(openingCash);

      if (await isOnline()) {
        const { error } = await supabase.rpc('open_shift', {
          p_shift_id: shiftId,
          p_opening_cash: amount,
          p_staff_id: activeStaff?.id || null
        });
          
        if (error) { Alert.alert('Error', error.message); return; }
      } else {
        await saveToOutbox('shift_open', { 
          id: shiftId,
          shift_id: shiftId, 
          property_id: validPropertyId, 
          user_id: userId || null, 
          opening_cash: amount,
          staff_id: activeStaff?.id || null
        });
        
        // Optimistic UI: Set local state so the screen updates
        setActiveShift({ 
          id: shiftId, 
          property_id: validPropertyId, 
          opened_by: userId || null, 
          opening_cash: amount, 
          status: 'open', 
          counted_cash: null, 
          closed_by: null, 
          closed_at: null, 
          co_signed: false, 
          created_at: new Date().toISOString() 
        });
      }

      setOpeningCash("");
      Alert.alert('Shift Opened', 'Cash drawer is now active.');
      fetchShiftData();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  async function addPettyCash() {
    if (!pettyAmount) return Alert.alert("Missing Info", "Please enter amount.");

    try {
      const entryId = Crypto.randomUUID();
      const amount = parseFloat(pettyAmount);
      const note = pettyNote;

      if (await isOnline()) {
        const { error } = await supabase.rpc('add_petty_cash', {
          p_entry_id: entryId,
          p_shift_id: activeShift.id,
          p_amount: amount,
          p_note: note || null,
          p_staff_id: activeStaff?.id || null
        });
          
        if (error) { Alert.alert('Error', error.message); return; }
        setEntries([...entries, { id: entryId, shift_id: activeShift.id, kind: 'petty', amount, note, staff_id: activeStaff?.id, created_at: new Date().toISOString() }]);
      } else {
        await saveToOutbox('petty_cash', { 
          id: entryId,
          entry_id: entryId, 
          shift_id: activeShift.id, 
          amount, 
          note,
          staff_id: activeStaff?.id
        });
        
        // Optimistic UI: Add to local entries array
        setEntries([...entries, { id: entryId, shift_id: activeShift.id, kind: 'petty', amount, note, staff_id: activeStaff?.id, created_at: new Date().toISOString() }]);
      }

      setPettyAmount("");
      setPettyNote("");
      Alert.alert('Petty Cash Logged', 'Expense recorded.');
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  async function closeShift() {
    if (!(await isOnline())) {
      Alert.alert('Internet Required', "You must be online to verify and close the shift.");
      return;
    }

    if (!countedCash) {
      return Alert.alert("Missing Info", "Please enter counted cash.");
    }

    if (activeStaff?.role !== 'owner' && !coSignPin) {
      return Alert.alert("Co-Sign Required", "Please enter incoming staff PIN to hand over the drawer.");
    }

    try {
      const { data: closeResult, error: rpcError } = await supabase.rpc('close_shift_secure', {
        p_shift_id: activeShift.id,
        p_counted_cash: parseFloat(countedCash),
        p_staff_id: activeStaff?.id,
        p_cosign_pin: coSignPin ? coSignPin.trim() : null
      });

      if (rpcError) {
        return Alert.alert("Shift Handover Failed", rpcError.message);
      }

      Alert.alert(
        "Success", 
        closeResult?.co_signed 
          ? `Shift closed & co-signed by ${closeResult?.cosigner || 'incoming staff'}!` 
          : "Shift closed by owner."
      );
      setActiveShift(null);
      setEntries([]);
      setCountedCash("");
      setCoSignPin("");
      fetchShiftData();

    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  // Calculate expected cash
  const collections = entries.filter(e => e.kind === 'collection').reduce((sum, e) => sum + Number(e.amount), 0);
  const petty = entries.filter(e => e.kind === 'petty').reduce((sum, e) => sum + Number(e.amount), 0);
  const refunds = entries.filter(e => e.kind === 'refund').reduce((sum, e) => sum + Number(e.amount), 0);

  const totalPetty = petty;
  const expectedCash = activeShift ? (Number(activeShift.opening_cash) + collections - petty - refunds) : 0;

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading shift data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Shift & Cash Control"
        subtitle={activeShift ? "Cash Drawer Active" : "No Active Shift"}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!activeShift ? (
          /* Start Shift Card */
          <View style={styles.card}>
            <View style={styles.cardIconHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="time" size={28} color="#2563eb" />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Open Desk Shift</Text>
                <Text style={styles.cardSubtitle}>Start counting transactions and cash collections</Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Opening Drawer Cash (₹)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.textInput}
                placeholder="5000"
                placeholderTextColor="#94a3b8"
                value={openingCash}
                onChangeText={setOpeningCash}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity style={styles.primaryActionBtn} onPress={startShift} activeOpacity={0.8}>
              <Ionicons name="play" size={16} color="#ffffff" />
              <Text style={styles.primaryActionText}>Start Shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Shift Cash Summary Banner */}
            <View style={styles.card}>
              <View style={styles.drawerHeaderRow}>
                <View style={styles.statusIndicator}>
                  <View style={styles.pulsingDot} />
                  <Text style={styles.drawerStatusText}>Shift In Progress</Text>
                </View>
                <Text style={styles.drawerDate}>
                  {(() => {
                    const shiftStart = activeShift.opened_at || activeShift.created_at;
                    if (!shiftStart) return "Started recently";
                    const d = new Date(shiftStart);
                    return isNaN(d.getTime()) 
                      ? "Started recently" 
                      : `Started ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                  })()}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statPillBox}>
                  <Text style={styles.statPillLabel}>Opening Cash</Text>
                  <Text style={styles.statPillValue}>₹{Number(activeShift.opening_cash).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statPillBox, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={[styles.statPillLabel, { color: '#166534' }]}>Cash Inflows</Text>
                  <Text style={[styles.statPillValue, { color: '#15803d' }]}>+ ₹{Number(collections).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statPillBox, { backgroundColor: '#fff7ed' }]}>
                  <Text style={[styles.statPillLabel, { color: '#c2410c' }]}>Petty Outflow</Text>
                  <Text style={[styles.statPillValue, { color: '#ea580c' }]}>- ₹{Number(totalPetty).toLocaleString('en-IN')}</Text>
                </View>
              </View>

              <View style={styles.expectedCashBanner}>
                <View>
                  <Text style={styles.expectedLabel}>Expected in Drawer</Text>
                  <Text style={styles.expectedSub}>Opening + Collections - Outflows</Text>
                </View>
                <Text style={styles.expectedAmount}>₹{Number(expectedCash).toLocaleString('en-IN')}</Text>
              </View>

              <TouchableOpacity
                style={styles.shiftPdfBtn}
                onPress={() => handleExportShiftPDF(activeShift)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={16} color="#0f172a" />
                <Text style={styles.shiftPdfBtnText}>Export Shift PDF Report</Text>
              </TouchableOpacity>
            </View>

            {/* Petty Cash Outflows Card */}
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="receipt-outline" size={18} color="#d97706" />
                <Text style={styles.sectionTitle}>Add Petty Cash / Khata Outflow</Text>
              </View>

              <View style={styles.pettyInputsRow}>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Amount"
                    placeholderTextColor="#94a3b8"
                    value={pettyAmount}
                    onChangeText={setPettyAmount}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputWrapper, { flex: 2 }]}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Note (e.g., Diesel, Milk)"
                    placeholderTextColor="#94a3b8"
                    value={pettyNote}
                    onChangeText={setPettyNote}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.amberBtn} onPress={addPettyCash} activeOpacity={0.8}>
                <Ionicons name="remove-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.amberBtnText}>Record Cash Outflow</Text>
              </TouchableOpacity>

              <View style={styles.entriesHeaderRow}>
                <Text style={styles.entriesTitle}>Recent Drawer Activity ({entries.length})</Text>
              </View>

              {entries.length === 0 ? (
                <View style={styles.emptyEntriesBox}>
                  <Text style={styles.emptyText}>No cash collections or payouts recorded for this shift yet.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {entries.map((item) => {
                    const isInflow = item.kind === 'collection';
                    const isRefund = item.kind === 'refund';

                    return (
                      <View 
                        key={item.id} 
                        style={[
                          styles.entryItem, 
                          isInflow ? styles.entryItemInflow : isRefund ? styles.entryItemRefund : styles.entryItemOutflow
                        ]}
                      >
                        <View style={styles.entryLeft}>
                          <Ionicons 
                            name={isInflow ? "arrow-up-circle" : "arrow-down-circle"} 
                            size={18} 
                            color={isInflow ? "#16a34a" : isRefund ? "#dc2626" : "#d97706"} 
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.entryNote, isInflow && { color: '#166534' }]}>
                              {item.note || (isInflow ? 'Cash Collection' : 'Petty expense')}
                            </Text>
                            <Text style={styles.entrySub}>
                              {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              {` • ${isInflow ? 'Inflow (Cash In)' : isRefund ? 'Outflow (Refund)' : 'Outflow (Expense)'}`}
                            </Text>
                          </View>
                        </View>
                        <Text style={[
                          styles.entryAmount, 
                          isInflow ? styles.entryAmountInflow : isRefund ? styles.entryAmountRefund : styles.entryAmountOutflow
                        ]}>
                          {isInflow ? `+ ₹${Number(item.amount).toLocaleString('en-IN')}` : `- ₹${Number(item.amount).toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Handover & Close Shift Card */}
            <View style={[styles.card, styles.closeShiftCard]}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="lock-closed" size={18} color="#dc2626" />
                <Text style={[styles.sectionTitle, { color: '#991b1b' }]}>Close Shift & Handover</Text>
              </View>

              <Text style={styles.inputLabel}>Counted Physical Cash in Drawer (₹)</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Counted cash amount"
                  placeholderTextColor="#94a3b8"
                  value={countedCash}
                  onChangeText={setCountedCash}
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.inputLabel}>
                {activeStaff?.role === 'owner' ? "Incoming Staff PIN (Optional for Owner)" : "Incoming Staff PIN (Required to Co-Sign)"}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={18} color="#94a3b8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="4-Digit PIN"
                  placeholderTextColor="#94a3b8"
                  value={coSignPin}
                  onChangeText={setCoSignPin}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity style={styles.destructiveBtn} onPress={closeShift} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={18} color="#ffffff" />
                <Text style={styles.destructiveBtnText}>
                  {activeStaff?.role === 'owner' ? "Close Shift" : "Close & Co-Sign Shift"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* OWNER SHIFT HISTORY */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar-outline" size={18} color="#475569" />
            <Text style={styles.historyTitle}>Shift Handover Logs (Owner View)</Text>
          </View>

          {pastShifts.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Text style={styles.emptyText}>No closed shift records found.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {pastShifts.map((item) => {
                const expected = item.opening_cash - (item.cash_entries?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0);
                const diff = (item.counted_cash || 0) - expected;
                const hasDiff = diff !== 0;

                return (
                  <View key={item.id} style={[styles.historyCard, hasDiff && styles.historyCardDiff]}>
                    <View style={styles.historyCardHeader}>
                      <View style={styles.historyDateRow}>
                        <Ionicons name="checkmark-circle" size={16} color={hasDiff ? "#dc2626" : "#16a34a"} />
                        <Text style={styles.historyDate}>
                          Closed {new Date(item.closed_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      {item.co_signed && (
                        <View style={styles.coSignBadge}>
                          <Text style={styles.coSignBadgeText}>Co-Signed</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.historyStatGrid}>
                      <View style={styles.historyStatItem}>
                        <Text style={styles.historyStatLabel}>Expected</Text>
                        <Text style={styles.historyStatVal}>₹{Number(expected).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={styles.historyStatItem}>
                        <Text style={styles.historyStatLabel}>Counted</Text>
                        <Text style={styles.historyStatVal}>₹{Number(item.counted_cash || 0).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={styles.historyStatItem}>
                        <Text style={styles.historyStatLabel}>Difference</Text>
                        <Text style={[styles.historyStatVal, hasDiff ? styles.diffVal : styles.matchVal]}>
                          {diff > 0 ? `+₹${diff}` : diff < 0 ? `-₹${Math.abs(diff)}` : '₹0'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.miniPdfBtn}
                      onPress={() => handleExportShiftPDF(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-outline" size={14} color="#2563eb" />
                      <Text style={styles.miniPdfText}>Export Shift PDF</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
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
    backgroundColor: "#f8fafc"
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    gap: 12
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500"
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  cardIconHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe"
  },
  cardHeaderText: {
    flex: 1
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a"
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
    marginTop: 4
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
    marginRight: 6
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: 0
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    height: 48,
    borderRadius: 12,
    marginTop: 6,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  drawerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a"
  },
  drawerStatusText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534"
  },
  drawerDate: {
    fontSize: 12,
    color: "#64748b"
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  statPillBox: {
    flex: 1,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 12
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563eb"
  },
  statPillValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1d4ed8",
    marginTop: 4
  },
  expectedCashBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 14,
    padding: 14,
    marginTop: 4
  },
  expectedLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#166534"
  },
  expectedSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  expectedAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: "#15803d"
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  pettyInputsRow: {
    flexDirection: "row",
    gap: 10
  },
  amberBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#d97706",
    height: 46,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: "#d97706",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2
  },
  amberBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  entriesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  entriesTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  entryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  entryItemInflow: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0"
  },
  entryItemOutflow: {
    backgroundColor: "#fffbeb",
    borderColor: "#fef3c7"
  },
  entryItemRefund: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  entryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  entryNote: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e"
  },
  entrySub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: "800"
  },
  entryAmountInflow: {
    color: "#15803d"
  },
  entryAmountOutflow: {
    color: "#d97706"
  },
  entryAmountRefund: {
    color: "#dc2626"
  },
  emptyEntriesBox: {
    padding: 14,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic"
  },
  closeShiftCard: {
    borderColor: "#fecaca"
  },
  destructiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    height: 48,
    borderRadius: 12,
    marginTop: 6,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3
  },
  destructiveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  historySection: {
    marginTop: 6
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingLeft: 4
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b"
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1
  },
  historyCardDiff: {
    borderColor: "#fca5a5",
    backgroundColor: "#fffbfa"
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  historyDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  historyDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569"
  },
  coSignBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  coSignBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb"
  },
  historyStatGrid: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historyStatItem: {
    flex: 1
  },
  historyStatLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 2
  },
  historyStatVal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a"
  },
  diffVal: {
    color: "#dc2626"
  },
  matchVal: {
    color: "#16a34a"
  },
  emptyHistoryBox: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  shiftPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12
  },
  shiftPdfBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13
  },
  miniPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 8
  },
  miniPdfText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb'
  }
});