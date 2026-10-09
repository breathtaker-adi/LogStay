import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      // Go to home screen
      router.replace("/staff-login");
    }
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Check your email for the verification link!");
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LogStay</Text>
      <Text style={styles.subtitle}>Desk & Owner Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <View style={styles.buttonContainer}>
        <Button title={loading ? "Loading..." : "Sign In"} onPress={signInWithEmail} color="#2563eb" />
      </View>
      <View style={styles.buttonContainer}>
        <Button title="Sign Up" onPress={signUpWithEmail} color="#6b7280" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#f3f4f6" },
  title: { fontSize: 32, fontWeight: "bold", textAlign: "center", color: "#2563eb" },
  subtitle: { fontSize: 16, textAlign: "center", color: "#6b7280", marginBottom: 30 },
  input: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: "#e5e7eb" },
  buttonContainer: { marginBottom: 10 },
});