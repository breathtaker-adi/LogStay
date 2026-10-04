import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function SettingsScreen() {
  const [propertyId, setPropertyId] = useState("");
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();

      if (!memberData) return;
      setPropertyId(memberData.property_id);

      // Fetch Team Members
      const { data: teamData } = await supabase
        .from('members')
        .select('id, role, user_id')
        .eq('property_id', memberData.property_id);

      setTeam(teamData || []);
    } catch (error) {
      console.error("Error fetching settings", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Property Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Property ID (Invite Code)</Text>
        <Text style={styles.codeText}>{propertyId}</Text>
        <Text style={styles.helperText}>Share this code with your desk staff so they can sign up and join your property.</Text>
      </View>

      <Text style={styles.teamTitle}>Team Members</Text>
      <FlatList
        data={team}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.memberCard}>
            <Text style={styles.memberRole}>{item.role.toUpperCase()}</Text>
            <Text style={styles.memberId}>User: {item.user_id.substring(0, 8)}...</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No team members found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  card: { backgroundColor: "white", padding: 20, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 10 },
  codeText: { fontSize: 20, fontWeight: "bold", color: "#2563eb", marginBottom: 10, textAlign: "center" },
  helperText: { fontSize: 12, color: "#9ca3af", textAlign: "center" },
  teamTitle: { fontSize: 18, fontWeight: "bold", color: "#1f2937", marginBottom: 10 },
  memberCard: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", justifyContent: "space-between" },
  memberRole: { fontWeight: "bold", color: "#059669" },
  memberId: { color: "#6b7280", fontSize: 12 },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 20 }
});