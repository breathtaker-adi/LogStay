// src/app/settings.tsx
// Property Settings, Team Management, Data & Privacy, and Guarded Account Sign-Out
// Section 3E: Reordered sections, Owner Step-Up PIN for staff management, unsynced-outbox guard

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Linking,
  Modal,
  TextInput,
  TouchableOpacity
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useStaff } from "../lib/staff-context";
import { getPendingCount, isOnline, saveToOutbox, saveLocalPinHash } from "../lib/offline";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { csvCell } from "../lib/csv";
import { ScreenHeader } from "@/lib/screen-header";
import { formatFriendlyError } from "@/lib/error-utils";

export default function SettingsScreen() {
  const { activeStaff, logoutStaff } = useStaff();
  const [propertyId, setPropertyId] = useState("");
  const [propertyDetails, setPropertyDetails] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Modal state for Reset PIN, Change Role & Deactivate with Owner Step-Up PIN
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'reset_pin' | 'change_role' | 'deactivate' | null>(null);
  const [targetStaff, setTargetStaff] = useState<{ id: string; name: string } | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalOwnerPin, setModalOwnerPin] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Self-service PIN change state
  const [changePinModalVisible, setChangePinModalVisible] = useState(false);
  const [changePinCurrent, setChangePinCurrent] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [changePinSubmitting, setChangePinSubmitting] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);

      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();

      if (!memberData) return;
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

  const handleGenerateInvite = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_invite_code', {
        p_prop: propertyId,
        p_actor: activeStaff?.id
      });
      if (!error && data) {
        setInviteCode(data);
        Alert.alert('Invite Generated', `Code: ${data}\nExpires in 48 hours.`);
      } else {
        Alert.alert('Error', error?.message || 'Failed to generate code');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleManageStaff = (staffId: string, name: string) => {
    if (activeStaff?.role !== 'owner') {
      Alert.alert('Owner Action Only', 'Only the property owner can reset PINs or manage staff access.');
      return;
    }

    if (staffId === activeStaff?.id) {
      Alert.alert('Notice', 'Use the lock screen or Switch Staff to manage your own session.');
      return;
    }

    Alert.alert(
      `Manage ${name}`,
      'Choose an action (requires owner PIN)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset PIN',
          onPress: () => {
            setTargetStaff({ id: staffId, name });
            setModalType('reset_pin');
            setModalInput('');
            setModalOwnerPin('');
            setModalVisible(true);
          }
        },
        {
          text: 'Change Role',
          onPress: () => {
            setTargetStaff({ id: staffId, name });
            setModalType('change_role');
            setModalInput('desk');
            setModalOwnerPin('');
            setModalVisible(true);
          }
        },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => {
            setTargetStaff({ id: staffId, name });
            setModalType('deactivate');
            setModalInput('');
            setModalOwnerPin('');
            setModalVisible(true);
          }
        }
      ]
    );
  };

  // Section 5: Modal confirmation with Owner Step-Up PIN
  const handleModalConfirm = async () => {
    if (!targetStaff) return;
    if (!modalOwnerPin.trim()) {
      return Alert.alert('Security', 'Your Owner PIN is required to authorize this action.');
    }

    if (modalType === 'reset_pin') {
      if (!modalInput || modalInput.length < 4) {
        Alert.alert('Invalid', 'New PIN must be at least 4 digits');
        return;
      }
      setModalSubmitting(true);
      const { error } = await supabase.rpc('reset_staff_pin', {
        p_prop: propertyId,
        p_actor: activeStaff?.id,
        p_target: targetStaff.id,
        p_new_pin: modalInput.trim(),
        p_owner_pin: modalOwnerPin.trim()
      });
      setModalSubmitting(false);
      if (error) return Alert.alert('Error', formatFriendlyError(error, 'Could not reset PIN.'));
      Alert.alert('Success', 'PIN has been reset.');
      setModalVisible(false);
      setModalInput('');
      setModalOwnerPin('');
    } else if (modalType === 'change_role') {
      const validRoles = ['owner', 'desk', 'housekeeping'];
      const targetRole = modalInput.toLowerCase().trim();
      if (!validRoles.includes(targetRole)) {
        Alert.alert('Invalid Role', 'Role must be: owner, desk, or housekeeping');
        return;
      }
      setModalSubmitting(true);
      const { error } = await supabase.rpc('update_staff_role', {
        p_prop: propertyId,
        p_actor: activeStaff?.id,
        p_target: targetStaff.id,
        p_new_role: targetRole,
        p_owner_pin: modalOwnerPin.trim()
      });
      setModalSubmitting(false);
      if (error) return Alert.alert('Error', formatFriendlyError(error, 'Could not update staff role.'));
      Alert.alert('Success', `Staff role updated to ${targetRole}.`);
      setModalVisible(false);
      setModalInput('');
      setModalOwnerPin('');
      fetchSettings();
    } else if (modalType === 'deactivate') {
      setModalSubmitting(true);
      const { error } = await supabase.rpc('deactivate_staff', {
        p_prop: propertyId,
        p_actor: activeStaff?.id,
        p_target: targetStaff.id,
        p_reason: modalInput.trim() || 'Deactivated by owner',
        p_owner_pin: modalOwnerPin.trim()
      });
      setModalSubmitting(false);
      if (error) return Alert.alert('Error', formatFriendlyError(error, 'Could not deactivate staff member.'));
      Alert.alert('Success', 'Staff member deactivated.');
      setModalVisible(false);
      setModalInput('');
      setModalOwnerPin('');
      fetchSettings();
    }
  };

  // Self-Service PIN Change for the currently active staff member
  const handleChangeMyPin = async () => {
    if (!activeStaff?.id) {
      return Alert.alert('Error', 'No active staff session found.');
    }
    if (!changePinCurrent || changePinCurrent.length < 4) {
      return Alert.alert('Invalid PIN', 'Please enter your current 4-digit PIN.');
    }
    if (!changePinNew || changePinNew.length < 4) {
      return Alert.alert('Invalid PIN', 'Your new PIN must be exactly 4 digits.');
    }
    if (changePinNew !== changePinConfirm) {
      return Alert.alert('Mismatch', 'New PIN and confirm PIN do not match.');
    }

    setChangePinSubmitting(true);
    try {
      const { error } = await supabase.rpc('change_my_pin', {
        p_staff_id: activeStaff.id,
        p_current_pin: changePinCurrent.trim(),
        p_new_pin: changePinNew.trim()
      });

      if (error) throw error;

      await saveLocalPinHash(activeStaff.id, changePinNew.trim());
      setChangePinSubmitting(false);
      setChangePinModalVisible(false);
      setChangePinCurrent('');
      setChangePinNew('');
      setChangePinConfirm('');
      Alert.alert('PIN Updated', 'Your desk security PIN has been updated successfully.');
    } catch (err: any) {
      setChangePinSubmitting(false);
      Alert.alert('Update Failed', formatFriendlyError(err, 'Could not change your PIN. Please try again.'));
    }
  };

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

      const headers = ['Guest Name', 'Phone', 'Nationality', 'Gender', 'ID Type', 'ID Last 4', 'Photo Path', 'Created At'];
      const rows = guestsData.map((g: any) => [
        csvCell(g.name),
        csvCell(g.phone || '', true),
        csvCell(g.nationality || ''),
        csvCell(g.gender || ''),
        csvCell(g.id_type || ''),
        csvCell(g.id_last4 || ''),
        csvCell(g.id_photo_path || ''),
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
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'LogStay Data Backup' });
      }
    } catch (error: any) {
      Alert.alert("Backup Error", error.message);
    }
  }

  // Section 3E: Switch staff button
  const handleSwitchStaff = async () => {
    try {
      if (activeStaff?.attendanceId) {
        if (await isOnline()) {
          await supabase.rpc('clock_out_staff', { p_attendance_id: activeStaff.attendanceId });
        } else {
          await saveToOutbox('clock_out', { attendance_id: activeStaff.attendanceId });
        }
      }
      await logoutStaff();
      router.replace("/staff-login");
    } catch (e) {
      console.error("Switch staff error", e);
      await logoutStaff();
      router.replace("/staff-login");
    }
  };

  // Section 3E: Sign out this phone with unsynced outbox guard
  const handleSignOutPhone = async () => {
    // 1. Guard against unsynced data
    const pendingCount = await getPendingCount();
    if (pendingCount > 0) {
      Alert.alert(
        "Unsynced Data Detected",
        `You have ${pendingCount} pending action${pendingCount > 1 ? 's' : ''} in the offline outbox.\n\nPlease connect to the internet and let LogStay sync before signing out, or unsynced records may be lost.`,
        [
          { text: "View Outbox", onPress: () => router.push('/outbox') },
          { text: "Dismiss", style: "cancel" }
        ]
      );
      return;
    }

    // 2. Confirmation dialog
    Alert.alert(
      "Sign Out This Phone",
      "Are you sure you want to sign out of this device? You will need your account email and password to log back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              if (activeStaff?.attendanceId) {
                if (await isOnline()) {
                  await supabase.rpc('clock_out_staff', { p_attendance_id: activeStaff.attendanceId });
                }
              }
              await logoutStaff();
              await supabase.auth.signOut();
              router.replace("/login");
            } catch (err: any) {
              Alert.alert("Sign Out Error", err.message);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Settings"
        subtitle="Property & Account Configuration"
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* SECTION 1: PROPERTY DETAILS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="business" size={17} color="#2563eb" />
            <Text style={styles.sectionHeader}>PROPERTY DETAILS</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Property Name</Text>
            <Text style={styles.detailValue}>{propertyDetails?.name || 'LogStay Hostel'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{propertyDetails?.type || 'Hostel'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>State</Text>
            <Text style={styles.detailValue}>{propertyDetails?.state || 'Goa'}</Text>
          </View>
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Property ID</Text>
            <Text style={[styles.detailValue, { fontSize: 11, color: '#64748b' }]}>{propertyId}</Text>
          </View>
        </View>

        {/* SECTION 2: TEAM & ACCESS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="people" size={17} color="#2563eb" />
            <Text style={styles.sectionHeader}>TEAM & ACCESS</Text>
          </View>
          <Text style={styles.helperSectionText}>
            {activeStaff?.role === 'owner'
              ? "Tap a team member to reset their PIN or deactivate their access."
              : "Active staff profiles registered for this property (management reserved for Owner)."}
          </Text>

          {staffList.filter(s => s.active).map((item) => (
            <Pressable
              key={item.id}
              style={styles.staffItem}
              onPress={() => activeStaff?.role === 'owner' ? handleManageStaff(item.id, item.name) : undefined}
            >
              <View style={styles.staffLeft}>
                <View style={styles.staffAvatar}>
                  <Text style={styles.staffAvatarText}>
                    {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.staffName}>{item.name}</Text>
                  <Text style={styles.helperSubText}>
                    {activeStaff?.role === 'owner' ? 'Tap to manage PIN / access ›' : `Role: ${item.role}`}
                  </Text>
                </View>
              </View>
              <View style={[styles.rolePill, item.role === 'owner' ? styles.roleOwner : styles.roleDesk]}>
                <Text style={styles.rolePillText}>{item.role.toUpperCase()}</Text>
              </View>
            </Pressable>
          ))}

          {staffList.filter(s => s.active).length === 0 && (
            <Text style={styles.emptyText}>No active staff profiles yet.</Text>
          )}

          {activeStaff?.role === 'owner' && (
            <>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={() => router.push('/add-staff')}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={16} color="#2563eb" />
                <Text style={styles.actionBtnPrimaryText}>Add Staff Member</Text>
              </TouchableOpacity>

              {/* Staff Invite Code Sub-card */}
              <View style={styles.inviteBox}>
                <Text style={styles.inviteBoxTitle}>Staff Join Code</Text>
                <Text style={styles.helperText}>
                  Generate a temporary 48-hour code for new staff to connect this property on their devices.
                </Text>
                <TouchableOpacity
                  style={styles.inviteBtn}
                  onPress={handleGenerateInvite}
                  disabled={generating}
                  activeOpacity={0.8}
                >
                  <Ionicons name="key-outline" size={16} color="#ffffff" />
                  <Text style={styles.inviteBtnText}>
                    {generating ? "Generating..." : (inviteCode ? "Generate Fresh Code" : "Generate Invite Code")}
                  </Text>
                </TouchableOpacity>
                {inviteCode && (
                  <View style={styles.inviteResult}>
                    <Text style={styles.inviteCodeText}>{inviteCode}</Text>
                    <Text style={styles.inviteValidText}>✓ Valid for 48 hours</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* SECTION 3: DATA & PRIVACY */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="shield-checkmark" size={17} color="#2563eb" />
            <Text style={styles.sectionHeader}>DATA & PRIVACY</Text>
          </View>
          <Text style={styles.helperText}>
            Audit trails, compliance registers, and secure data backups.
          </Text>

          {activeStaff?.role !== 'housekeeping' && (
            <TouchableOpacity style={styles.menuItem} onPress={downloadBackup} activeOpacity={0.7}>
              <View style={styles.menuIconBox}>
                <Ionicons name="download-outline" size={18} color="#2563eb" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuItemTitle}>Download Guest Backup (CSV)</Text>
                <Text style={styles.menuItemSubtitle}>Export encrypted CSV of registered guests</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}

          {activeStaff?.role === 'owner' && (
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/audit-log')} activeOpacity={0.7}>
              <View style={styles.menuIconBox}>
                <Ionicons name="newspaper-outline" size={18} color="#2563eb" />
              </View>
              <View style={styles.menuTextBox}>
                <Text style={styles.menuItemTitle}>Audit Trail</Text>
                <Text style={styles.menuItemSubtitle}>Review immutable log of property actions</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy')} activeOpacity={0.7}>
            <View style={styles.menuIconBox}>
              <Ionicons name="lock-closed-outline" size={18} color="#2563eb" />
            </View>
            <View style={styles.menuTextBox}>
              <Text style={styles.menuItemTitle}>Privacy & Data Retention Policy</Text>
              <Text style={styles.menuItemSubtitle}>6-month ID auto-purge and local encryption specs</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* SECTION 4: SUPPORT */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="help-buoy" size={17} color="#2563eb" />
            <Text style={styles.sectionHeader}>SUPPORT & HELP</Text>
          </View>
          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => Linking.openURL('mailto:support@logstay.in?subject=LogStay%20Pilot%20Support')}
            activeOpacity={0.8}
          >
            <Ionicons name="mail" size={18} color="#ffffff" />
            <Text style={styles.supportBtnText}>Email Pilot Support Desk</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Dedicated support for Goa pilot properties.</Text>
        </View>

        {/* SECTION 5: ACCOUNT & LOGOUT (Section 3E: At the bottom with space above) */}
        <View style={styles.accountSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="phone-portrait-outline" size={17} color="#475569" />
            <Text style={styles.accountHeader}>ACCOUNT & DEVICE</Text>
          </View>

          <View style={styles.accountInfoCard}>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Signed In As:</Text>
              <Text style={styles.accountValue}>{userEmail || 'Active Account'}</Text>
            </View>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Active Desk Staff:</Text>
              <Text style={styles.accountValue}>{activeStaff?.name || 'Unknown'} ({activeStaff?.role || 'Staff'})</Text>
            </View>
          </View>

          {/* Account Actions: Change My PIN, Switch Staff, Sign Out */}
          <View style={styles.accountBtnGroup}>
            <TouchableOpacity
              style={styles.changeMyPinBtn}
              onPress={() => {
                setChangePinCurrent('');
                setChangePinNew('');
                setChangePinConfirm('');
                setChangePinModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={16} color="#1d4ed8" />
              <Text style={styles.changeMyPinBtnText}>Change My Security PIN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchStaffBtn}
              onPress={handleSwitchStaff}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-closed-outline" size={16} color="#1e293b" />
              <Text style={styles.switchStaffBtnText}>Switch Staff (Lock Desk)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleSignOutPhone}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={16} color="#ef4444" />
              <Text style={styles.signOutBtnText}>Sign Out This Phone</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.signOutNote}>
            Sign out requires master password to re-enter. Blocked if offline actions are unsynced.
          </Text>
        </View>

      {/* Modal for Staff PIN Reset / Deactivate with Owner Step-Up PIN */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {modalType === 'reset_pin' 
                ? `Reset PIN for ${targetStaff?.name}` 
                : modalType === 'change_role'
                ? `Change Role for ${targetStaff?.name}`
                : `Deactivate ${targetStaff?.name}`}
            </Text>
            
            {modalType === 'change_role' ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.inputLabel}>Select New Role</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {(['desk', 'housekeeping', 'owner'] as const).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: modalInput === r ? '#eff6ff' : '#f8fafc',
                        borderWidth: 1.5,
                        borderColor: modalInput === r ? '#2563eb' : '#e2e8f0',
                        alignItems: 'center'
                      }}
                      onPress={() => setModalInput(r)}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: modalInput === r ? '#1d4ed8' : '#64748b',
                        textTransform: 'capitalize'
                      }}>
                        {r === 'desk' ? 'Front Desk' : r === 'housekeeping' ? 'Clean' : 'Co-Owner'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>
                  {modalType === 'reset_pin' ? 'New 4-Digit PIN for Staff' : 'Reason for Deactivation'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={modalInput}
                  onChangeText={setModalInput}
                  placeholder={modalType === 'reset_pin' ? 'e.g. 5678' : 'e.g. Resigned'}
                  keyboardType={modalType === 'reset_pin' ? 'numeric' : 'default'}
                  maxLength={modalType === 'reset_pin' ? 6 : 100}
                  secureTextEntry={modalType === 'reset_pin'}
                />
              </>
            )}

            <Text style={styles.inputLabel}>Your Owner PIN (To Authorize)</Text>
            <TextInput
              style={styles.modalInput}
              value={modalOwnerPin}
              onChangeText={setModalOwnerPin}
              placeholder="Enter Owner PIN"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => { setModalVisible(false); setModalInput(''); setModalOwnerPin(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, modalType === 'deactivate' ? styles.modalDangerBtn : styles.modalPrimaryBtn]}
                onPress={handleModalConfirm}
                disabled={modalSubmitting}
              >
                {modalSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {modalType === 'reset_pin' ? 'Save PIN' : modalType === 'change_role' ? 'Update Role' : 'Deactivate'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal for Self-Service PIN Change */}
      <Modal visible={changePinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Change My Security PIN</Text>
            
            <Text style={styles.inputLabel}>CURRENT 4-DIGIT PIN</Text>
            <TextInput
              style={[styles.modalInput, styles.pinInputModal]}
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              value={changePinCurrent}
              onChangeText={(t) => setChangePinCurrent(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <Text style={styles.inputLabel}>NEW 4-DIGIT PIN</Text>
            <TextInput
              style={[styles.modalInput, styles.pinInputModal]}
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              value={changePinNew}
              onChangeText={(t) => setChangePinNew(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <Text style={styles.inputLabel}>CONFIRM NEW 4-DIGIT PIN</Text>
            <TextInput
              style={[styles.modalInput, styles.pinInputModal]}
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              value={changePinConfirm}
              onChangeText={(t) => setChangePinConfirm(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setChangePinModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalPrimaryBtn]}
                onPress={handleChangeMyPin}
                disabled={changePinSubmitting}
              >
                {changePinSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Update PIN</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 16, paddingBottom: 60 },

  header: { paddingTop: 40, marginBottom: 16 },
  backBtn: { marginBottom: 6 },
  backText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "bold", color: "#0f172a" },

  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.8
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  detailLabel: { fontSize: 14, color: "#64748b" },
  detailValue: { fontSize: 14, fontWeight: "600", color: "#0f172a" },

  helperSectionText: { fontSize: 12, color: "#64748b", marginBottom: 12 },
  staffItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  staffLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  staffAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb'
  },
  staffName: { fontSize: 15, fontWeight: '700', color: "#0f172a" },
  helperSubText: { fontSize: 11, color: "#2563eb", marginTop: 2, fontWeight: '500' },
  rolePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  roleOwner: { backgroundColor: '#eff6ff' },
  roleDesk: { backgroundColor: '#f1f5f9' },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#1e40af' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginVertical: 12 },

  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  actionBtnPrimaryText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },

  inviteBox: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  inviteBoxTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  helperText: { fontSize: 12, color: '#64748b', lineHeight: 18 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 10
  },
  inviteBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  inviteResult: { alignItems: 'center', marginTop: 12, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 10 },
  inviteCodeText: { fontSize: 24, fontWeight: 'bold', color: '#16a34a', letterSpacing: 4 },
  inviteValidText: { fontSize: 11, color: '#15803d', marginTop: 4, fontWeight: '600' },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  menuTextBox: {
    flex: 1
  },
  menuItemTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  menuItemSubtitle: { fontSize: 12, color: '#64748b', marginTop: 1 },

  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 8
  },
  supportBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  // Section 3E: Account Section at bottom
  accountSection: {
    marginTop: 10,
    padding: 18,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  accountHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8
  },
  accountInfoCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  accountLabel: { fontSize: 13, color: '#64748b' },
  accountValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  accountBtnGroup: { gap: 10 },
  switchStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  switchStaffBtnText: { color: '#1e293b', fontWeight: '700', fontSize: 14 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ef4444'
  },
  signOutBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  signOutNote: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 16
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 11,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  modalBtn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10 },
  modalCancelBtn: { backgroundColor: '#f1f5f9' },
  modalCancelText: { color: '#64748b', fontWeight: '700' },
  modalPrimaryBtn: { backgroundColor: '#2563eb' },
  modalDangerBtn: { backgroundColor: '#dc2626' },
  modalConfirmText: { color: 'white', fontWeight: '700' },
  changeMyPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 4
  },
  changeMyPinBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 14 },
  pinInputModal: {
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'center'
  }
});