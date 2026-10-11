import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert, Button, Pressable, ScrollView, Linking, Platform, Modal, TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import { useStaff } from "../lib/staff-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { csvCell } from "../lib/csv";

export default function SettingsScreen() {
  const { activeStaff, can } = useStaff();
  const [propertyId, setPropertyId] = useState("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Modal state for Reset PIN & Deactivate (works on Android + iOS)
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'reset_pin' | 'deactivate' | null>(null);
  const [targetStaff, setTargetStaff] = useState<{ id: string; name: string } | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const handleGenerateInvite = async () => {
    setGenerating(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: member } = await supabase
      .from('members')
      .select('property_id')
      .eq('user_id', userData.user?.id)
      .single();

    if (member) {
      const { data, error } = await supabase.rpc('generate_invite_code', {
        p_prop: member.property_id,
        p_actor: activeStaff?.id
      });
      if (!error && data) {
        setInviteCode(data);
        Alert.alert('Invite Generated', `Code: ${data}\nExpires in 48 hours.`);
      } else {
        Alert.alert('Error', error?.message || 'Failed to generate code');
      }
    }
    setGenerating(false);
  };

  const fetchStaff = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member) return;

      const { data, error } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', member.property_id)
        .order('name', { ascending: true });

      if (!error && data) {
        setStaffList(data);
      }
    } catch (e) {
      console.error("Error loading staff profiles", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;
      setPropertyId(memberData.property_id);
    } catch (error) {
      console.error("Error fetching settings", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchStaff();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStaff();
    }, [])
  );

  const handleManageStaff = (staffId: string, name: string) => {
    if (staffId === activeStaff?.id) {
      Alert.alert('Notice', 'Use the lock screen to end your own shift.');
      return;
    }

    Alert.alert(
      `Manage ${name}`,
      'Choose an action',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset PIN', 
          onPress: () => promptResetPin(staffId, name) 
        },
        { 
          text: 'Deactivate', 
          style: 'destructive',
          onPress: () => promptDeactivate(staffId, name) 
        }
      ]
    );
  };

  const promptResetPin = (staffId: string, name: string) => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt(
        'New 4-Digit PIN',
        `Enter the new PIN for ${name}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: async (pin?: string) => {
              if (!pin || pin.length < 4) return Alert.alert('Invalid', 'PIN must be 4 digits');
              const { error } = await supabase.rpc('reset_staff_pin', {
                p_prop: propertyId,
                p_actor: activeStaff?.id,
                p_target: staffId,
                p_new_pin: pin
              });
              if (error) return Alert.alert('Error', error.message);
              Alert.alert('Success', 'PIN has been reset.');
            }
          }
        ],
        'plain-text',
        '',
        'number-pad'
      );
    } else {
      setTargetStaff({ id: staffId, name });
      setModalType('reset_pin');
      setModalInput('');
      setModalVisible(true);
    }
  };

  const promptDeactivate = (staffId: string, name: string) => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt(
        'Deactivate Staff',
        `Why are you deactivating ${name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async (reason?: string) => {
              const { error } = await supabase.rpc('deactivate_staff', {
                p_prop: propertyId,
                p_actor: activeStaff?.id,
                p_target: staffId,
                p_reason: reason || 'No reason provided'
              });
              if (error) return Alert.alert('Error', error.message);
              Alert.alert('Success', 'Staff member deactivated.');
              fetchStaff();
            }
          }
        ]
      );
    } else {
      setTargetStaff({ id: staffId, name });
      setModalType('deactivate');
      setModalInput('');
      setModalVisible(true);
    }
  };

  const handleModalConfirm = async () => {
    if (!targetStaff) return;

    if (modalType === 'reset_pin') {
      if (!modalInput || modalInput.length < 4) {
        Alert.alert('Invalid', 'PIN must be 4 digits');
        return;
      }
      setModalSubmitting(true);
      const { error } = await supabase.rpc('reset_staff_pin', {
        p_prop: propertyId,
        p_actor: activeStaff?.id,
        p_target: targetStaff.id,
        p_new_pin: modalInput
      });
      setModalSubmitting(false);
      if (error) return Alert.alert('Error', error.message);
      Alert.alert('Success', 'PIN has been reset.');
      setModalVisible(false);
      setModalInput('');
    } else if (modalType === 'deactivate') {
      setModalSubmitting(true);
      const { error } = await supabase.rpc('deactivate_staff', {
        p_prop: propertyId,
        p_actor: activeStaff?.id,
        p_target: targetStaff.id,
        p_reason: modalInput || 'No reason provided'
      });
      setModalSubmitting(false);
      if (error) return Alert.alert('Error', error.message);
      Alert.alert('Success', 'Staff member deactivated.');
      setModalVisible(false);
      setModalInput('');
      fetchStaff();
    }
  };

  async function downloadBackup() {
    Alert.alert("Generating Backup", "Please wait while we fetch all guest data...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("No property found.");
      
      // Fetch ALL guests for this property
      const { data: guestsData } = await supabase
        .from('guests')
        .select('*')
        .eq('property_id', memberData.property_id);

      if (!guestsData || guestsData.length === 0) {
        Alert.alert("No Data", "No guests to backup yet.");
        return;
      }

      // Convert to CSV with formula injection defense
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

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.title}>Property Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Staff Invite Code</Text>
        <Text style={styles.helperText}>Generate a secure 48-hour invite code for new staff members to join your property.</Text>
        
        <View style={{ marginTop: 16, width: '100%' }}>
          <Button 
            title={generating ? "Generating..." : (inviteCode ? "Generate New Code" : "Generate Invite Code")} 
            onPress={handleGenerateInvite} 
            color="#2563eb" 
            disabled={generating || !can('settings')}
          />
          {inviteCode && (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#2563eb', letterSpacing: 4 }}>
                {inviteCode}
              </Text>
              <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '600' }}>
                ✓ Valid for 48 hours
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Staff Profiles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team Members</Text>
        <Text style={styles.helperSectionText}>Tap or long-press a staff member to reset PIN or deactivate.</Text>
        
        {staffList.filter(s => s.active).map((item) => (
          <Pressable 
            key={item.id} 
            style={styles.staffItem}
            onPress={() => handleManageStaff(item.id, item.name)}
            onLongPress={() => handleManageStaff(item.id, item.name)}
          >
            <View>
              <Text style={styles.staffName}>{item.name}</Text>
              <Text style={styles.helperSubText}>Tap to manage</Text>
            </View>
            <Text style={styles.staffRole}>{item.role}</Text>
          </Pressable>
        ))}

        {staffList.filter(s => s.active).length === 0 && (
          <Text style={styles.emptyText}>No active staff profiles yet.</Text>
        )}

        <Pressable style={styles.addBtn} onPress={() => router.push('/add-staff')}>
          <Text style={styles.addBtnText}>+ Add Staff Member</Text>
        </Pressable>
      </View>

      <View style={styles.backupCard}>
        <View style={[styles.backupCard, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", marginTop: 0 }]}>
          <Text style={[styles.backupTitle, { color: "#065f46" }]}>Need Help?</Text>
          <Text style={styles.backupText}>Facing an issue? Contact LogStay support directly on WhatsApp.</Text>
          <Button 
            title="Chat with Support" 
            onPress={() => Linking.openURL('https://wa.me/919999999999')}
            color="#059669" 
          />
        </View>
        <Text style={[styles.backupTitle, { marginTop: 15 }]}>Data Safety</Text>
        <Text style={styles.backupText}>Download a CSV backup of all guests. Save it to Google Drive or send it to your email in case your phone is lost.</Text>
        <Button title="Download Guest Backup (CSV)" onPress={downloadBackup} color="#2563eb" />
      </View>

      <Pressable style={styles.addBtn} onPress={() => router.push('/privacy')}>
        <Text style={styles.addBtnText}>Privacy & Data Policy</Text>
      </Pressable>

      {can('settings') && (
        <Pressable style={styles.addBtn} onPress={() => router.push('/audit-log')}>
          <Text style={styles.addBtnText}>View Audit Trail</Text>
        </Pressable>
      )}

      {/* Cross-platform Management Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {modalType === 'reset_pin' ? `Reset PIN for ${targetStaff?.name}` : `Deactivate ${targetStaff?.name}`}
            </Text>
            <Text style={styles.modalDesc}>
              {modalType === 'reset_pin' 
                ? 'Enter a new 4-digit PIN for this staff member:' 
                : 'Why are you deactivating this staff member?'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={modalInput}
              onChangeText={setModalInput}
              placeholder={modalType === 'reset_pin' ? '1234' : 'Reason (e.g. Resigned)'}
              keyboardType={modalType === 'reset_pin' ? 'numeric' : 'default'}
              maxLength={modalType === 'reset_pin' ? 4 : undefined}
              secureTextEntry={modalType === 'reset_pin'}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <Pressable 
                style={[styles.modalBtn, styles.modalCancelBtn]} 
                onPress={() => { setModalVisible(false); setModalInput(''); }}
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
                    {modalType === 'reset_pin' ? 'Save PIN' : 'Deactivate'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6", paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  card: { backgroundColor: "white", padding: 20, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 10 },
  codeText: { fontSize: 20, fontWeight: "bold", color: "#2563eb", marginBottom: 10, textAlign: "center" },
  helperText: { fontSize: 12, color: "#9ca3af", textAlign: "center" },
  helperSectionText: { fontSize: 12, color: "#64748b", marginBottom: 12 },
  helperSubText: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  section: { backgroundColor: "white", padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4, color: "#1f2937" },
  staffItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  staffName: { fontSize: 16, fontWeight: '500', color: "#1f2937" },
  staffRole: { color: '#64748b', textTransform: 'capitalize' },
  addBtn: { backgroundColor: '#eff6ff', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  addBtnText: { color: '#2563eb', fontWeight: 'bold' },
  memberCard: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", justifyContent: "space-between" },
  memberRole: { fontWeight: "bold", color: "#059669" },
  memberId: { color: "#6b7280", fontSize: 12 },
  emptyText: { textAlign: "center", color: "#9ca3af", marginVertical: 10 },
  backupCard: { backgroundColor: "#eff6ff", padding: 20, borderRadius: 8, borderWidth: 1, borderColor: "#bfdbfe" },
  backupTitle: { fontSize: 18, fontWeight: "bold", color: "#1e40af", marginBottom: 5 },
  backupText: { fontSize: 14, color: "#374151", marginBottom: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '100%', maxWidth: 360, backgroundColor: 'white', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20, backgroundColor: '#f8fafc' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalCancelBtn: { backgroundColor: '#f1f5f9' },
  modalCancelText: { color: '#64748b', fontWeight: '600' },
  modalPrimaryBtn: { backgroundColor: '#2563eb' },
  modalDangerBtn: { backgroundColor: '#dc2626' },
  modalConfirmText: { color: 'white', fontWeight: 'bold' }
});