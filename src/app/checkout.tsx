import { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function CheckoutScreen() {
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveStays();
  }, []);

  async function fetchActiveStays() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;

      const { data: staysData } = await supabase
        .from('stays')
        .select('id, check_in, unit_id, guests(name), units(label)')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in');

      setActiveStays(staysData || []);
    } catch (error) {
      console.error("Error fetching stays", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(stayId: string, unitId: string) {
    Alert.alert(
      "Confirm Check-Out",
      "Are you sure you want to check out this guest?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check-Out",
          style: "destructive",
          onPress: async () => {
            // Call the Atomic Database Function
            const { error: rpcError } = await supabase.rpc('check_out_guest', {
              p_stay_id: stayId,
              p_unit_id: unitId
            });

            if (rpcError) {
              Alert.alert("Error", rpcError.message);
            } else {
              Alert.alert("Success", "Guest checked out. Bed marked as DIRTY.");
            }
            
            fetchActiveStays(); // Refresh list
          }
        }
      ]
    );
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Active Guests (Check-Out)</Text>

      <FlatList
        data={activeStays}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.guestName}>{item.guests?.name || 'Unknown'}</Text>
              <Text style={styles.bedLabel}>Bed: {item.units?.label || 'N/A'}</Text>
              <Text style={styles.dateText}>In: {new Date(item.check_in).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={() => handleCheckout(item.id, item.unit_id)}>
              <Text style={styles.btnText}>Check-Out</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No active guests right now.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  card: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  cardInfo: { flex: 1 },
  guestName: { fontSize: 18, fontWeight: "bold" },
  bedLabel: { color: "#6b7280", marginTop: 4 },
  dateText: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  checkoutBtn: { backgroundColor: "#dc2626", paddingVertical: 10, paddingHorizontal: 15, borderRadius: 6 },
  btnText: { color: "white", fontWeight: "bold" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 20 }
});