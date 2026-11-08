// src/app/concierge.tsx
// Guest Wi-Fi & Info — Apple HIG Dedicated Configuration Screen
// Manages Wi-Fi credentials, maps location, Google reviews link, and house rules.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Linking,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useStaff } from "@/lib/staff-context";
import { ScreenHeader } from "@/lib/screen-header";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";

export default function GuestConciergeScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const isOwner = activeStaff?.role === 'owner';

  const [propertyId, setPropertyId] = useState<string>("");
  const [propertyName, setPropertyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [houseRules, setHouseRules] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user.id)
        .single();

      if (!member?.property_id) return;
      setPropertyId(member.property_id);

      const { data: prop } = await supabase
        .from('properties')
        .select('name, wifi_ssid, wifi_password, google_maps_url, google_review_url, house_rules')
        .eq('id', member.property_id)
        .single();

      if (prop) {
        setPropertyName(prop.name || 'Your Property');
        setWifiSsid(prop.wifi_ssid || "");
        setWifiPassword(prop.wifi_password || "");
        setGoogleMapsUrl(prop.google_maps_url || "");
        setGoogleReviewUrl(prop.google_review_url || "");
        setHouseRules(prop.house_rules || "");
      }
    } catch (err) {
      console.error("Error loading concierge data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!isOwner) {
      return Alert.alert('Restricted', 'Only the property owner can update guest concierge settings.');
    }
    if (!propertyId) return;

    setSaving(true);
    try {
      const payload = {
        wifi_ssid: wifiSsid.trim(),
        wifi_password: wifiPassword.trim(),
        google_maps_url: googleMapsUrl.trim(),
        google_review_url: googleReviewUrl.trim(),
        house_rules: houseRules.trim(),
      };

      const { error: rpcError } = await supabase.rpc('owner_update_concierge_settings', {
        p_prop_id: propertyId,
        p_wifi_ssid: payload.wifi_ssid,
        p_wifi_password: payload.wifi_password,
        p_google_maps_url: payload.google_maps_url,
        p_google_review_url: payload.google_review_url,
        p_house_rules: payload.house_rules,
      });

      if (rpcError) {
        const { error: tblError } = await supabase
          .from('properties')
          .update(payload)
          .eq('id', propertyId);
        if (tblError) throw tblError;
      }

      Alert.alert('Saved', 'Guest Wi-Fi and concierge info updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save concierge settings.');
    } finally {
      setSaving(false);
    }
  };

  const openUrl = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return Alert.alert('No Link', 'No link has been configured yet.');
    }
    const target = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    try {
      const supported = await Linking.canOpenURL(target);
      if (supported) {
        await Linking.openURL(target);
      } else {
        Alert.alert('Invalid URL', 'Could not open this link.');
      }
    } catch {
      Alert.alert('Error', 'Unable to open link.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Guest Wi-Fi & Info"
        subtitle="WhatsApp Concierge Kit"
        showBack={true}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading concierge info...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            {/* Header info badge */}
            <View style={[styles.infoBanner, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
              <Ionicons name="chatbubbles" size={20} color={theme.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoBannerTitle, { color: theme.text }]}>
                  Automatic WhatsApp Concierge
                </Text>
                <Text style={[styles.infoBannerBody, { color: theme.textSecondary }]}>
                  These details are automatically bundled into instant WhatsApp check-in kits and receipts sent to guests.
                </Text>
              </View>
            </View>

            {/* Inset Group 1: Wi-Fi Credentials */}
            <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>WI-FI ACCESS</Text>
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.rowInput, { borderBottomColor: theme.borderSubtle }]}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="wifi" size={17} color={theme.accent} />
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Network (SSID)</Text>
                </View>
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="e.g. SunsetPalms_Guest"
                  placeholderTextColor={theme.textTertiary}
                  value={wifiSsid}
                  onChangeText={setWifiSsid}
                  editable={isOwner}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.rowInput}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="key-outline" size={17} color={theme.accent} />
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Password</Text>
                </View>
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="e.g. Welcome2026"
                  placeholderTextColor={theme.textTertiary}
                  value={wifiPassword}
                  onChangeText={setWifiPassword}
                  editable={isOwner}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Inset Group 2: Maps & Reviews */}
            <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>MAPS & REVIEWS</Text>
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.rowInputStacked, { borderBottomColor: theme.borderSubtle }]}>
                <View style={styles.inputHeaderRow}>
                  <View style={styles.inputLabelRow}>
                    <Ionicons name="map-outline" size={17} color={theme.accent} />
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Google Maps Link</Text>
                  </View>
                  {googleMapsUrl ? (
                    <TouchableOpacity
                      style={[styles.testPill, { backgroundColor: theme.accentSubtle }]}
                      onPress={() => openUrl(googleMapsUrl)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.testPillText, { color: theme.accent }]}>Test Link</Text>
                      <Ionicons name="open-outline" size={12} color={theme.accent} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.textInputStacked, { color: theme.text }]}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor={theme.textTertiary}
                  value={googleMapsUrl}
                  onChangeText={setGoogleMapsUrl}
                  editable={isOwner}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>

              <View style={styles.rowInputStacked}>
                <View style={styles.inputHeaderRow}>
                  <View style={styles.inputLabelRow}>
                    <Ionicons name="star-outline" size={17} color="#f59e0b" />
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Google Reviews Link</Text>
                  </View>
                  {googleReviewUrl ? (
                    <TouchableOpacity
                      style={[styles.testPill, { backgroundColor: '#fef3c7' }]}
                      onPress={() => openUrl(googleReviewUrl)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.testPillText, { color: '#b45309' }]}>Test Link</Text>
                      <Ionicons name="open-outline" size={12} color="#b45309" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.textInputStacked, { color: theme.text }]}
                  placeholder="https://g.page/r/.../review"
                  placeholderTextColor={theme.textTertiary}
                  value={googleReviewUrl}
                  onChangeText={setGoogleReviewUrl}
                  editable={isOwner}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
            </View>

            {/* Inset Group 3: House Rules / Amenities */}
            <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>HOUSE RULES & NOTICE</Text>
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.rowInputStacked}>
                <TextInput
                  style={[styles.textArea, { color: theme.text }]}
                  placeholder="e.g. Quiet hours 10 PM - 7 AM • Breakfast served 8 AM to 10 AM in the courtyard • Key return at front desk on checkout."
                  placeholderTextColor={theme.textTertiary}
                  value={houseRules}
                  onChangeText={setHouseRules}
                  editable={isOwner}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Save Button for Owner */}
            {isOwner ? (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-sharp" size={18} color="#ffffff" />
                    <Text style={styles.saveBtnText}>Save Concierge Info</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.readOnlyNote, { backgroundColor: theme.surfaceSubtle }]}>
                <Ionicons name="lock-closed-outline" size={15} color={theme.textTertiary} />
                <Text style={[styles.readOnlyNoteText, { color: theme.textSecondary }]}>
                  Concierge details can only be edited by the property owner.
                </Text>
              </View>
            )}

            {/* WhatsApp Guest Preview Card */}
            <Text style={[styles.groupHeader, { color: theme.textSecondary, marginTop: 24 }]}>
              LIVE WHATSAPP PREVIEW
            </Text>
            <View style={styles.whatsappCard}>
              <View style={styles.whatsappHeader}>
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                <Text style={styles.whatsappHeaderText}>Guest Check-in Kit</Text>
              </View>
              <View style={styles.whatsappBubble}>
                <Text style={styles.whatsappBubbleText}>
                  {`🏨 *Welcome to ${propertyName}!*\n\n`}
                  {`📶 *Wi-Fi Network:* ${wifiSsid || 'LogStay_Guest'}\n`}
                  {`🔑 *Wi-Fi Password:* ${wifiPassword || '••••••••'}\n`}
                  {googleMapsUrl ? `📍 *Location Map:* ${googleMapsUrl}\n` : ''}
                  {houseRules ? `📋 *House Rules:* ${houseRules}\n\n` : '\n'}
                  {`_We wish you a wonderful stay!_`}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  infoBannerBody: { fontSize: 12, lineHeight: 17 },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  groupedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  rowInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  rowInputStacked: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { fontSize: 14, fontWeight: '600' },
  textInput: {
    fontSize: 14,
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
    paddingVertical: 4,
  },
  textInputStacked: {
    fontSize: 14,
    paddingVertical: 6,
  },
  textArea: {
    fontSize: 14,
    minHeight: 80,
    lineHeight: 20,
    paddingVertical: 4,
  },
  testPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  testPillText: { fontSize: 11, fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    marginTop: 4,
  },
  saveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  readOnlyNoteText: { fontSize: 13, flex: 1 },
  whatsappCard: {
    backgroundColor: '#E5DDD5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  whatsappHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  whatsappHeaderText: { fontSize: 12, fontWeight: '700', color: '#1F2937' },
  whatsappBubble: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderTopLeftRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  whatsappBubbleText: {
    fontSize: 13,
    color: '#111827',
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
});

