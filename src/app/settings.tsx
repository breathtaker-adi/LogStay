// src/app/settings.tsx
// Property Settings Hub — Apple HIG Inset Grouped Navigation Architecture
// Features: Revamped Apple-style cover photo card, Property Name editor,
// and clean drill-down navigation to dedicated screens (Concierge, Team, Account, Data).

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "@/lib/supabase";
import { useStaff } from "@/lib/staff-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { csvCell } from "@/lib/csv";
import { uploadBannerPhoto } from "@/lib/photo";
import { ScreenHeader } from "@/lib/screen-header";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";

const DEFAULT_BANNER = require('../../assets/images/property-banner.jpg');
const BG_STORAGE_KEY = 'home_banner_uri';

export default function SettingsScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const isOwner = activeStaff?.role === 'owner';
  const isDesk = activeStaff?.role === 'desk';

  const [propertyId, setPropertyId] = useState("");
  const [propertyDetails, setPropertyDetails] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Property Name state (Owner only)
  const [editPropNameModalVisible, setEditPropNameModalVisible] = useState(false);
  const [editPropNameInput, setEditPropNameInput] = useState('');
  const [editPropNameSaving, setEditPropNameSaving] = useState(false);

  // Photo state
  const [photoUploading, setPhotoUploading] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);

      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();

      if (!memberData?.property_id) return;
      setPropertyId(memberData.property_id);

      const { data: prop } = await supabase
        .from('properties')
        .select('*')
        .eq('id', memberData.property_id)
        .single();
      setPropertyDetails(prop);

      const { data: staffData } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', memberData.property_id)
        .order('name', { ascending: true });

      setStaffList(staffData || []);
    } catch (error) {
      console.error("Error fetching settings", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSettings();
    }, [])
  );

  // ── 1. Save Property Name (Owner Only) ──────────────────────────────────
  const handleSavePropertyName = async () => {
    if (!isOwner) {
      return Alert.alert('Restricted', 'Only the property owner can change the property name.');
    }
    if (!editPropNameInput.trim()) {
      return Alert.alert('Missing Name', 'Please enter a property name.');
    }
    const newName = editPropNameInput.trim();
    setEditPropNameSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('owner_update_property_name', {
        p_prop_id: propertyId,
        p_name: newName,
      });

      if (rpcError) {
        const { error: tblError } = await supabase
          .from('properties')
          .update({ name: newName })
          .eq('id', propertyId);
        if (tblError) throw tblError;
      }

      setPropertyDetails((prev: any) => ({ ...prev, name: newName }));
      setEditPropNameModalVisible(false);
      Alert.alert('Property Updated', `Property name changed to "${newName}".`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update property name.');
    } finally {
      setEditPropNameSaving(false);
    }
  };

  // ── 2. Pick & Upload / Propose Property Photo (Owner / Front Desk) ─────
  const handlePickPropertyPhoto = async () => {
    if (!isOwner && !isDesk) {
      return Alert.alert('Restricted', 'Only the property owner or front desk can change or propose photos.');
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permission Required', 'Allow photo library access to change the background.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;
    const uri = result.assets[0].uri;

    setPhotoUploading(true);
    try {
      const isPending = !isOwner;
      const uploadedUrl = await uploadBannerPhoto(propertyId, uri, isPending);

      if (isOwner) {
        const { error: rpcError } = await supabase.rpc('owner_update_property_photo', {
          p_prop_id: propertyId,
          p_photo_url: uploadedUrl,
        });

        if (rpcError) {
          await supabase
            .from('properties')
            .update({ photo_url: uploadedUrl, pending_photo_url: null, pending_photo_by: null })
            .eq('id', propertyId);
        }

        await AsyncStorage.setItem(BG_STORAGE_KEY, uploadedUrl);
        setPropertyDetails((prev: any) => ({ ...prev, photo_url: uploadedUrl, pending_photo_url: null }));
        Alert.alert('Photo Updated', 'The property hero photo has been updated.');
      } else {
        const { error: rpcError } = await supabase.rpc('desk_propose_property_photo', {
          p_prop_id: propertyId,
          p_photo_url: uploadedUrl,
          p_staff_id: activeStaff?.id,
        });

        if (rpcError) {
          await supabase
            .from('properties')
            .update({ pending_photo_url: uploadedUrl, pending_photo_by: activeStaff?.id })
            .eq('id', propertyId);
        }

        setPropertyDetails((prev: any) => ({ ...prev, pending_photo_url: uploadedUrl }));
        Alert.alert('Photo Submitted', 'Your proposed photo has been submitted to the property owner for approval.');
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not update photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── 3. Owner: Reset Photo to Default ────────────────────────────────────
  const handleResetPropertyPhoto = async () => {
    if (!isOwner) return;
    setPhotoUploading(true);
    try {
      await supabase
        .from('properties')
        .update({ photo_url: null, pending_photo_url: null, pending_photo_by: null })
        .eq('id', propertyId);
      await AsyncStorage.removeItem(BG_STORAGE_KEY);
      setPropertyDetails((prev: any) => ({ ...prev, photo_url: null, pending_photo_url: null }));
      Alert.alert('Photo Reset', 'Property photo restored to default.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not reset photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── 4. Owner: Approve Pending Photo from Front Desk ─────────────────────
  const handleApprovePendingPhoto = async () => {
    if (!isOwner || !propertyDetails?.pending_photo_url) return;
    setPhotoUploading(true);
    try {
      const { error: rpcError } = await supabase.rpc('owner_review_property_photo', {
        p_prop_id: propertyId,
        p_approve: true,
      });

      if (rpcError) {
        await supabase
          .from('properties')
          .update({
            photo_url: propertyDetails.pending_photo_url,
            pending_photo_url: null,
            pending_photo_by: null,
          })
          .eq('id', propertyId);
      }

      const newPhoto = propertyDetails.pending_photo_url;
      await AsyncStorage.setItem(BG_STORAGE_KEY, newPhoto);
      setPropertyDetails((prev: any) => ({
        ...prev,
        photo_url: newPhoto,
        pending_photo_url: null,
        pending_photo_by: null,
      }));
      Alert.alert('Photo Approved', 'The proposed photo is now live as your property hero banner.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not approve photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── 5. Owner: Decline Pending Photo from Front Desk ─────────────────────
  const handleRejectPendingPhoto = async () => {
    if (!isOwner || !propertyDetails?.pending_photo_url) return;
    setPhotoUploading(true);
    try {
      const { error: rpcError } = await supabase.rpc('owner_review_property_photo', {
        p_prop_id: propertyId,
        p_approve: false,
      });

      if (rpcError) {
        await supabase
          .from('properties')
          .update({ pending_photo_url: null, pending_photo_by: null })
          .eq('id', propertyId);
      }

      setPropertyDetails((prev: any) => ({
        ...prev,
        pending_photo_url: null,
        pending_photo_by: null,
      }));
      Alert.alert('Photo Declined', 'The proposed photo has been declined.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not decline photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ── 6. Download Guest CSV Backup ─────────────────────────────────────────
  async function downloadBackup() {
    if (activeStaff?.role === 'housekeeping') {
      Alert.alert("Restricted", "Guest database backup is restricted to Front Desk and Owners.");
      return;
    }
    Alert.alert("Generating Backup", "Please wait while we fetch all guest data...");
    try {
      const { data: guestsData } = await supabase
        .from('guests')
        .select('*')
        .eq('property_id', propertyId);

      if (!guestsData || guestsData.length === 0) {
        Alert.alert("No Data", "No guests to backup yet.");
        return;
      }

      const headers = ['Guest Name', 'Phone', 'Nationality', 'Gender', 'ID Type', 'ID Last 4', 'Created At'];
      const rows = guestsData.map((g: any) => [
        csvCell(g.name),
        csvCell(g.phone || '', true),
        csvCell(g.nationality || ''),
        csvCell(g.gender || ''),
        csvCell(g.id_type || ''),
        csvCell(g.id_last4 || ''),
        csvCell(g.created_at)
      ]);

      const csv = [
        headers.map(h => csvCell(h)).join(','),
        ...rows.map((r: string[]) => r.join(','))
      ].join('\n');

      const file = new File(Paths.cache, 'logstay_backup.csv');
      file.create({ overwrite: true });
      file.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Guest Backup' });
      }
    } catch (error: any) {
      Alert.alert("Backup Error", error.message);
    }
  }

  const bannerSource = propertyDetails?.photo_url
    ? { uri: propertyDetails.photo_url }
    : DEFAULT_BANNER;

  const pendingApprovalsCount = staffList.filter(s => !s.active).length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Settings"
        showBack={true}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading settings...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── REVAMPED APPLE-DESIGN PHOTO COVER CARD ──────────────────── */}
          <View style={[styles.heroCardContainer, { borderColor: theme.border }]}>
            <ImageBackground
              source={bannerSource}
              style={styles.heroImageBg}
              imageStyle={styles.heroImage}
            >
              {/* Subtle gradient vignette */}
              <View style={styles.heroVignette}>
                {/* Pending Approval Badge for Front Desk */}
                {isDesk && propertyDetails?.pending_photo_url && (
                  <View style={styles.pendingStatusBadge}>
                    <Ionicons name="time" size={13} color="#ffffff" />
                    <Text style={styles.pendingStatusText}>Photo Pending Owner Review</Text>
                  </View>
                )}

                {/* Revamped Action Buttons: Apple Frosted Glass Pills */}
                <View style={styles.heroPillsRow}>
                  {isOwner && propertyDetails?.photo_url && (
                    <TouchableOpacity
                      style={styles.appleGlassResetPill}
                      onPress={handleResetPropertyPhoto}
                      disabled={photoUploading}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Reset to default photo"
                    >
                      <Ionicons name="refresh" size={13} color="#ffffff" />
                      <Text style={styles.appleGlassPillText}>Reset</Text>
                    </TouchableOpacity>
                  )}

                  {(isOwner || isDesk) ? (
                    <TouchableOpacity
                      style={styles.appleGlassPill}
                      onPress={handlePickPropertyPhoto}
                      disabled={photoUploading || (isDesk && Boolean(propertyDetails?.pending_photo_url))}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Change photo"
                    >
                      {photoUploading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="camera" size={15} color="#ffffff" />
                          <Text style={styles.appleGlassPillText}>
                            {isOwner
                              ? 'Change Photo'
                              : (propertyDetails?.pending_photo_url ? 'Awaiting Approval' : 'Propose Photo')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.appleGlassPillDisabled}>
                      <Ionicons name="image-outline" size={14} color="#ffffff" />
                      <Text style={styles.appleGlassPillText}>Property Hero</Text>
                    </View>
                  )}
                </View>
              </View>
            </ImageBackground>
          </View>

          {/* Owner Pending Photo Review Card */}
          {isOwner && propertyDetails?.pending_photo_url && (
            <View style={[styles.approvalCard, { backgroundColor: theme.dirtySubtle, borderColor: '#FDE68A' }]}>
              <View style={styles.approvalHeaderRow}>
                <Ionicons name="alert-circle" size={18} color={theme.dirty} />
                <Text style={[styles.approvalTitle, { color: theme.dirty }]}>
                  Front Desk Photo Submitted for Review
                </Text>
              </View>
              <Text style={[styles.approvalSub, { color: theme.textSecondary }]}>
                A front desk team member suggested this new property banner photo:
              </Text>

              <Image
                source={{ uri: propertyDetails.pending_photo_url }}
                style={styles.approvalPreviewImage}
                resizeMode="cover"
              />

              <View style={styles.approvalBtnRow}>
                <TouchableOpacity
                  style={[styles.approvalBtn, { backgroundColor: '#16a34a' }]}
                  onPress={handleApprovePendingPhoto}
                  disabled={photoUploading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={15} color="#ffffff" />
                  <Text style={styles.approvalBtnText}>Approve Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.approvalBtn, { backgroundColor: '#dc2626' }]}
                  onPress={handleRejectPendingPhoto}
                  disabled={photoUploading}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle" size={15} color="#ffffff" />
                  <Text style={styles.approvalBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── PROPERTY IDENTITY CARD ──────────────────────────────────── */}
          <View style={[styles.propertyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.propertyRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.propertyNameTitle, { color: theme.text }]} numberOfLines={1}>
                  {propertyDetails?.name || 'Your Property'}
                </Text>
                <Text style={[styles.propertyCategory, { color: theme.textSecondary }]}>
                  {propertyDetails?.property_type ? `${propertyDetails.property_type.toUpperCase()} · ` : ''}Verified Property
                </Text>
              </View>

              {isOwner && (
                <TouchableOpacity
                  style={[styles.editPropBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}
                  onPress={() => {
                    setEditPropNameInput(propertyDetails?.name || '');
                    setEditPropNameModalVisible(true);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Edit property name"
                >
                  <Ionicons name="pencil" size={15} color={theme.accent} />
                  <Text style={[styles.editPropBtnText, { color: theme.accent }]}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── APPLE INSET GROUP 1: OPERATIONS & CONCIERGE ────────────── */}
          <Text style={[styles.sectionGroupHeader, { color: theme.textSecondary }]}>
            PROPERTY & OPERATIONS
          </Text>
          <View style={[styles.insetGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Row 1: Guest Wi-Fi & Info */}
            <TouchableOpacity
              style={[styles.navRow, { borderBottomColor: theme.borderSubtle }]}
              onPress={() => router.push('/concierge')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconBox, { backgroundColor: '#10b981' }]}>
                  <Ionicons name="wifi" size={18} color="#ffffff" />
                </View>
                <View style={styles.navTextBox}>
                  <Text style={[styles.navTitle, { color: theme.text }]}>Guest Wi-Fi & Info</Text>
                  <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                    Wi-Fi credentials, maps location & house rules
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
            </TouchableOpacity>

            {/* Row 2: Team & Access */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => router.push('/team')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconBox, { backgroundColor: '#6366f1' }]}>
                  <Ionicons name="people" size={18} color="#ffffff" />
                </View>
                <View style={styles.navTextBox}>
                  <Text style={[styles.navTitle, { color: theme.text }]}>Team & Access</Text>
                  <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                    {staffList.length} members · Positions & join codes
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {pendingApprovalsCount > 0 && (
                  <View style={[styles.pendingCounterPill, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[styles.pendingCounterText, { color: '#b45309' }]}>
                      {pendingApprovalsCount} PENDING
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── APPLE INSET GROUP 2: ACCOUNT & TERMINAL ────────────────── */}
          <Text style={[styles.sectionGroupHeader, { color: theme.textSecondary }]}>
            DEVICE & ACCOUNT
          </Text>
          <View style={[styles.insetGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => router.push('/account')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconBox, { backgroundColor: '#f59e0b' }]}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#ffffff" />
                </View>
                <View style={styles.navTextBox}>
                  <Text style={[styles.navTitle, { color: theme.text }]}>Account & Device</Text>
                  <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                    {userEmail || 'Signed In'} · {activeStaff?.name || 'Staff'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* ── APPLE INSET GROUP 3: DATA & PRIVACY ─────────────────────── */}
          <Text style={[styles.sectionGroupHeader, { color: theme.textSecondary }]}>
            DATA & RECORDS
          </Text>
          <View style={[styles.insetGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {activeStaff?.role !== 'housekeeping' && (
              <TouchableOpacity
                style={[styles.navRow, { borderBottomColor: theme.borderSubtle }]}
                onPress={downloadBackup}
                activeOpacity={0.7}
              >
                <View style={styles.navRowLeft}>
                  <View style={[styles.navIconBox, { backgroundColor: '#0284c7' }]}>
                    <Ionicons name="cloud-download-outline" size={18} color="#ffffff" />
                  </View>
                  <View style={styles.navTextBox}>
                    <Text style={[styles.navTitle, { color: theme.text }]}>Download Guest Backup (CSV)</Text>
                    <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                      Export encrypted CSV of registered guests
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity
                style={[styles.navRow, { borderBottomColor: theme.borderSubtle }]}
                onPress={() => router.push('/audit-log')}
                activeOpacity={0.7}
              >
                <View style={styles.navRowLeft}>
                  <View style={[styles.navIconBox, { backgroundColor: '#8b5cf6' }]}>
                    <Ionicons name="newspaper-outline" size={18} color="#ffffff" />
                  </View>
                  <View style={styles.navTextBox}>
                    <Text style={[styles.navTitle, { color: theme.text }]}>Audit Trail</Text>
                    <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                      Immutable ledger of operations & actions
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.navRow}
              onPress={() => router.push('/privacy')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconBox, { backgroundColor: '#64748b' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" />
                </View>
                <View style={styles.navTextBox}>
                  <Text style={[styles.navTitle, { color: theme.text }]}>Privacy Policy</Text>
                  <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                    DPDP Act compliance & data retention
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Edit Property Name Modal (Owner Only) */}
      <Modal
        visible={editPropNameModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditPropNameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="business" size={22} color={theme.accent} />
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Property Name</Text>
            </View>
            <Text style={[styles.modalHelpText, { color: theme.textSecondary }]}>
              Change how your hotel or hostel is branded across the app, guest receipts, and concierge kits.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. Sunset Palms Resort"
              placeholderTextColor={theme.textTertiary}
              value={editPropNameInput}
              onChangeText={setEditPropNameInput}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setEditPropNameModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: theme.accent }]}
                onPress={handleSavePropertyName}
                disabled={editPropNameSaving}
                activeOpacity={0.8}
              >
                {editPropNameSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save Name</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // ── Cover Photo Hero Card (Apple HIG standard) ──────────────────────
  heroCardContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    height: 180,
    backgroundColor: '#1E293B',
  },
  heroImageBg: { width: '100%', height: '100%' },
  heroImage: { borderRadius: 19 },
  heroVignette: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'space-between',
    padding: 12,
  },
  pendingStatusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(217, 119, 6, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pendingStatusText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  heroPillsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-end',
  },
  appleGlassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  appleGlassResetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  appleGlassPillDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  appleGlassPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },

  // ── Pending Photo Approval Request ─────────────────────────────────
  approvalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  approvalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  approvalTitle: { fontSize: 13, fontWeight: '700' },
  approvalSub: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
  approvalPreviewImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 10,
  },
  approvalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  approvalBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approvalBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  // ── Property Name Card ─────────────────────────────────────────────
  propertyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  propertyNameTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.3,
  },
  propertyCategory: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  editPropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginLeft: 12,
  },
  editPropBtnText: { fontSize: 12, fontWeight: '700' },

  // ── Apple Inset Grouped Navigation Table ───────────────────────────
  sectionGroupHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  insetGroupCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 8,
  },
  navIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTextBox: { flex: 1 },
  navTitle: { fontSize: 15, fontWeight: '600' },
  navSubtitle: { fontSize: 12, marginTop: 2 },
  pendingCounterPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pendingCounterText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // ── Modal Styles ───────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    padding: 20,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalHelpText: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  modalInput: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
