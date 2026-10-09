import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, Button, Pressable, ScrollView, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export default function SettingsScreen() {
  const [propertyId, setPropertyId] = useState("");
  const [team, setTeam] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member) return;

      const { data, error } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', member.property_id)
        .order('name', { ascending: true });

      if (!error && data) {
        setStaffList(data);
      }
    } catch (e) {
      console.error("Error loading staff profiles", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;
      setPropertyId(memberData.property_id);

      const { data: teamData } = await supabase.from('members').select('id, role, user_id').eq('property_id', memberData.property_id);
      setTeam(teamData || []);
    } catch (error) {
      console.error("Error fetching settings", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchStaff();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStaff();
    }, [])
  );

  async function downloadBackup() {
    Alert.alert("Generating Backup", "Please wait while we fetch all guest data...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("No property found.");
      
      // Fetch ALL guests for this property
      const { data: guestsData } = await supabase
        .from('guests')
        .select('*')
        .eq('property_id', memberData.property_id);

      if (!guestsData || guestsData.length === 0) {
        Alert.alert("No Data", "No guests to backup yet.");
        return;
      }

      // Convert to CSV
      let csv = "Guest Name,Phone,Nationality,Gender,ID Type,ID Last 4,Photo Path,Created At\n";
      guestsData.forEach((g: any) => {
        csv += `"${g.name}","${g.phone || ''}","${g.nationality || ''}","${g.gender || ''}","${g.id_type || ''}","${g.id_last4 || ''}","${g.id_photo_path || ''}","${g.created_at}"\n`;
      });

      const file = new File(Paths.cache, 'logstay_backup.csv');
      file.create({ overwrite: true });
      file.write(csv);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Data Backup' });
      }
    } catch (error: any) {
      Alert.alert("Backup Error", error.message);
    }
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.title}>Property Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Property ID (Invite Code)</Text>
        <Text style={styles.codeText}>{propertyId}</Text>
        <Text style={styles.helperText}>Share this code with your desk staff so they can sign up and join your property.</Text>
      </View>

      {/* Staff Profiles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team Members</Text>
        
        {staffList.map((item) => (
          <View key={item.id} style={styles.staffItem}>
            <Text style={styles.staffName}>{item.name}</Text>
            <Text style={styles.staffRole}>{item.role}</Text>
          </View>
        ))}

        {staffList.length === 0 && (
          <Text style={styles.emptyText}>No staff profiles created yet.</Text>
        )}

        <Pressable style={styles.addBtn} onPress={() => router.push('/add-staff')}>
          <Text style={styles.addBtnText}>+ Add Staff Member</Text>
        </Pressable>
      </View>

      <View style={styles.backupCard}>
        <View style={[styles.backupCard, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", marginTop: 0 }]}>
          <Text style={[styles.backupTitle, { color: "#065f46" }]}>Need Help?</Text>
          <Text style={styles.backupText}>Facing an issue? Contact LogStay support directly on WhatsApp.</Text>
          <Button 
            title="Chat with Support" 
            onPress={() => Linking.openURL('https://wa.me/919999999999')} // Change this number!
            color="#059669" 
          />
        </View>
        <Text style={[styles.backupTitle, { marginTop: 15 }]}>Data Safety</Text>
        <Text style={styles.backupText}>Download a CSV backup of all guests. Save it to Google Drive or send it to your email in case your phone is lost.</Text>
        <Button title="Download Guest Backup (CSV)" onPress={downloadBackup} color="#2563eb" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  card: { backgroundColor: "white", padding: 20, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 10 },
  codeText: { fontSize: 20, fontWeight: "bold", color: "#2563eb", marginBottom: 10, textAlign: "center" },
  helperText: { fontSize: 12, color: "#9ca3af", textAlign: "center" },
  section: { backgroundColor: "white", padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: "#1f2937" },
  staffItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  staffName: { fontSize: 16, fontWeight: '500', color: "#1f2937" },
  staffRole: { color: '#64748b', textTransform: 'capitalize' },
  addBtn: { backgroundColor: '#eff6ff', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  addBtnText: { color: '#2563eb', fontWeight: 'bold' },
  memberCard: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", justifyContent: "space-between" },
  memberRole: { fontWeight: "bold", color: "#059669" },
  memberId: { color: "#6b7280", fontSize: 12 },
  emptyText: { textAlign: "center", color: "#9ca3af", marginVertical: 10 },
  backupCard: { backgroundColor: "#eff6ff", padding: 20, borderRadius: 8, borderWidth: 1, borderColor: "#bfdbfe" },
  backupTitle: { fontSize: 18, fontWeight: "bold", color: "#1e40af", marginBottom: 5 },
  backupText: { fontSize: 14, color: "#374151", marginBottom: 15 }
});