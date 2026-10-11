import { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { supabase } from "../lib/supabase";

export default function FormCScreen() {
  const [foreignStays, setForeignStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchForeignGuests();
  }, []);

  async function fetchForeignGuests() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;

      // Fetch stays + foreign details + guest names
      const { data: staysData, error } = await supabase
        .from('stays')
        .select('id, check_in, status, guests(name), foreign_details(passport_no, form_c_filed)')
        .eq('property_id', memberData.property_id)
        .not('guests.nationality', 'ilike', '%indian%')

      if (error) throw error;
      setForeignStays(staysData || []);
    } catch (error) {
      console.error("Error fetching foreign guests", error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsFiled(stayId: string) {
    try {
      const { error } = await supabase.rpc('mark_form_c_filed', {
        p_stay_id: stayId,
        p_staff_id: null
      });

      if (error) throw error;
      Alert.alert("Success", "Form C marked as filed!");
      fetchForeignGuests(); // Refresh list
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Form C Tracker</Text>
      <Text style={styles.subtitle}>Foreign guests pending and filed</Text>

      <FlatList
        data={foreignStays}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isFiled = item.foreign_details?.form_c_filed;
          return (
            <View style={[styles.card, isFiled && styles.cardFiled]}>
              <View style={styles.cardInfo}>
                <Text style={styles.guestName}>{item.guests?.name || 'Unknown'}</Text>
                <Text style={styles.passportText}>Passport: {item.foreign_details?.passport_no || 'N/A'}</Text>
                <Text style={styles.dateText}>In: {new Date(item.check_in).toLocaleDateString()}</Text>
              </View>
              
              {isFiled ? (
                <View style={styles.filedBadge}>
                  <Text style={styles.filedText}>✓ FILED</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.pendingBtn} onPress={() => markAsFiled(item.id)}>
                  <Text style={styles.btnText}>Mark Filed</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No foreign guests found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", color: "#1f2937" },
  subtitle: { fontSize: 14, textAlign: "center", color: "#6b7280", marginBottom: 20 },
  card: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  cardFiled: { backgroundColor: "#ecfdf5", borderColor: "#10b981" },
  cardInfo: { flex: 1 },
  guestName: { fontSize: 18, fontWeight: "bold" },
  passportText: { color: "#6b7280", marginTop: 4, fontSize: 14 },
  dateText: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  filedBadge: { backgroundColor: "#10b981", padding: 10, borderRadius: 6 },
  filedText: { color: "white", fontWeight: "bold" },
  pendingBtn: { backgroundColor: "#f59e0b", paddingVertical: 10, paddingHorizontal: 15, borderRadius: 6 },
  btnText: { color: "white", fontWeight: "bold" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 20 }
});