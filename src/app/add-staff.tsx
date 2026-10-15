// src/app/add-staff.tsx
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
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/lib/screen-header';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';

export default function AddStaffScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'desk' | 'housekeeping'>('desk');
  const [pin, setPin] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { activeStaff } = useStaff();

  const handleSave = async () => {
    if (!name.trim()) {
      return Alert.alert('Missing Name', 'Please enter the staff member’s full name.');
    }
    if (pin.length < 4) {
      return Alert.alert('Invalid PIN', 'Staff PIN must be exactly 4 digits.');
    }
    if (activeStaff?.role === 'owner' && !ownerPin.trim()) {
      return Alert.alert('Owner PIN Required', 'Please enter your Owner PIN to authorize adding this team member.');
    }

    setLoading(true);

    try {
      // 1. Get current user's property_id
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member) throw new Error('No property found for this user');

      // 2. Call owner_add_staff RPC with step-up PIN
      const { error: insertError } = await supabase.rpc('owner_add_staff', {
        p_prop: member.property_id,
        p_actor: activeStaff?.id || null, // null if creating the very first owner
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_role: role,
        p_pin: pin.trim(),
        p_owner_pin: ownerPin.trim() || null
      });

      if (insertError) throw insertError;

      Alert.alert('Staff Profile Created', `${name.trim()} has been registered with ${role} privileges.`);
      router.back();

    } catch (error: any) {
      Alert.alert('Failed to Add Staff', error.message || 'An error occurred while saving.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Add Team Member"
        subtitle="Staff profile & shift security PIN"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formCard}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PHONE NUMBER (OPTIONAL)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Role Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ASSIGNED ROLE</Text>
            <View style={styles.roleGrid}>
              {/* Desk */}
              <TouchableOpacity
                style={[styles.roleCard, role === 'desk' && styles.roleCardActive]}
                onPress={() => setRole('desk')}
                activeOpacity={0.75}
              >
                <View style={[styles.roleIconCircle, role === 'desk' && styles.roleIconCircleActive]}>
                  <Ionicons name="desktop-outline" size={18} color={role === 'desk' ? '#1d4ed8' : '#64748b'} />
                </View>
                <Text style={[styles.roleTitle, role === 'desk' && styles.roleTitleActive]}>Front Desk</Text>
                <Text style={styles.roleSub}>Check-ins, shifts, folio</Text>
              </TouchableOpacity>

              {/* Housekeeping */}
              <TouchableOpacity
                style={[styles.roleCard, role === 'housekeeping' && styles.roleCardActive]}
                onPress={() => setRole('housekeeping')}
                activeOpacity={0.75}
              >
                <View style={[styles.roleIconCircle, role === 'housekeeping' && styles.roleIconCircleActive]}>
                  <Ionicons name="sparkles-outline" size={18} color={role === 'housekeeping' ? '#7e22ce' : '#64748b'} />
                </View>
                <Text style={[styles.roleTitle, role === 'housekeeping' && styles.roleTitleActive]}>Housekeeping</Text>
                <Text style={styles.roleSub}>Cleaning, room status</Text>
              </TouchableOpacity>

              {/* Owner */}
              <TouchableOpacity
                style={[styles.roleCard, role === 'owner' && styles.roleCardActive]}
                onPress={() => setRole('owner')}
                activeOpacity={0.75}
              >
                <View style={[styles.roleIconCircle, role === 'owner' && styles.roleIconCircleActive]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={role === 'owner' ? '#b45309' : '#64748b'} />
                </View>
                <Text style={[styles.roleTitle, role === 'owner' && styles.roleTitleActive]}>Co-Owner</Text>
                <Text style={styles.roleSub}>Full administrative access</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Staff 4-Digit PIN */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>4-DIGIT PIN FOR STAFF MEMBER</Text>
            <Text style={styles.helperText}>Used by the staff member to clock in and access their profile.</Text>
            <View style={[styles.inputWrapper, styles.pinWrapper]}>
              <Ionicons name="key-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, styles.pinText]}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="••••"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
              />
            </View>
          </View>

          {/* Owner Step-Up PIN (if activeStaff is owner) */}
          {activeStaff?.role === 'owner' && (
            <View style={[styles.inputGroup, styles.ownerAuthBox]}>
              <View style={styles.ownerAuthHeader}>
                <Ionicons name="shield-checkmark" size={16} color="#d97706" />
                <Text style={styles.ownerAuthTitle}>OWNER AUTHORIZATION REQUIRED</Text>
              </View>
              <Text style={styles.helperText}>Enter your Owner PIN to authorize adding this team member.</Text>
              <View style={[styles.inputWrapper, styles.pinWrapper, { backgroundColor: '#ffffff', borderColor: '#fef08a' }]}>
                <Ionicons name="lock-closed" size={18} color="#d97706" style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, styles.pinText]}
                  value={ownerPin}
                  onChangeText={(t) => setOwnerPin(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="Owner PIN"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
              </View>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.saveBtnContent}>
                <Text style={styles.saveBtnText}>Save Team Member</Text>
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  inputGroup: {
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.6,
    marginBottom: 8
  },
  helperText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
    lineHeight: 16
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52
  },
  inputIcon: {
    marginRight: 10
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500'
  },

  // Role Grid
  roleGrid: {
    flexDirection: 'row',
    gap: 8
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  roleCardActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb'
  },
  roleIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  roleIconCircleActive: {
    backgroundColor: '#dbeafe'
  },
  roleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
    textAlign: 'center'
  },
  roleTitleActive: {
    color: '#1d4ed8'
  },
  roleSub: {
    fontSize: 9.5,
    color: '#94a3b8',
    textAlign: 'center'
  },

  // PIN
  pinWrapper: {
    width: '100%'
  },
  pinText: {
    fontSize: 18,
    letterSpacing: 4
  },

  // Owner Auth Box
  ownerAuthBox: {
    backgroundColor: '#fffbeb',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fef08a'
  },
  ownerAuthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4
  },
  ownerAuthTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    letterSpacing: 0.5
  },

  // Save Button
  saveBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3
  },
  saveBtnDisabled: {
    backgroundColor: '#94a3b8'
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff'
  }
});
