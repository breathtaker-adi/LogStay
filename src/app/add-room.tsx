import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function AddRoomScreen() {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"private" | "dorm">("private");
  const [floor, setFloor] = useState("");
  const [bedCount, setBedCount] = useState("4");
  const [loading, setLoading] = useState(false);

  async function saveRoom() {
    if (!label) {
      Alert.alert("Missing Info", "Please enter a Room Label (e.g., 101).");
      return;
    }

    setLoading(true);

    // 1. Get the user's property_id
    const { data: { user } } = await supabase.auth.getUser();
    const { data: memberData } = await supabase
      .from('members')
      .select('property_id')
      .eq('user_id', user?.id)
      .single();

    if (!memberData) {
      Alert.alert("Error", "No property found for this user.");
      setLoading(false);
      return;
    }

    // 2. Insert the Room
    const { data: newRoom, error: roomError } = await supabase
      .from('rooms')
      .insert([{ property_id: memberData.property_id, label: label, kind: kind, floor: floor }])
      .select()
      .single();

    if (roomError) {
      Alert.alert("Error", roomError.message);
      setLoading(false);
      return;
    }

    // 3. If it's a dorm, create the beds (units)
    if (kind === "dorm") {
      const numBeds = parseInt(bedCount, 10) || 1;
      const unitsToInsert = Array.from({ length: numBeds }, (_, i) => ({
        room_id: newRoom.id,
        label: `Bed ${i + 1}`,
        gender_rule: 'any'
      }));

      const { error: unitsError } = await supabase.from('units').insert(unitsToInsert);
      if (unitsError) {
        Alert.alert("Error creating beds", unitsError.message);
      }
    } else {
      // If private room, just create 1 unit representing the whole room
      const { error: unitError } = await supabase
        .from('units')
        .insert([{ room_id: newRoom.id, label: 'Whole Room', gender_rule: 'any' }]);
        
      if (unitError) Alert.alert("Error creating unit", unitError.message);
    }

    setLoading(false);
    router.replace("/home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Room / Bed</Text>

      <TextInput style={styles.input} placeholder="Room Label (e.g., 101 or Dorm A)" value={label} onChangeText={setLabel} />
      <TextInput style={styles.input} placeholder="Floor (e.g., 1st)" value={floor} onChangeText={setFloor} />

      <Text style={styles.label}>Room Type:</Text>
      <View style={styles.toggleContainer}>
        <TouchableOpacity style={[styles.toggleButton, kind === "private" && styles.activeToggle]} onPress={() => setKind("private")}>
          <Text style={kind === "private" ? styles.activeText : styles.inactiveText}>Private</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleButton, kind === "dorm" && styles.activeToggle]} onPress={() => setKind("dorm")}>
          <Text style={kind === "dorm" ? styles.activeText : styles.inactiveText}>Dorm</Text>
        </TouchableOpacity>
      </View>

      {kind === "dorm" && (
        <TextInput 
          style={styles.input} 
          placeholder="Number of Beds" 
          value={bedCount} 
          onChangeText={setBedCount} 
          keyboardType="numeric" 
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" />
      ) : (
        <Button title="Save Room" onPress={saveRoom} color="#2563eb" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  input: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: "#e5e7eb" },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 10, color: "#374151" },
  toggleContainer: { flexDirection: "row", marginBottom: 20, justifyContent: "space-around" },
  toggleButton: { flex: 1, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "white", alignItems: "center", marginHorizontal: 5 },
  activeToggle: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  activeText: { color: "white", fontWeight: "bold" },
  inactiveText: { color: "#6b7280" }
});