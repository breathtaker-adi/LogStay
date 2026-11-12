// src/app/account.tsx
// Account & Device — Apple HIG Dedicated Screen
// Manages device account credentials, personal name edits, and guarded device sign out.
// PIN concept is completely removed.

import React, { useState, useEffect } from "react";
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
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useStaff } from "@/lib/staff-context";
import { ScreenHeader } from "@/lib/screen-header";
import { getPendingCount } from "@/lib/offline";
import { useTheme } from "@/hooks/use-theme";

export default function AccountDeviceScreen() {
  const theme = useTheme();
  const { activeStaff, logoutStaff, setActiveStaff } = useStaff();

  const [userEmail, setUserEmail] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [loading, setLoading] = useState(true);

  // Edit My Name state
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const loadAccount = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);

      if (user?.id) {
        const { data: member } = await supabase
          .from('members')
          .select('property_id')
          .eq('user_id', user.id)
          .single();

        if (member?.property_id) {
          setPropertyId(member.property_id);
          const { data: prop } = await supabase
            .from('properties')
            .select('name')
            .eq('id', member.property_id)
            .single();
          if (prop?.name) setPropertyName(prop.name);
        }
      }
    } catch (err) {
      console.error("Error loading account", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  const formatRoleLabel = (role?: string) => {
    switch (role) {
      case 'owner': return 'Property Owner';
      case 'co_admin': return 'Co-Admin';
      case 'desk': return 'Front Desk';
      case 'housekeeping': return 'Housekeeper';
      default: return role || 'Staff';
    }
  };

  // Save personal name for active staff member
  const handleSaveMyName = async () => {
    if (!nameInput.trim()) {
      return Alert.alert('Missing Name', 'Please enter your name.');
    }
    const updatedName = nameInput.trim();
    setNameSaving(true);
    try {
      if (activeStaff?.id) {
        const { error: rpcError } = await supabase.rpc('update_staff_name', {
          p_staff_id: activeStaff.id,
          p_name: updatedName,
        });

        if (rpcError) {
          await supabase
            .from('staff_profiles')
            .update({ name: updatedName })
            .eq('id', activeStaff.id);
        }

        if (setActiveStaff) {
          await setActiveStaff({
            ...activeStaff,
            name: updatedName,
          });
        }
      }

      setNameModalVisible(false);
      Alert.alert('Name Updated', `Your display name has been set to "${updatedName}".`);
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update your name.');
    } finally {
      setNameSaving(false);
    }
  };

  // Sign out device account with unsynced outbox check
  const handleSignOutPhone = async () => {
    const pendingCount = await getPendingCount();
    if (pendingCount > 0) {
      Alert.alert(
        "Unsynced Offline Changes",
        `You have ${pendingCount} offline change(s) that have not synced to the cloud yet. Signing out now may discard unsaved operations.\n\nConnect to the internet to sync, or tap 'Sign Out Anyway' to proceed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out Anyway",
            style: "destructive",
            onPress: executeSignOut
          }
        ]
      );
    } else {
      Alert.alert(
        "Sign Out This Device",
        "Are you sure you want to sign out? You will need your email & password to sign back in.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: executeSignOut
          }
        ]
      );
    }
  };

  const executeSignOut = async () => {
    try {
      await logoutStaff();
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (e) {
      console.error("Sign out error", e);
      router.replace("/login");
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Account & Device"
        subtitle="Identity & Terminal Access"
        showBack={true}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading account...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Inset Group 1: Account Information */}
          <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>DEVICE ACCOUNT</Text>
          <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.infoRow, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.infoLeft}>
                <Ionicons name="mail-outline" size={18} color={theme.accent} />
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>User Email</Text>
              </View>
              <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
                {userEmail || 'Signed In'}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.infoLeft}>
                <Ionicons name="business-outline" size={18} color={theme.accent} />
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Property</Text>
              </View>
              <Text style={[styles.infoValue, { color: theme.text }]} numberOfLines={1}>
                {propertyName || (propertyId ? `${propertyId.slice(0, 8)}...` : 'Connected')}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.accent} />
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Assigned Position</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: theme.accentSubtle }]}>
                <Text style={[styles.roleBadgeText, { color: theme.accent }]}>
                  {formatRoleLabel(activeStaff?.role).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Inset Group 2: Personal Profile */}
          <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>PERSONAL PROFILE</Text>
          <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                setNameInput(activeStaff?.name || '');
                setNameModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBox, { backgroundColor: theme.accentSubtle }]}>
                  <Ionicons name="person-outline" size={18} color={theme.accent} />
                </View>
                <View>
                  <Text style={[styles.actionTitle, { color: theme.text }]}>Edit My Name</Text>
                  <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                    Currently: {activeStaff?.name || 'Not set'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Inset Group 3: Device Controls */}
          <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>DEVICE SESSION</Text>
          <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleSignOutPhone}
              activeOpacity={0.7}
            >
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBox, { backgroundColor: theme.destructiveSubtle }]}>
                  <Ionicons name="log-out-outline" size={18} color={theme.destructive} />
                </View>
                <View>
                  <Text style={[styles.actionTitle, { color: theme.destructive }]}>Sign Out of Device</Text>
                  <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                    Disconnect this phone from the property account
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.destructive} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Edit My Name Modal */}
      <Modal
        visible={nameModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="person-circle" size={22} color={theme.accent} />
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Your Name</Text>
            </View>
            <Text style={[styles.modalHelpText, { color: theme.textSecondary }]}>
              Enter your name as it will appear across shift logs, concierge kits, and receipts.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="Your full name"
              placeholderTextColor={theme.textTertiary}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setNameModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: theme.accent }]}
                onPress={handleSaveMyName}
                disabled={nameSaving}
                activeOpacity={0.8}
              >
                {nameSaving ? (
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
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 40 },
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 14, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '600' },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, marginTop: 2 },
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
    gap: 10,
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
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
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
