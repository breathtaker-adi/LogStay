import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function SetupPropertyScreen() {
  const [isOwner, setIsOwner] = useState(true);
  const [name, setName] = useState("");
  const [type, setType] = useState("Hostel");
  const [state, setState] = useState("");
  const [pin, setPin] = useState("1234");
  
  // Staff join state
  const [propertyId, setPropertyId] = useState("");
  
  const [loading, setLoading] = useState(false);

  async function saveData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      if (isOwner) {
        // OWNER FLOW: Create Property
        if (!name || !state) {
          Alert.alert("Missing Info", "Please enter Property Name and State.");
          setLoading(false);
          return;
        }

        const { data: newProperty, error: propError } = await supabase
          .from('properties')
          .insert([{ name, type, state, owner_id: user?.id }])
          .select()
          .single();

        if (propError) throw propError;

        const { error: memberError } = await supabase
          .from('members')
          .insert([{ property_id: newProperty.id, user_id: user?.id, role: 'owner' }]);

        if (memberError) throw memberError;
        
        // Set secure PIN
        await supabase.rpc('set_pin', { p_prop: newProperty.id, p_pin: pin });

        Alert.alert("Success", "Property created successfully!");

      } else {
        // STAFF FLOW: Join Property
        if (!propertyId) {
          Alert.alert("Missing Info", "Please enter the Property ID.");
          setLoading(false);
          return;
        }

        const { error: memberError } = await supabase
          .from('members')
          .insert([{ property_id: propertyId, user_id: user?.id, role: 'staff' }]);

        if (memberError) throw memberError;
        
        // Set secure PIN
        await supabase.rpc('set_pin', { p_prop: propertyId, p_pin: pin });

        Alert.alert("Success", "Joined property successfully!");
      }
      
      router.replace("/home");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setup Account</Text>

      <View style={styles.toggleContainer}>
        <TouchableOpacity style={[styles.toggleButton, isOwner && styles.activeToggle]} onPress={() => setIsOwner(true)}>
          <Text style={isOwner ? styles.activeText : styles.inactiveText}>I am an Owner</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleButton, !isOwner && styles.activeToggle]} onPress={() => setIsOwner(false)}>
          <Text style={!isOwner ? styles.activeText : styles.inactiveText}>I am Staff</Text>
        </TouchableOpacity>
      </View>

      {isOwner ? (
        <>
          <TextInput style={styles.input} placeholder="Property Name" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Type (Hostel/Guest House)" value={type} onChangeText={setType} />
          <TextInput style={styles.input} placeholder="State (e.g., Uttarakhand)" value={state} onChangeText={setState} />
        </>
      ) : (
        <>
          <Text style={styles.helperText}>Enter the Property ID given to you by the Owner:</Text>
          <TextInput style={styles.input} placeholder="Property ID (Invite Code)" value={propertyId} onChangeText={setPropertyId} />
        </>
      )}

      <TextInput style={styles.input} placeholder="Set 4-Digit Shift PIN" value={pin} onChangeText={setPin} keyboardType="numeric" maxLength={4} secureTextEntry />

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" />
      ) : (
        <Button title={isOwner ? "Create Property" : "Join Property"} onPress={saveData} color="#2563eb" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  toggleContainer: { flexDirection: "row", marginBottom: 20, justifyContent: "space-around" },
  toggleButton: { flex: 1, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "white", alignItems: "center", marginHorizontal: 5 },
  activeToggle: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  activeText: { color: "white", fontWeight: "bold" },
  inactiveText: { color: "#6b7280" },
  input: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: "#e5e7eb" },
  helperText: { fontSize: 14, color: "#6b7280", marginBottom: 10, textAlign: "center" }
});