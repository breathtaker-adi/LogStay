import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import * as Crypto from 'expo-crypto';
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

    try {
      const roomId = Crypto.randomUUID();
      const numBeds = kind === "dorm" ? (parseInt(bedCount, 10) || 1) : 1;
      const unitIds = Array.from({ length: numBeds }, () => Crypto.randomUUID());

      const { error: roomError } = await supabase.rpc('add_room_with_units', {
        p_room_id: roomId,
        p_label: label.trim(),
        p_kind: kind,
        p_floor: floor ? floor.trim() : null,
        p_unit_ids: unitIds,
        p_unit_labels: null,
        p_gender_rule: 'any'
      });

      if (roomError) {
        Alert.alert("Error", roomError.message);
        setLoading(false);
        return;
      }

      setLoading(false);
      router.replace("/home");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to add room");
      setLoading(false);
    }
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