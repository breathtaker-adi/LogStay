// src/app/add-staff.tsx
// Add Staff & Member Code Generator — Apple HIG Screen
// Features: Select position according to hierarchy -> generate join code (NO PINs).

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Share
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ScreenHeader } from '@/lib/screen-header';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { useTheme } from '@/hooks/use-theme';

import { TeamService } from '@/services';
import { StaffRole } from '@/types';

export default function AddStaffScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const isOwner = activeStaff?.role === 'owner';
  const isCoAdmin = activeStaff?.role === 'co_admin';
  const isDesk = activeStaff?.role === 'desk';
  const canManage = isOwner || isCoAdmin;

  // Role hierarchy:
  // Owner & Co-Admin can add: co_admin, desk, housekeeping
  // Front Desk can add ONLY: housekeeping
  const allowedRoles: { id: StaffRole; label: string; desc: string; icon: string }[] = canManage
    ? [
        { id: 'desk', label: 'Front Desk', desc: 'Check-in, check-out, bookings & folios', icon: 'desktop-outline' },
        { id: 'co_admin', label: 'Co-Admin', desc: 'Full property & operations access', icon: 'shield-checkmark-outline' },
        { id: 'housekeeping', label: 'Housekeeper', desc: 'Room cleaning & maintenance updates', icon: 'bed-outline' },
      ]
    : isDesk
    ? [
        { id: 'housekeeping', label: 'Housekeeper', desc: 'Room cleaning & maintenance updates', icon: 'bed-outline' },
      ]
    : [];

  const [role, setRole] = useState<StaffRole>(canManage ? 'desk' : 'housekeeping');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Pre-add direct name (optional)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingDirect, setSavingDirect] = useState(false);

  const formatRoleLabel = (r: StaffRole | string) => {
    switch (r) {
      case 'co_admin': return 'Co-Admin';
      case 'desk': return 'Front Desk';
      case 'housekeeping': return 'Housekeeper';
      default: return r;
    }
  };

  // Generate 48h Join Code for chosen position
  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member?.property_id) throw new Error('No property found');

      const { data: code, error } = await supabase.rpc('generate_invite_code', {
        p_prop: member.property_id,
        p_actor: activeStaff?.id || null,
        p_role: role
      });

      if (error) throw error;

      setInviteCode(code);
      Alert.alert(
        'Code Generated',
        `Join code for ${formatRoleLabel(role)}: ${code}\nValid for 48 hours.`
      );
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not generate code.');
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!inviteCode) return;
    const directLink = TeamService.getDirectJoinLink(inviteCode);
    const roleName = formatRoleLabel(role);
    try {
      await Share.share({
        title: `Join LogStay Property Team as ${roleName}`,
        message: `Connect directly to our LogStay property team as ${roleName}:\n${directLink}\n\nPass Code: ${inviteCode}\n(Valid for 48 hours • Instant direct authorization)`,
        url: directLink
      });
    } catch (e) {
      console.error('Share error', e);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteCode) return;
    const directLink = TeamService.getDirectJoinLink(inviteCode);
    await Clipboard.setStringAsync(directLink);
    Alert.alert('Link Copied', `Direct connection link copied to clipboard:\n${directLink}`);
  };

  // Direct profile pre-registration (without code)
  const handleDirectSave = async () => {
    if (!name.trim()) {
      return Alert.alert('Missing Name', 'Please enter the staff member’s full name.');
    }
    const cleanedPhone = phone.replace(/[^0-9+]/g, '').trim();

    setSavingDirect(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member?.property_id) throw new Error('No property found');

      const { error: insertError } = await supabase
        .from('staff_profiles')
        .insert({
          property_id: member.property_id,
          name: name.trim(),
          phone: cleanedPhone || null,
          role: role,
          active: true,
          pin_hash: '',
        });

      if (insertError) throw insertError;

      Alert.alert(
        'Profile Created',
        `${name.trim()} has been registered as ${formatRoleLabel(role)}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save staff profile.');
    } finally {
      setSavingDirect(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <ScreenHeader
        title="Add Team Member"
        subtitle="Role selection & join code generator"
        showBack={true}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Step 1: Select Position Card */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          1. SELECT POSITION
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardHelp, { color: theme.textSecondary }]}>
            {canManage
              ? 'Choose which role to grant to this team member:'
              : 'Front desk members can add Housekeepers to the property:'}
          </Text>

          <View style={styles.roleList}>
            {allowedRoles.map((r) => {
              const isSelected = role === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.roleRow,
                    { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSubtle },
                    isSelected && { backgroundColor: theme.accentSubtle, borderColor: theme.accent }
                  ]}
                  onPress={() => setRole(r.id)}
                  activeOpacity={0.8}
                >
                  <View style={[
                    styles.roleIconBox,
                    { backgroundColor: isSelected ? theme.accent : theme.surface }
                  ]}>
                    <Ionicons
                      name={r.icon as any}
                      size={20}
                      color={isSelected ? '#ffffff' : theme.text}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleTitle, { color: theme.text }]}>{r.label}</Text>
                    <Text style={[styles.roleDesc, { color: theme.textSecondary }]}>{r.desc}</Text>
                  </View>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? theme.accent : theme.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Step 2: Generate Join Code */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 20 }]}>
          2. GENERATE JOIN CODE (RECOMMENDED)
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardHelp, { color: theme.textSecondary }]}>
            Generate a pass code. When your team member enters it on their phone, they are instantly added as {formatRoleLabel(role)} and redirected directly to the home screen.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={handleGenerateCode}
            disabled={generating}
            activeOpacity={0.8}
          >
            {generating ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="key-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryBtnText}>
                  Generate Code for {formatRoleLabel(role)}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {inviteCode && (
            <View style={[styles.codeDisplayCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <View style={styles.codeResultTopRow}>
                <View style={[styles.roleTagPill, { backgroundColor: theme.accentSubtle }]}>
                  <Text style={[styles.roleTagText, { color: theme.accent }]}>
                    {formatRoleLabel(role).toUpperCase()} PASS
                  </Text>
                </View>
                <Text style={[styles.validityBadge, { color: theme.textTertiary }]}>48h Expiry</Text>
              </View>

              <Text style={[styles.codeText, { color: theme.text }]}>{inviteCode}</Text>

              <Text style={[styles.codeHelp, { color: theme.textSecondary }]}>
                Recipient connects instantly to the Home Screen • No PIN setup required.
              </Text>

              <View style={styles.codeActionRow}>
                <TouchableOpacity
                  style={[styles.codeActionPill, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={handleCopyLink}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={15} color={theme.text} />
                  <Text style={[styles.codeActionText, { color: theme.text }]}>Copy Link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.codeActionPillPrimary, { backgroundColor: theme.accent }]}
                  onPress={handleShare}
                  activeOpacity={0.8}
                >
                  <Ionicons name="share-social-outline" size={15} color="#ffffff" />
                  <Text style={styles.codeActionTextPrimary}>Share Direct Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Step 3: Or Pre-Register Profile */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 20 }]}>
          OR PRE-REGISTER BY NAME
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>FULL NAME</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
            <Ionicons name="person-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Rahul Verma"
              placeholderTextColor={theme.textTertiary}
            />
          </View>

          <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>PHONE NUMBER (OPTIONAL)</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
            <Ionicons name="call-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, '').slice(0, 15))}
              placeholder="e.g. 9876543210"
              placeholderTextColor={theme.textTertiary}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: theme.accent }]}
            onPress={handleDirectSave}
            disabled={savingDirect}
            activeOpacity={0.8}
          >
            {savingDirect ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
                Pre-Register Profile (No PIN)
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  cardHelp: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  roleList: { gap: 10 },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  roleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleTitle: { fontSize: 15, fontWeight: '700' },
  roleDesc: { fontSize: 12, marginTop: 2 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    marginTop: 4,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  codeDisplayCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  codeResultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  roleTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  validityBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeText: { fontSize: 32, fontWeight: '800', letterSpacing: 4, marginVertical: 6 },
  codeHelp: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginBottom: 14 },
  codeActionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  codeActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  codeActionPillPrimary: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
  },
  codeActionTextPrimary: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  secondaryBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
});
