import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export default function ExportsScreen() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");

  async function generateCSV() {
    if (!startDate || !endDate) {
      Alert.alert("Missing Dates", "Please enter both Start and End dates (YYYY-MM-DD).");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("No property found.");

      // Fetch Stays within date range, join guest & foreign details
      const { data: staysData, error } = await supabase
        .from('stays')
        .select('check_in, check_out, guests(name, nationality, id_type, id_last4), foreign_details(passport_no, visa_no)')
        .eq('property_id', memberData.property_id)
        .gte('check_in', `${startDate}T00:00:00`)
        .lte('check_in', `${endDate}T23:59:59`)
        .order('check_in', { ascending: true });

      if (error) throw error;

      if (!staysData || staysData.length === 0) {
        Alert.alert("No Data", "No check-ins found in this date range.");
        setLoading(false);
        return;
      }

      // Build CSV (Police Register + Form C format)
      let csvContent = "Guest Name,Nationality,ID Type,ID Last 4,Passport No,Visa No,Check-In,Check-Out\n";
      
      staysData.forEach((s: any) => {
        const g = s.guests;
        const f = s.foreign_details;
        const checkIn = new Date(s.check_in).toLocaleString();
        const checkOut = s.check_out ? new Date(s.check_out).toLocaleString() : 'Still In';
        
        const row = `"${g?.name || ''}","${g?.nationality || ''}","${g?.id_type || ''}","${g?.id_last4 || ''}","${f?.passport_no || 'N/A'}","${f?.visa_no || 'N/A'}","${checkIn}","${checkOut}"\n`;
        csvContent += row;
      });

      const file = new File(Paths.cache, 'logstay_compliance_export.csv');
      file.create({ overwrite: true });
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Compliance Export' });
      } else {
        Alert.alert("Saved", "File saved to device.");
      }

    } catch (error: any) {
      Alert.alert("Export Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compliance Exports</Text>
      <Text style={styles.subtitle}>Police Register & Form C (Date Range)</Text>

      <View style={styles.dateRow}>
        <TextInput style={styles.input} placeholder="Start (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
        <TextInput style={styles.input} placeholder="End (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
      </View>

      <View style={styles.buttonContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" />
        ) : (
          <Button title="Generate & Share CSV" onPress={generateCSV} color="#2563eb" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", color: "#1f2937", marginBottom: 5 },
  subtitle: { fontSize: 14, textAlign: "center", color: "#6b7280", marginBottom: 30 },
  dateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  input: { flex: 1, backgroundColor: "white", padding: 15, borderRadius: 8, marginHorizontal: 5, borderWidth: 1, borderColor: "#e5e7eb", textAlign: "center" },
  buttonContainer: { marginTop: 10 }
});