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
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { AppleExitModal } from "@/components/apple-exit-modal";
import { useStaff } from "@/lib/staff-context";
import { AuthService } from "@/services";

export default function LoginScreen() {
  const theme = useTheme();
  const { setActiveStaff } = useStaff();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [exitModalVisible, setExitModalVisible] = useState(false);

  // Requirement 5: Confirmation when user tries to quit app from root login screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        setExitModalVisible(true);
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

    if (mode === "signup" && !agreedToTerms) {
      Alert.alert(
        "Terms Required",
        "Please accept the Terms of Service & Privacy Policy to create your account."
      );
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          Alert.alert("Sign In Failed", error.message);
          return;
        }

        const user = authData?.user;
        if (!user) {
          router.replace("/login");
          return;
        }

        // Resolve profile & property membership through AuthService
        const resolved = await AuthService.resolveUserProfile();
        if (resolved.session) {
          await setActiveStaff(resolved.session);
          router.replace("/home");
          return;
        }

        if (resolved.needsPropertySetup) {
          router.replace("/setup-property");
          return;
        }

        router.replace("/setup-property");
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
      style={[styles.keyboardAvoid, { backgroundColor: theme.background }]}
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
          <AppLogo size={72} style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts?.serif ?? 'serif' }]}>LogStay</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Desk & Owner Management Terminal
          </Text>
        </View>

        {/* Card Form */}
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            {mode === "signin" ? "Sign in to your property" : "Create new account"}
          </Text>

          {/* Email Input */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Email address</Text>
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator },
              focusedField === "email" && { borderColor: theme.accent, backgroundColor: theme.backgroundElement },
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={18}
              color={focusedField === "email" ? theme.accent : theme.textTertiary}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="owner@property.com"
              placeholderTextColor={theme.textTertiary}
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
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Password Input */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Password</Text>
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator },
              focusedField === "password" && { borderColor: theme.accent, backgroundColor: theme.backgroundElement },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={focusedField === "password" ? theme.accent : theme.textTertiary}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="••••••••••••"
              placeholderTextColor={theme.textTertiary}
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
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Terms & Policy Checkbox on Sign Up */}
          {mode === "signup" && (
            <View style={styles.termsRow}>
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  { borderColor: theme.separator },
                  agreedToTerms && { backgroundColor: theme.accent, borderColor: theme.accent }
                ]}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
              >
                {agreedToTerms && <Ionicons name="checkmark" size={14} color="#ffffff" />}
              </TouchableOpacity>
              <Text style={[styles.termsText, { color: theme.textSecondary }]}>
                I agree to the{" "}
                <Text
                  style={[styles.termsLink, { color: theme.accent }]}
                  onPress={() => router.push("/privacy")}
                >
                  Terms & Privacy Policy
                </Text>
              </Text>
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }, loading && styles.primaryBtnDisabled]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={mode === "signin" ? "Sign in" : "Register"}
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
            <Text style={[styles.toggleModeText, { color: theme.accent }]}>
              {mode === "signin"
                ? "Don't have an account? Sign Up"
                : "Already registered? Sign In"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security Footer */}
        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color={theme.textTertiary} />
          <Text style={[styles.footerText, { color: theme.textTertiary }]}>
            Secure Session • Offline-Capable Storage
          </Text>
        </View>
      </ScrollView>

      {/* Apple HIG Exit Confirmation Dialog */}
      <AppleExitModal
        visible={exitModalVisible}
        onCancel={() => setExitModalVisible(false)}
        onConfirm={() => {
          setExitModalVisible(false);
          BackHandler.exitApp();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subtitle: {
    // 13 pt #5E6773 on #FAFAF9 → ~5.1:1 ✓
    fontSize: 13,
    marginTop: 6,
    fontWeight: "400",
  },
  card: {
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  termsText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  primaryBtn: {
    borderRadius: 12,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  toggleModeBtn: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 8,
  },
  toggleModeText: {
    fontSize: 14,
    fontWeight: "500",
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
  },
});