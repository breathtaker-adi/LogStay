// src/app/setup-property.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { ScreenHeader } from '@/lib/screen-header';
import { PropertyService } from '@/services';
import { formatFriendlyError } from '@/lib/error-utils';

const PROPERTY_TYPES = ['Hostel', 'Hotel', 'Guest House', 'Resort', 'Homestay'];

export default function SetupPropertyScreen() {
  const { setActiveStaff } = useStaff();
  const searchParams = useLocalSearchParams<{ code?: string }>();
  const [isOwner, setIsOwner] = useState(true);
  
  // Owner state
  const [ownerName, setOwnerName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [type, setType] = useState('Hostel');
  const [state, setState] = useState('');
  
  // Staff join state
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-fill code from direct invitation link if present
  useEffect(() => {
    if (searchParams?.code && typeof searchParams.code === 'string') {
      const cleanCode = searchParams.code.trim().toUpperCase();
      setPropertyId(cleanCode);
      setIsOwner(false);
    }
  }, [searchParams?.code]);

  const toggleMode = (ownerMode: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOwner(ownerMode);
  };

  async function saveData() {
    setLoading(true);

    try {
      if (isOwner) {
        // OWNER FLOW: Create Property
        if (!ownerName.trim()) {
          Alert.alert('Missing Details', 'Please enter your Full Name.');
          setLoading(false);
          return;
        }

        if (!propertyName.trim() || !state.trim()) {
          Alert.alert('Missing Details', 'Please enter your Property Name and State.');
          setLoading(false);
          return;
        }

        let createdPropId: string | null = null;
        try {
          createdPropId = await PropertyService.createProperty(
            propertyName.trim(),
            type,
            state.trim(),
            ownerName.trim()
          );
        } catch (propError: any) {
          if (propError?.message?.includes('arguments')) {
            // Legacy signature fallback
            const { data: fallbackId, error: fbError } = await supabase.rpc('create_property', {
              p_name: propertyName.trim(),
              p_type: type,
              p_state: state.trim(),
              p_pin: '0000',
            });
            if (fbError) throw fbError;
            createdPropId = fallbackId;
          } else {
            throw propError;
          }
        }

        // Fetch owner staff profile and link active session
        if (createdPropId) {
          await supabase
            .from('staff_profiles')
            .update({ name: ownerName.trim(), pin_hash: '' })
            .eq('property_id', createdPropId)
            .eq('role', 'owner');

          const { data: staffData } = await supabase
            .from('staff_profiles_safe')
            .select('*')
            .eq('property_id', createdPropId)
            .eq('role', 'owner')
            .limit(1);

          const ownerProf = staffData?.[0];
          await setActiveStaff({
            id: ownerProf?.id || createdPropId,
            name: ownerName.trim(),
            role: 'owner',
            attendanceId: null,
          });
        }

        Alert.alert('Success', `Property "${propertyName.trim()}" created! Welcome, ${ownerName.trim()}.`);
        router.replace('/home');
        return;
      } else {
        // STAFF FLOW: Join Property with Code
        if (!staffName.trim()) {
          Alert.alert('Missing Name', 'Please enter your full name for your staff profile.');
          setLoading(false);
          return;
        }

        const cleanedPhone = staffPhone.trim();
        if (!cleanedPhone || cleanedPhone.replace(/[^0-9]/g, '').length < 7) {
          Alert.alert('Missing Phone Number', 'Please enter a valid phone number (at least 7 digits) for your staff profile.');
          setLoading(false);
          return;
        }

        if (!propertyId.trim()) {
          Alert.alert('Missing Code', 'Please enter the Member Invite Code given to you by your property.');
          setLoading(false);
          return;
        }

        // Try atomic join_property_with_invite RPC with phone
        const { data: joinData, error: joinRpcError } = await supabase.rpc('join_property_with_invite', {
          p_code: propertyId.trim().toUpperCase(),
          p_name: staffName.trim(),
          p_phone: cleanedPhone
        });

        if (!joinRpcError && joinData) {
          await setActiveStaff({
            id: joinData.staff_id,
            name: joinData.name,
            role: joinData.role,
            attendanceId: null,
          });

          Alert.alert(
            'Joined Successfully',
            `Welcome to ${joinData.property_name || 'the property'}! You are signed in as ${joinData.role === 'desk' ? 'Front Desk' : joinData.role === 'housekeeping' ? 'Housekeeper' : joinData.role}.`
          );
          router.replace('/home');
          return;
        }

        // Fallback: join_property + staff_profiles insert
        const { data: fallbackPropId, error: joinError } = await supabase.rpc('join_property', {
          p_code: propertyId.trim().toUpperCase()
        });

        if (joinError) throw joinError;
        if (!fallbackPropId) throw new Error('Invalid or expired invite code.');

        const { data: userData } = await supabase.auth.getUser();
        const { data: newProfile, error: profError } = await supabase
          .from('staff_profiles')
          .insert({
            property_id: fallbackPropId,
            user_id: userData.user?.id,
            name: staffName.trim(),
            phone: cleanedPhone,
            role: 'desk',
            pin_hash: '',
            active: true
          })
          .select()
          .single();

        if (profError) throw profError;

        await setActiveStaff({
          id: newProfile.id,
          name: newProfile.name,
          role: newProfile.role,
          attendanceId: null,
        });

        Alert.alert('Joined Successfully', `Welcome! You have joined as Front Desk.`);
        router.replace('/home');
        return;
      }
    } catch (error: any) {
      Alert.alert('Setup Failed', formatFriendlyError(error, 'Could not complete property setup.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <ScreenHeader
        title="Setup Account"
        subtitle={isOwner ? "Register your property" : "Join existing property team"}
        onBack={() => router.replace('/login')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Mode Selector Segmented Tab */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, isOwner && styles.segmentBtnActive]}
            onPress={() => toggleMode(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="business"
              size={18}
              color={isOwner ? '#0f172a' : '#64748b'}
            />
            <Text style={[styles.segmentText, isOwner && styles.segmentTextActive]}>
              I am an Owner
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, !isOwner && styles.segmentBtnActive]}
            onPress={() => toggleMode(false)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={18}
              color={!isOwner ? '#0f172a' : '#64748b'}
            />
            <Text style={[styles.segmentText, !isOwner && styles.segmentTextActive]}>
              I am Staff
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          {isOwner ? (
            <>
              {/* Owner Full Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>YOUR FULL NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Harsh Vardhan"
                    placeholderTextColor="#94a3b8"
                    value={ownerName}
                    onChangeText={setOwnerName}
                  />
                </View>
              </View>

              {/* Property Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PROPERTY NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="home-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Zostel Rishikesh, Blue Beds"
                    placeholderTextColor="#94a3b8"
                    value={propertyName}
                    onChangeText={setPropertyName}
                  />
                </View>
              </View>

              {/* Property Type Chips */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PROPERTY TYPE</Text>
                <View style={styles.chipRow}>
                  {PROPERTY_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, type === t && styles.typeChipActive]}
                      onPress={() => setType(t)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* State / Province */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>STATE / REGION</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="location-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Goa, Rajasthan, Himachal Pradesh"
                    placeholderTextColor="#94a3b8"
                    value={state}
                    onChangeText={setState}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Staff Joining Header Badge */}
              <View style={styles.staffHeaderBadge}>
                <Ionicons name="shield-checkmark" size={16} color="#2563eb" />
                <Text style={styles.staffHeaderBadgeText}>DIRECT PROPERTY ONBOARDING</Text>
              </View>

              {/* Staff Full Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>YOUR FULL NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Ramesh Kumar"
                    placeholderTextColor="#94a3b8"
                    value={staffName}
                    onChangeText={setStaffName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Staff Phone Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PHONE NUMBER</Text>
                <Text style={styles.helperText}>
                  Used for account verification and past performance history.
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. +91 98765 43210"
                    placeholderTextColor="#94a3b8"
                    value={staffPhone}
                    onChangeText={setStaffPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Staff Invite Code */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>MEMBER JOIN CODE</Text>
                <Text style={styles.helperText}>
                  Enter the 6-character code or open the direct link shared by your property manager.
                </Text>
                <View style={[styles.inputWrapper, styles.codeInputWrapper]}>
                  <Ionicons name="key-outline" size={20} color="#2563eb" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, styles.codeInputText]}
                    placeholder="e.g. 7K9X2A"
                    placeholderTextColor="#94a3b8"
                    value={propertyId}
                    onChangeText={setPropertyId}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={10}
                  />
                </View>
              </View>
            </>
          )}

          {/* Submit Action */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={saveData}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.submitBtnContent}>
                <Text style={styles.submitBtnText}>
                  {isOwner ? "Create Property" : "Join Property Team"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Option at enter code page for staff to check their past remarks ledger */}
          {!isOwner && (
            <TouchableOpacity
              style={styles.remarksOptionCard}
              onPress={() => router.push({
                pathname: '/my-remarks',
                params: {
                  phone: staffPhone.trim() || undefined,
                  code: propertyId.trim() || undefined
                }
              })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Check past remarks ledger"
            >
              <View style={styles.remarksOptionIconBox}>
                <Ionicons name="newspaper-outline" size={18} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.remarksOptionTitle}>Check Past Remarks Ledger</Text>
                <Text style={styles.remarksOptionSub}>
                  Previously disconnected from a property? View official remarks left by previous owners.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Security badge */}
        <View style={styles.securityFooter}>
          <Ionicons name="shield-checkmark-outline" size={15} color="#94a3b8" />
          <Text style={styles.securityText}>AES-256 Encrypted Local Desk Storage</Text>
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
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40
  },

  // Segmented Tab
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    padding: 4,
    borderRadius: 16,
    marginBottom: 20
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b'
  },
  segmentTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  },

  // Form Card
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
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
    marginBottom: 10,
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
  codeInputWrapper: {
    borderColor: '#93c5fd',
    backgroundColor: '#f0f7ff',
  },
  codeInputText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#1d4ed8',
  },
  staffHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 16,
  },
  staffHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  typeChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb'
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },
  typeChipTextActive: {
    color: '#2563eb',
    fontWeight: '700'
  },

  // Submit Button
  submitBtn: {
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
  submitBtnDisabled: {
    backgroundColor: '#94a3b8'
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff'
  },
  remarksOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  remarksOptionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remarksOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  remarksOptionSub: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },

  // Security Footer
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24
  },
  securityText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500'
  }
});