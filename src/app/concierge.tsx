// src/app/concierge.tsx
// Guest Wi-Fi & Info — Apple HIG Dedicated Configuration Screen
// Manages Wi-Fi credentials, maps location, Google reviews link, and house rules.
// Supports direct save by Owner & Co-Admin, and approval workflow for Front Desk.

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
  Platform,
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
  const isCoAdmin = activeStaff?.role === 'co_admin';
  const isDesk = activeStaff?.role === 'desk';
  const canDirectSave = isOwner || isCoAdmin;
  const canPropose = isDesk;
  const canEdit = canDirectSave || canPropose;

  const [propertyId, setPropertyId] = useState<string>("");
  const [propertyName, setPropertyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // Form inputs
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [houseRules, setHouseRules] = useState("");

  // Pending proposal state
  const [pendingConcierge, setPendingConcierge] = useState<any>(null);

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
        .select('name, wifi_ssid, wifi_password, google_maps_url, google_review_url, house_rules, pending_concierge')
        .eq('id', member.property_id)
        .single();

      if (prop) {
        setPropertyName(prop.name || 'Your Property');
        setWifiSsid(prop.wifi_ssid || "");
        setWifiPassword(prop.wifi_password || "");
        setGoogleMapsUrl(prop.google_maps_url || "");
        setGoogleReviewUrl(prop.google_review_url || "");
        setHouseRules(prop.house_rules || "");
        setPendingConcierge(prop.pending_concierge || null);
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
    if (!canEdit) {
      return Alert.alert('Restricted', 'Only the Owner, Co-Admin, or Front Desk staff can edit concierge settings.');
    }
    if (!propertyId) return;

    setSaving(true);
    try {
      const payload = {
        p_prop_id: propertyId,
        p_wifi_ssid: wifiSsid.trim(),
        p_wifi_password: wifiPassword.trim(),
        p_google_maps_url: googleMapsUrl.trim(),
        p_google_review_url: googleReviewUrl.trim(),
        p_house_rules: houseRules.trim(),
      };

      const { data: resultAction, error: rpcError } = await supabase.rpc('save_concierge_settings', payload);

      if (rpcError) {
        // Fallback if RPC fails or table direct update
        if (canDirectSave) {
          const { error: tblError } = await supabase
            .from('properties')
            .update({
              wifi_ssid: payload.p_wifi_ssid,
              wifi_password: payload.p_wifi_password,
              google_maps_url: payload.p_google_maps_url,
              google_review_url: payload.p_google_review_url,
              house_rules: payload.p_house_rules,
              pending_concierge: null,
            })
            .eq('id', propertyId);
          if (tblError) throw tblError;
          setPendingConcierge(null);
          Alert.alert('Saved', 'Guest Wi-Fi and concierge info updated successfully.');
        } else {
          // Front desk fallback
          const pendingObj = {
            wifi_ssid: payload.p_wifi_ssid,
            wifi_password: payload.p_wifi_password,
            google_maps_url: payload.p_google_maps_url,
            google_review_url: payload.p_google_review_url,
            house_rules: payload.p_house_rules,
            submitted_by: activeStaff?.name || 'Front Desk',
            submitted_at: new Date().toISOString(),
          };
          const { error: tblError } = await supabase
            .from('properties')
            .update({ pending_concierge: pendingObj })
            .eq('id', propertyId);
          if (tblError) throw tblError;
          setPendingConcierge(pendingObj);
          Alert.alert('Proposal Submitted', 'Your concierge changes have been submitted to the Owner / Co-Admin for review.');
        }
      } else {
        if (resultAction === 'saved' || canDirectSave) {
          setPendingConcierge(null);
          Alert.alert('Saved', 'Guest Wi-Fi and concierge info updated successfully.');
        } else {
          setPendingConcierge({
            wifi_ssid: payload.p_wifi_ssid,
            wifi_password: payload.p_wifi_password,
            google_maps_url: payload.p_google_maps_url,
            google_review_url: payload.p_google_review_url,
            house_rules: payload.p_house_rules,
            submitted_by: activeStaff?.name || 'Front Desk',
            submitted_at: new Date().toISOString(),
          });
          Alert.alert('Proposal Submitted', 'Your concierge update has been submitted for Owner / Co-Admin approval.');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save concierge settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewProposal = async (approve: boolean) => {
    if (!canDirectSave) return;
    setReviewing(true);
    try {
      const { error } = await supabase.rpc('review_concierge_proposal', {
        p_prop_id: propertyId,
        p_approve: approve,
      });

      if (error) {
        // Fallback direct table update
        if (approve && pendingConcierge) {
          await supabase
            .from('properties')
            .update({
              wifi_ssid: pendingConcierge.wifi_ssid,
              wifi_password: pendingConcierge.wifi_password,
              google_maps_url: pendingConcierge.google_maps_url,
              google_review_url: pendingConcierge.google_review_url,
              house_rules: pendingConcierge.house_rules,
              pending_concierge: null,
            })
            .eq('id', propertyId);
        } else {
          await supabase
            .from('properties')
            .update({ pending_concierge: null })
            .eq('id', propertyId);
        }
      }

      if (approve && pendingConcierge) {
        setWifiSsid(pendingConcierge.wifi_ssid || "");
        setWifiPassword(pendingConcierge.wifi_password || "");
        setGoogleMapsUrl(pendingConcierge.google_maps_url || "");
        setGoogleReviewUrl(pendingConcierge.google_review_url || "");
        setHouseRules(pendingConcierge.house_rules || "");
        Alert.alert('Proposal Approved', 'The concierge updates are now live for all guests and WhatsApp kits.');
      } else {
        Alert.alert('Proposal Declined', 'The proposed changes were discarded.');
      }
      setPendingConcierge(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not review proposal.');
    } finally {
      setReviewing(false);
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

            {/* Pending Proposal Review Card for Owner / Co-Admin */}
            {pendingConcierge && canDirectSave && (
              <View style={[styles.reviewCard, { backgroundColor: '#fffbeb', borderColor: '#f59e0b' }]}>
                <View style={styles.reviewHeaderRow}>
                  <Ionicons name="time" size={18} color="#b45309" />
                  <Text style={[styles.reviewHeaderTitle, { color: '#b45309' }]}>
                    Pending Update from {pendingConcierge.submitted_by || 'Front Desk'}
                  </Text>
                </View>
                <Text style={[styles.reviewSubText, { color: theme.textSecondary }]}>
                  Front Desk has proposed the following changes to guest concierge info:
                </Text>

                <View style={[styles.reviewDetailsBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                  {pendingConcierge.wifi_ssid ? (
                    <Text style={[styles.reviewDetailItem, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Wi-Fi SSID: </Text>
                      {pendingConcierge.wifi_ssid}
                    </Text>
                  ) : null}
                  {pendingConcierge.wifi_password ? (
                    <Text style={[styles.reviewDetailItem, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Password: </Text>
                      {pendingConcierge.wifi_password}
                    </Text>
                  ) : null}
                  {pendingConcierge.google_maps_url ? (
                    <Text style={[styles.reviewDetailItem, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Maps: </Text>
                      {pendingConcierge.google_maps_url}
                    </Text>
                  ) : null}
                  {pendingConcierge.google_review_url ? (
                    <Text style={[styles.reviewDetailItem, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Reviews: </Text>
                      {pendingConcierge.google_review_url}
                    </Text>
                  ) : null}
                  {pendingConcierge.house_rules ? (
                    <Text style={[styles.reviewDetailItem, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Rules: </Text>
                      {pendingConcierge.house_rules}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.reviewBtnRow}>
                  <TouchableOpacity
                    style={[styles.reviewDeclineBtn, { borderColor: theme.destructive, backgroundColor: theme.surface }]}
                    onPress={() => handleReviewProposal(false)}
                    disabled={reviewing}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={16} color={theme.destructive} />
                    <Text style={[styles.reviewDeclineText, { color: theme.destructive }]}>Decline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.reviewApproveBtn, { backgroundColor: '#16a34a' }]}
                    onPress={() => handleReviewProposal(true)}
                    disabled={reviewing}
                    activeOpacity={0.8}
                  >
                    {reviewing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                        <Text style={styles.reviewApproveText}>Approve & Apply</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Pending Notice for Front Desk */}
            {pendingConcierge && isDesk && (
              <View style={[styles.infoBanner, { backgroundColor: '#fffbeb', borderColor: '#f59e0b' }]}>
                <Ionicons name="hourglass-outline" size={20} color="#b45309" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoBannerTitle, { color: '#b45309' }]}>
                    Update Awaiting Approval
                  </Text>
                  <Text style={[styles.infoBannerBody, { color: theme.textSecondary }]}>
                    Your submitted concierge modifications are currently waiting for Owner or Co-Admin review.
                  </Text>
                </View>
              </View>
            )}

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
                  editable={canEdit}
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
                  editable={canEdit}
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
                  editable={canEdit}
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
                  editable={canEdit}
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
                  editable={canEdit}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Save / Submit Button */}
            {canEdit ? (
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: canDirectSave ? theme.accent : '#f59e0b' },
                ]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons
                      name={canDirectSave ? "checkmark-sharp" : "paper-plane-outline"}
                      size={18}
                      color="#ffffff"
                    />
                    <Text style={styles.saveBtnText}>
                      {canDirectSave ? "Save Concierge Info" : "Submit Update for Approval"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.readOnlyNote, { backgroundColor: theme.surfaceSubtle }]}>
                <Ionicons name="lock-closed-outline" size={15} color={theme.textTertiary} />
                <Text style={[styles.readOnlyNoteText, { color: theme.textSecondary }]}>
                  Concierge details can only be edited by the Owner, Co-Admin, or Front Desk.
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

  // Review card styles
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  reviewHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewSubText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  reviewDetailsBox: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  reviewDetailItem: {
    fontSize: 13,
    color: '#1f2937',
  },
  reviewBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reviewDeclineBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
  },
  reviewDeclineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  reviewApproveBtn: {
    flex: 1.4,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reviewApproveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

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
