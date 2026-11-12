import { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Crypto from 'expo-crypto';
import { supabase } from "../lib/supabase";
import { isOnline, saveToOutbox, getCachedPropertyId, setCachedPropertyId } from "../lib/offline";
import { useStaff } from "../lib/staff-context";
import { can } from "../lib/permissions";
import { ScreenHeader } from "@/lib/screen-header";
import { exportShiftReportPDF } from "@/lib/pdf-reports";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { ShiftService } from "@/services/shift.service";

export default function ShiftScreen() {
  const theme = useTheme();
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
  const [pendingHandover, setPendingHandover] = useState<any | null>(null);
  const [handoverCountedCash, setHandoverCountedCash] = useState("");

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
      } else {
        setActiveShift(null);
        setEntries([]);
      }

      // 1.5. Fetch Pending Handover Shift (if any)
      const { data: handoverShift } = await supabase
        .from('shifts')
        .select('*')
        .eq('property_id', memberData.property_id)
        .eq('status', 'pending_handover')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setPendingHandover(handoverShift || null);

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

  async function submitHandover() {
    if (!(await isOnline())) {
      Alert.alert('Internet Required', "You must be online to submit shift for handover.");
      return;
    }

    if (!countedCash) {
      return Alert.alert("Missing Info", "Please enter counted drawer cash.");
    }

    try {
      await ShiftService.submitShiftHandover(activeShift.id, parseFloat(countedCash));
      Alert.alert("Shift Locked", "Shift submitted for two-person handover. Waiting for incoming staff to count drawer and accept.");
      setActiveShift(null);
      setEntries([]);
      setCountedCash("");
      fetchShiftData();
    } catch (error: any) {
      Alert.alert("Handover Error", error.message || "Failed to submit handover.");
    }
  }

  async function acceptHandover() {
    if (!pendingHandover) return;
    if (!(await isOnline())) {
      Alert.alert('Internet Required', "You must be online to accept shift handover.");
      return;
    }

    if (!handoverCountedCash) {
      return Alert.alert("Missing Info", "Please enter the physical drawer cash counted.");
    }

    try {
      await ShiftService.acceptShiftHandover(pendingHandover.id, parseFloat(handoverCountedCash));
      Alert.alert("Handover Accepted", "Two-person handover verified! Your new shift is now open.");
      setPendingHandover(null);
      setHandoverCountedCash("");
      fetchShiftData();
    } catch (error: any) {
      Alert.alert("Acceptance Error", error.message || "Failed to accept handover.");
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

    try {
      const { error: rpcError } = await supabase.rpc('close_shift_secure', {
        p_shift_id: activeShift.id,
        p_counted_cash: parseFloat(countedCash),
        p_staff_id: activeStaff?.id,
        p_cosign_pin: null
      });

      if (rpcError) {
        // Fallback: direct update if RPC fails
        await supabase
          .from('shifts')
          .update({
            end_time: new Date().toISOString(),
            counted_cash: parseFloat(countedCash),
            status: 'closed'
          })
          .eq('id', activeShift.id);
      }

      Alert.alert("Success", "Shift closed successfully!");
      setActiveShift(null);
      setEntries([]);
      setCountedCash("");
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
      <View style={[styles.loadingBox, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading shift data...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title="Shift & Cash Control"
        subtitle={activeShift ? "Cash Drawer Active" : "No Active Shift"}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
        {pendingHandover && !activeShift && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: '#fde68a', borderWidth: 1.5 }]}>
            <View style={styles.cardIconHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                <Ionicons name="people" size={24} color="#d97706" />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Shift Handover Waiting</Text>
                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                  Previous staff locked drawer. Count physical cash to accept custody.
                </Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Your Blind Count in Drawer (₹)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Count physical cash in drawer..."
                placeholderTextColor={theme.textTertiary}
                value={handoverCountedCash}
                onChangeText={setHandoverCountedCash}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: '#16a34a', shadowColor: '#16a34a', marginTop: 12 }]}
              onPress={acceptHandover}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
              <Text style={styles.primaryActionText}>Accept Handover & Open My Shift</Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeShift ? (
          /* Start Shift Card */
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardIconHeader}>
              <View style={[styles.iconCircle, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
                <Ionicons name="time" size={26} color={theme.accentText} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Open Desk Shift</Text>
                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>Start counting transactions and cash collections</Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Opening Drawer Cash (₹)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="5000"
                placeholderTextColor={theme.textTertiary}
                value={openingCash}
                onChangeText={setOpeningCash}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]} onPress={startShift} activeOpacity={0.8}>
              <Ionicons name="play" size={16} color="#ffffff" />
              <Text style={styles.primaryActionText}>Start Shift</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Shift Cash Summary Banner */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.drawerHeaderRow, { borderBottomColor: theme.borderSubtle }]}>
                <View style={styles.statusIndicator}>
                  <View style={[styles.pulsingDot, { backgroundColor: theme.free }]} />
                  <Text style={[styles.drawerStatusText, { color: theme.free }]}>Shift In Progress</Text>
                </View>
                <Text style={[styles.drawerDate, { color: theme.textSecondary }]}>
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
                <View style={[styles.statPillBox, { backgroundColor: theme.surfaceSubtle }]}>
                  <Text style={[styles.statPillLabel, { color: theme.textSecondary }]}>Opening Cash</Text>
                  <Text style={[styles.statPillValue, { color: theme.text }]}>₹{Number(activeShift.opening_cash).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statPillBox, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={[styles.statPillLabel, { color: '#16a34a' }]}>Cash Inflows</Text>
                  <Text style={[styles.statPillValue, { color: '#16a34a' }]}>+ ₹{Number(collections).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statPillBox, { backgroundColor: '#fffbeb' }]}>
                  <Text style={[styles.statPillLabel, { color: '#d97706' }]}>Petty Outflow</Text>
                  <Text style={[styles.statPillValue, { color: '#d97706' }]}>- ₹{Number(totalPetty).toLocaleString('en-IN')}</Text>
                </View>
              </View>

              <View style={[styles.expectedCashBanner, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
                <View>
                  <Text style={[styles.expectedLabel, { color: theme.accentText }]}>Expected in Drawer</Text>
                  <Text style={[styles.expectedSub, { color: theme.textSecondary }]}>Opening + Collections - Outflows</Text>
                </View>
                <Text style={[styles.expectedAmount, { color: theme.accentText }]}>₹{Number(expectedCash).toLocaleString('en-IN')}</Text>
              </View>

              <TouchableOpacity
                style={[styles.shiftPdfBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => handleExportShiftPDF(activeShift)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={16} color={theme.text} />
                <Text style={[styles.shiftPdfBtnText, { color: theme.text }]}>Export Shift PDF Report</Text>
              </TouchableOpacity>
            </View>

            {/* Petty Cash Outflows Card */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="receipt-outline" size={18} color="#d97706" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Add Petty Cash / Khata Outflow</Text>
              </View>

              <View style={styles.pettyInputsRow}>
                <View style={[styles.inputWrapper, { flex: 1, backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Amount"
                    placeholderTextColor={theme.textTertiary}
                    value={pettyAmount}
                    onChangeText={setPettyAmount}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputWrapper, { flex: 2, backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Note (e.g., Diesel, Milk)"
                    placeholderTextColor={theme.textTertiary}
                    value={pettyNote}
                    onChangeText={setPettyNote}
                  />
                </View>
              </View>

              <TouchableOpacity style={[styles.amberBtn, { backgroundColor: '#d97706', shadowColor: '#d97706' }]} onPress={addPettyCash} activeOpacity={0.8}>
                <Ionicons name="remove-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.amberBtnText}>Record Cash Outflow</Text>
              </TouchableOpacity>

              <View style={styles.entriesHeaderRow}>
                <Text style={[styles.entriesTitle, { color: theme.textSecondary }]}>Recent Drawer Activity ({entries.length})</Text>
              </View>

              {entries.length === 0 ? (
                <View style={[styles.emptyEntriesBox, { backgroundColor: theme.surfaceSubtle, borderRadius: 10 }]}>
                  <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No cash collections or payouts recorded for this shift yet.</Text>
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
                          { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }
                        ]}
                      >
                        <View style={styles.entryLeft}>
                          <Ionicons 
                            name={isInflow ? "arrow-up-circle" : "arrow-down-circle"} 
                            size={18} 
                            color={isInflow ? '#16a34a' : isRefund ? '#dc2626' : '#d97706'} 
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.entryNote, { color: theme.text }]}>
                              {item.note || (isInflow ? 'Cash Collection' : 'Petty expense')}
                            </Text>
                            <Text style={[styles.entrySub, { color: theme.textSecondary }]}>
                              {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              {` • ${isInflow ? 'Inflow (Cash In)' : isRefund ? 'Outflow (Refund)' : 'Outflow (Expense)'}`}
                            </Text>
                          </View>
                        </View>
                        <Text style={[
                          styles.entryAmount, 
                          { color: isInflow ? '#16a34a' : isRefund ? '#dc2626' : '#d97706' }
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
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="swap-horizontal" size={18} color={theme.accentText} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Shift Handover (Two-Person Blind Count)</Text>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Your Blind Physical Count in Drawer (₹)</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="Enter drawer cash counted..."
                  placeholderTextColor={theme.textTertiary}
                  value={countedCash}
                  onChangeText={setCountedCash}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: theme.accent, shadowColor: theme.accent, marginTop: 14 }]}
                onPress={submitHandover}
                activeOpacity={0.8}
              >
                <Ionicons name="lock-closed" size={18} color="#ffffff" />
                <Text style={styles.primaryActionText}>Lock Drawer & Submit Handover</Text>
              </TouchableOpacity>

              {/* Owner Solo Direct Close Fallback */}
              {activeStaff?.role === 'owner' && (
                <TouchableOpacity
                  style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}
                  onPress={closeShift}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: theme.textSecondary, textDecorationLine: 'underline' }}>
                    Solo Property Owner Direct Close (Bypass Handover)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* OWNER SHIFT HISTORY */}
        <View style={styles.historySection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar-outline" size={17} color={theme.textSecondary} />
            <Text style={[styles.historyTitle, { color: theme.textSecondary }]}>Shift Handover Logs (Owner View)</Text>
          </View>

          {pastShifts.length === 0 ? (
            <View style={[styles.emptyHistoryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No closed shift records found.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {pastShifts.map((item) => {
                const expected = item.opening_cash - (item.cash_entries?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0);
                const diff = (item.counted_cash || 0) - expected;
                const hasDiff = diff !== 0;

                return (
                  <View key={item.id} style={[styles.historyCard, { backgroundColor: theme.surface, borderColor: hasDiff ? '#fecaca' : theme.border }]}>
                    <View style={[styles.historyCardHeader, { borderBottomColor: theme.borderSubtle }]}>
                      <View style={styles.historyDateRow}>
                        <Ionicons name="checkmark-circle" size={16} color={hasDiff ? '#dc2626' : '#16a34a'} />
                        <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                          Closed {new Date(item.closed_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      {item.co_signed && (
                        <View style={[styles.coSignBadge, { backgroundColor: theme.accentSubtle }]}>
                          <Text style={[styles.coSignBadgeText, { color: theme.accentText }]}>Co-Signed</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.historyStatGrid}>
                      <View style={styles.historyStatItem}>
                        <Text style={[styles.historyStatLabel, { color: theme.textSecondary }]}>Expected</Text>
                        <Text style={[styles.historyStatVal, { color: theme.text }]}>₹{Number(expected).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={styles.historyStatItem}>
                        <Text style={[styles.historyStatLabel, { color: theme.textSecondary }]}>Counted</Text>
                        <Text style={[styles.historyStatVal, { color: theme.text }]}>₹{Number(item.counted_cash || 0).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={styles.historyStatItem}>
                        <Text style={[styles.historyStatLabel, { color: theme.textSecondary }]}>Difference</Text>
                        <Text style={[styles.historyStatVal, { color: hasDiff ? '#dc2626' : '#16a34a' }]}>
                          {diff > 0 ? `+₹${diff}` : diff < 0 ? `-₹${Math.abs(diff)}` : '₹0'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.miniPdfBtn, { borderTopColor: theme.borderSubtle }]}
                      onPress={() => handleExportShiftPDF(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-outline" size={14} color={theme.accentText} />
                      <Text style={[styles.miniPdfText, { color: theme.accentText }]}>Export Shift PDF</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardIconHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a"
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
    marginTop: 4
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
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
    height: 46,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2
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
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    color: "#16a34a"
  },
  drawerDate: {
    fontSize: 12,
    color: "#64748b",
    fontVariant: ["tabular-nums"]
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  statPillBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b"
  },
  statPillValue: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: "#0f172a",
    marginTop: 3
  },
  expectedCashBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    padding: 12,
    marginTop: 2
  },
  expectedLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb"
  },
  expectedSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  expectedAmount: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: "#2563eb"
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12
  },
  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a"
  },
  pettyInputsRow: {
    flexDirection: "row",
    gap: 8
  },
  amberBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#d97706",
    height: 44,
    borderRadius: 10,
    marginBottom: 14,
    shadowColor: "#d97706",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
  },
  amberBtnText: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "700"
  },
  entriesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  entriesTitle: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.0
  },
  entryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth
  },
  entryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  entryNote: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a"
  },
  entrySub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    fontVariant: ["tabular-nums"]
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
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
  destructiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    height: 46,
    borderRadius: 10,
    marginTop: 4,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2
  },
  destructiveBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  historySection: {
    marginTop: 4
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingLeft: 2
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1.0,
    textTransform: "uppercase"
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    fontVariant: ["tabular-nums"],
    color: "#475569"
  },
  coSignBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5
  },
  coSignBadgeText: {
    fontSize: 10,
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
    fontVariant: ["tabular-nums"],
    color: "#0f172a"
  },
  emptyHistoryBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
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
    borderWidth: 1,
    borderColor: '#cbd5e1',
    height: 44,
    borderRadius: 10,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    marginTop: 8
  },
  miniPdfText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb'
  }
});