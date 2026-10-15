// src/app/login.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  BackHandler,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { AppLogo } from "@/components/app-logo";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  // Requirement 5: Confirmation when user tries to quit app from root login screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          "Exit LogStay",
          "Are you sure you want to exit the application?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() },
          ]
        );
        return true;
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [])
  );

  async function handleAuth() {
    if (!email.trim() || !password) {
      Alert.alert("Missing Details", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          Alert.alert("Sign In Failed", error.message);
        } else {
          router.replace("/staff-login");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          Alert.alert("Sign Up Failed", error.message);
        } else {
          Alert.alert(
            "Account Created",
            "Verification link sent to your email. Check your inbox to activate your account."
          );
          setMode("signin");
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <AppLogo size={68} style={{ marginBottom: 14 }} />
          <Text style={styles.title}>LogStay</Text>
          <Text style={styles.subtitle}>Desk & Owner Management Terminal</Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.formTitle}>
            {mode === "signin" ? "Sign In to Your Property" : "Create New Account"}
          </Text>

          {/* Email Input */}
          <Text style={styles.fieldLabel}>Email Address</Text>
          <View
            style={[
              styles.inputWrapper,
              focusedField === "email" && styles.inputWrapperFocused,
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={focusedField === "email" ? "#2563eb" : "#94a3b8"}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="owner@property.com"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
            />
            {email.length > 0 && (
              <TouchableOpacity onPress={() => setEmail("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            )}
          </View>

          {/* Password Input */}
          <Text style={styles.fieldLabel}>Password</Text>
          <View
            style={[
              styles.inputWrapper,
              focusedField === "password" && styles.inputWrapperFocused,
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={focusedField === "password" ? "#2563eb" : "#94a3b8"}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType={mode === "signin" ? "password" : "newPassword"}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === "signin" ? "Sign In" : "Register"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Switch Mode Toggle */}
          <TouchableOpacity
            style={styles.toggleModeBtn}
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            <Text style={styles.toggleModeText}>
              {mode === "signin"
                ? "Don't have an account? Sign Up"
                : "Already registered? Sign In"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security Footer */}
        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#94a3b8" />
          <Text style={styles.footerText}>Secure Session • Offline-Capable Storage</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 18,
    textAlign: "center",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 14,
  },
  inputWrapperFocused: {
    borderColor: "#2563eb",
    backgroundColor: "#ffffff",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: 0,
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  toggleModeBtn: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 6,
  },
  toggleModeText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 28,
  },
  footerText: {
    fontSize: 12,
    color: "#94a3b8",
  },
});