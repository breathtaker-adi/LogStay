import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { csvCell } from "../lib/csv";

const formatPoliceRegisterCSV = (stays: any[]) => {
  // Standard Indian Police Register Columns
  const headers = [
    'Serial No',
    'Guest Name',
    'Father/Husband Name', // We don't collect this yet, so leaving blank
    'Nationality',
    'ID Type',
    'ID Number (Last 4)',
    'Phone',
    'Date of Arrival',
    'Room/Bed No',
    'Check-Out Date'
  ];
  
  const rows = stays.map((s, index) => [
    csvCell(index + 1),
    csvCell(s.guests?.name || ''),
    csvCell(''), // Father's name
    csvCell(s.guests?.nationality || ''),
    csvCell(s.guests?.id_type || ''),
    csvCell(`****${s.guests?.id_last4 || ''}`), // Masked ID
    csvCell(s.guests?.phone || '', true),
    csvCell(new Date(s.check_in).toLocaleDateString('en-IN')),
    csvCell(s.units?.label || s.unit_id || ''), // Room label
    csvCell(s.check_out ? new Date(s.check_out).toLocaleDateString('en-IN') : 'In House')
  ]);

  return [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
};

const formatFormC = (stays: any[]) => {
  // Exact BoI bulk upload headers
  const headers = [
    'Sl No',
    'Given Name',
    'Surname',
    'Nationality',
    'Passport No',
    'Visa Type',
    'Visa No',
    'Date of Arrival',
    'Duration of Stay (Days)',
    'Address in India',
    'Purpose of Visit',
    'Port of Embarkation',
    'Port of Disembarkation'
  ];
  
  const rows = stays.map((s, index) => {
    const checkIn = new Date(s.check_in);
    const today = new Date();
    // Calculate duration (if checked out, use check_out, else use today)
    const endDate = s.check_out ? new Date(s.check_out) : today;
    const duration = Math.max(1, Math.ceil((endDate.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
    const foreignDetails = Array.isArray(s.foreign_details) ? s.foreign_details[0] : s.foreign_details;

    // Split name into given/surname roughly
    const nameParts = (guest?.name || '').split(' ');
    const givenName = nameParts[0] || '';
    const surname = nameParts.slice(1).join(' ') || '-';

    return [
      csvCell(index + 1),
      csvCell(givenName),
      csvCell(surname),
      csvCell(guest?.nationality || ''),
      csvCell(foreignDetails?.passport_no || s.passport_no || ''),
      csvCell(foreignDetails?.visa_type || s.visa_type || ''),
      csvCell(foreignDetails?.visa_no || s.visa_no || ''),
      csvCell(checkIn.toLocaleDateString('en-IN')),
      csvCell(duration),
      csvCell(s.property_address || ''), // Ideally join property address
      csvCell('Tourism'), // Default
      csvCell(foreignDetails?.arrived_from || s.arrived_from || ''),
      csvCell(foreignDetails?.next_dest || s.next_dest || '')
    ];
  });

  return [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
};

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

      // Fetch Stays within date range with guest and unit details
      const { data: staysData, error } = await supabase
        .from('stays')
        .select('check_in, check_out, unit_id, units(label), guests(name, nationality, id_type, id_last4, phone)')
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

      // Build CSV (Standard Indian Police Register format)
      const csvContent = formatPoliceRegisterCSV(staysData);

      const file = new File(Paths.cache, 'logstay_police_register.csv');
      file.create({ overwrite: true });
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Police Register Export' });
      } else {
        Alert.alert("Saved", "File saved to device.");
      }

    } catch (error: any) {
      Alert.alert("Export Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateFormC() {
    if (!startDate || !endDate) {
      Alert.alert("Missing Dates", "Please enter both Start and End dates (YYYY-MM-DD).");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("No property found.");

      // Fetch foreign stays with foreign_details
      const { data: staysData, error } = await supabase
        .from('stays')
        .select('check_in, check_out, unit_id, units(label), guests(name, nationality, phone), foreign_details(passport_no, visa_no, visa_type, arrived_from, next_dest)')
        .eq('property_id', memberData.property_id)
        .gte('check_in', `${startDate}T00:00:00`)
        .lte('check_in', `${endDate}T23:59:59`)
        .order('check_in', { ascending: true });

      if (error) throw error;

      // Filter for foreign guests only
      const foreignStays = (staysData as any[] || []).filter((s: any) => {
        const foreignDetails = Array.isArray(s.foreign_details) ? s.foreign_details[0] : s.foreign_details;
        const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
        return (
          foreignDetails?.passport_no || 
          (guest?.nationality && !guest.nationality.toLowerCase().includes('indian'))
        );
      });

      if (foreignStays.length === 0) {
        Alert.alert("No Foreign Guests", "No foreign check-ins found in this date range.");
        setLoading(false);
        return;
      }

      const csvContent = formatFormC(foreignStays);
      const file = new File(Paths.cache, 'logstay_form_c_boi.csv');
      file.create({ overwrite: true });
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Form C (BoI Export)' });
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
          <>
            <Button title="Generate Police Register CSV" onPress={generateCSV} color="#2563eb" />
            <View style={{ marginTop: 12 }}>
              <Button title="Generate Form C CSV (BoI Format)" onPress={generateFormC} color="#059669" />
            </View>
          </>
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