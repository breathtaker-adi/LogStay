import { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList } from "react-native";
import { supabase } from "../lib/supabase";

export default function ShiftScreen() {
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [pastShifts, setPastShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [openingCash, setOpeningCash] = useState("");
  const [pettyAmount, setPettyAmount] = useState("");
  const [pettyNote, setPettyNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [coSignPin, setCoSignPin] = useState("");

  useEffect(() => {
    fetchShiftData();
  }, []);

  async function fetchShiftData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;

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
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("Property not found");

      const { data: newShift, error } = await supabase
        .from('shifts')
        .insert([{ property_id: memberData.property_id, opened_by: user?.id, opening_cash: parseFloat(openingCash), status: 'open' }])
        .select().single();

      if (error) throw error;
      setActiveShift(newShift);
      setOpeningCash("");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  async function addPettyCash() {
    if (!pettyAmount) return Alert.alert("Missing Info", "Please enter amount.");

    try {
      const { data: newEntry, error } = await supabase
        .from('cash_entries')
        .insert([{ shift_id: activeShift.id, kind: 'petty', amount: parseFloat(pettyAmount), note: pettyNote }])
        .select().single();

      if (error) throw error;
      setEntries([...entries, newEntry]);
      setPettyAmount("");
      setPettyNote("");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  async function closeShift() {
    if (!countedCash || !coSignPin) {
      return Alert.alert("Missing Info", "Please enter counted cash and incoming staff PIN.");
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("Property not found");

      // 1. Verify the Co-Sign PIN using the secure database function
      const { data: isValid, error: rpcError } = await supabase
        .rpc('verify_cosign', { p_prop: memberData.property_id, p_pin: coSignPin });

      if (rpcError || !isValid) {
        return Alert.alert("Invalid PIN", "The incoming staff PIN is incorrect or you cannot co-sign your own shift.");
      }

      // 2. Close the shift
      const { error: closeError } = await supabase
        .from('shifts')
        .update({
          status: 'closed',
          counted_cash: parseFloat(countedCash),
          closed_by: user?.id,
          closed_at: new Date().toISOString(),
          co_signed: true
        })
        .eq('id', activeShift.id);

      if (closeError) throw closeError;

      // 3. Add to Audit Log
      await supabase.from('audit_log').insert([{
        property_id: memberData.property_id,
        user_id: user?.id,
        action: 'shift_close',
        record_id: activeShift.id
      }]);

      Alert.alert("Success", "Shift closed & co-signed successfully!");
      setActiveShift(null);
      setEntries([]);
      setCountedCash("");
      setCoSignPin("");
      fetchShiftData(); // Refresh history

    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  // Calculate expected cash
  const totalPetty = entries.reduce((sum, e) => sum + e.amount, 0);
  const expectedCash = activeShift ? (activeShift.opening_cash - totalPetty) : 0;

  if (loading) {
    return <View style={styles.container}><Text>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shift Control</Text>

      {!activeShift ? (
        <View style={styles.section}>
          <Text style={styles.subtitle}>No active shift. Start a new one.</Text>
          <TextInput style={styles.input} placeholder="Opening Cash (e.g., 5000)" value={openingCash} onChangeText={setOpeningCash} keyboardType="numeric" />
          <Button title="Start Shift" onPress={startShift} color="#2563eb" />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.stats}>Opening Cash: ₹{activeShift.opening_cash}</Text>
          <Text style={styles.stats}>Total Petty Cash Paid: - ₹{totalPetty}</Text>
          <Text style={styles.statsBold}>Expected in Drawer: ₹{expectedCash}</Text>

          <View style={styles.divider} />

          <Text style={styles.subtitle}>Add Petty Cash / Khata</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 5 }]} placeholder="Amount" value={pettyAmount} onChangeText={setPettyAmount} keyboardType="numeric" />
            <TextInput style={[styles.input, { flex: 2, marginLeft: 5 }]} placeholder="Note (e.g., Diesel)" value={pettyNote} onChangeText={setPettyNote} />
          </View>
          <Button title="Add Petty Cash" onPress={addPettyCash} color="#f59e0b" />

          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            style={{ marginTop: 10, maxHeight: 150 }}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.entryItem}>
                <Text style={styles.entryText}>- ₹{item.amount} ({item.note || 'No note'})</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No petty cash added yet.</Text>}
          />

          <View style={styles.divider} />
          
          <Text style={styles.subtitle}>Close Shift (Handover)</Text>
          <TextInput style={styles.input} placeholder="Counted Cash by Desk Staff" value={countedCash} onChangeText={setCountedCash} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Incoming Staff PIN (Co-Sign)" value={coSignPin} onChangeText={setCoSignPin} keyboardType="numeric" maxLength={4} secureTextEntry />
          <Button title="Close & Co-Sign Shift" onPress={closeShift} color="#ef4444" />
        </View>
      )}

      {/* OWNER SHIFT HISTORY */}
      <Text style={styles.historyTitle}>Shift History (Owner View)</Text>
      <FlatList
        data={pastShifts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const expected = item.opening_cash - (item.cash_entries?.reduce((sum:number, e:any) => sum + e.amount, 0) || 0); // Simplified for history
          const diff = (item.counted_cash || 0) - expected;
          return (
            <View style={[styles.historyCard, diff !== 0 && styles.historyCardDiff]}>
              <Text style={styles.historyDate}>Closed: {new Date(item.closed_at).toLocaleString()}</Text>
              <Text style={styles.historyStat}>Expected: ₹{expected}</Text>
              <Text style={styles.historyStat}>Counted: ₹{item.counted_cash}</Text>
              <Text style={[styles.historyStat, diff !== 0 ? styles.diffText : styles.matchText]}>
                Difference: ₹{diff} {item.co_signed ? '(Co-Signed)' : ''}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No past shifts yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  subtitle: { fontSize: 16, fontWeight: "600", marginBottom: 10, color: "#374151" },
  section: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 20 },
  input: { backgroundColor: "#f9fafb", padding: 12, borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 10 },
  row: { flexDirection: "row" },
  stats: { fontSize: 16, marginBottom: 5, color: "#4b5563" },
  statsBold: { fontSize: 18, fontWeight: "bold", color: "#059669", marginTop: 5 },
  divider: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 15 },
  entryItem: { padding: 8, backgroundColor: "#fef3c7", borderRadius: 4, marginBottom: 5 },
  entryText: { color: "#92400e" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 10 },
  historyTitle: { fontSize: 18, fontWeight: "bold", color: "#1f2937", marginBottom: 10 },
  historyCard: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  historyCardDiff: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  historyDate: { fontSize: 12, color: "#6b7280", marginBottom: 5 },
  historyStat: { fontSize: 14, color: "#374151" },
  diffText: { color: "#b91c1c", fontWeight: "bold" },
  matchText: { color: "#059669", fontWeight: "bold" }
});