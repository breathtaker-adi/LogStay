import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { isOnline, saveToOutbox, removeStayFromCache, updateLocalUnitStatus } from "../lib/offline";
import { useStaff } from "../lib/staff-context";

export default function CheckoutScreen() {
  const { activeStaff } = useStaff();
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
        .select('id, guest_id, check_in, unit_id, guests(name), units(label)')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in');

      setActiveStays(staysData || []);
    } catch (error) {
      console.error("Error fetching stays", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(stay: any) {
    const stayId = stay.id;
    const unitId = stay.unit_id;

    if (await isOnline()) {
      // 1. Fetch stay balance
      const { data: stayData } = await supabase
        .from('stays')
        .select('amount, paid_amount')
        .eq('id', stayId)
        .single();

      const { data: chargesData } = await supabase
        .from('charges')
        .select('unit_price, qty')
        .eq('stay_id', stayId);

      const totalCharges = (chargesData || []).reduce((sum, c) => sum + Number(c.unit_price) * c.qty, 0);
      const balance = (Number(stayData?.amount || 0) + totalCharges) - Number(stayData?.paid_amount || 0);

      // 2. Check balance
      if (balance > 0) {
        Alert.alert(
          'Balance Due',
          `This guest has an unpaid balance of ₹${balance.toFixed(2)}. Please collect payment or authorize write-off.`,
          [
            { text: 'Cancel' },
            { text: 'Go to Folio', onPress: () => router.push(`/guest/${stay.guest_id}?stayId=${stay.id}`) }
          ]
        );
        return; // Block checkout
      }
    }

    Alert.alert(
      "Confirm Check-Out",
      "Are you sure you want to check out this guest?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check-Out",
          style: "destructive",
          onPress: async () => {
            try {
              if (await isOnline()) {
                const { error: rpcError } = await supabase.rpc('check_out_guest', {
                  p_stay_id: stayId,
                  p_staff_id: activeStaff?.id
                });

                if (rpcError) {
                  Alert.alert("Checkout Failed", rpcError.message);
                  return;
                }
              } else {
                // Offline: Queue it
                await saveToOutbox('guest_checkout', { 
                  stay_id: stayId,
                  staff_id: activeStaff?.id
                });
                // Optimistic UI: Remove from local cache so bed grid updates instantly
                await removeStayFromCache(stayId);
                await updateLocalUnitStatus(unitId, 'dirty');
              }

              Alert.alert("Checked Out", "Guest has been checked out successfully.");
              fetchActiveStays(); // Refresh list
              router.replace('/home');
            } catch (error: any) {
              Alert.alert("Error", error.message || "Checkout failed");
            }
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
            <TouchableOpacity style={styles.checkoutBtn} onPress={() => handleCheckout(item)}>
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