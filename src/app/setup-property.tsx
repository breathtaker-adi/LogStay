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
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

const PROPERTY_TYPES = ['Hostel', 'Hotel', 'Guest House', 'Resort', 'Homestay'];

export default function SetupPropertyScreen() {
  const theme = useTheme();
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
          const { data: staffData } = await supabase
            .from('staff_profiles_safe')
            .select('id, name, role')
            .eq('property_id', createdPropId)
            .eq('role', 'owner')
            .limit(1);

          const ownerProf = staffData?.[0];
          if (ownerProf?.id && ownerProf.name !== ownerName.trim()) {
            await supabase.rpc('update_staff_name', {
              p_staff_id: ownerProf.id,
              p_name: ownerName.trim(),
            });
          }

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

        // Atomic invite redemption + staff profile creation (RPC handles role & security)
        const { data: joinData, error: joinRpcError } = await supabase.rpc('join_property_with_invite', {
          p_code: propertyId.trim().toUpperCase(),
          p_name: staffName.trim(),
          p_phone: cleanedPhone
        });

        if (joinRpcError) throw joinRpcError;
        if (!joinData) throw new Error('Invalid or expired invite code.');

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
    } catch (error: any) {
      Alert.alert('Setup Failed', formatFriendlyError(error, 'Could not complete property setup.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
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
        <View style={[styles.segmentContainer, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.segmentBtn, isOwner && [styles.segmentBtnActive, { backgroundColor: theme.surface }]]}
            onPress={() => toggleMode(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="business"
              size={18}
              color={isOwner ? theme.accentText : theme.textSecondary}
            />
            <Text style={[styles.segmentText, { color: theme.textSecondary }, isOwner && [styles.segmentTextActive, { color: theme.text }]]}>
              I am an Owner
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, !isOwner && [styles.segmentBtnActive, { backgroundColor: theme.surface }]]}
            onPress={() => toggleMode(false)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={18}
              color={!isOwner ? theme.accentText : theme.textSecondary}
            />
            <Text style={[styles.segmentText, { color: theme.textSecondary }, !isOwner && [styles.segmentTextActive, { color: theme.text }]]}>
              I am Staff
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Card */}
        <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {isOwner ? (
            <>
              {/* Owner Full Name */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>YOUR FULL NAME</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="person-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="e.g. Harsh Vardhan"
                    placeholderTextColor={theme.textTertiary}
                    value={ownerName}
                    onChangeText={setOwnerName}
                  />
                </View>
              </View>

              {/* Property Name */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PROPERTY NAME</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="home-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="e.g. Zostel Rishikesh, Blue Beds"
                    placeholderTextColor={theme.textTertiary}
                    value={propertyName}
                    onChangeText={setPropertyName}
                  />
                </View>
              </View>

              {/* Property Type Chips */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PROPERTY TYPE</Text>
                <View style={styles.chipRow}>
                  {PROPERTY_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeChip,
                        { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                        type === t && [styles.typeChipActive, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]
                      ]}
                      onPress={() => setType(t)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          { color: theme.textSecondary },
                          type === t && [styles.typeChipTextActive, { color: theme.accentText }]
                        ]}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* State / Province */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>STATE / REGION</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="location-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="e.g. Goa, Rajasthan, Himachal Pradesh"
                    placeholderTextColor={theme.textTertiary}
                    value={state}
                    onChangeText={setState}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Staff Joining Header Badge */}
              <View style={[styles.staffHeaderBadge, { backgroundColor: theme.accentSubtle }]}>
                <Ionicons name="shield-checkmark" size={16} color={theme.accentText} />
                <Text style={[styles.staffHeaderBadgeText, { color: theme.accentText }]}>DIRECT PROPERTY ONBOARDING</Text>
              </View>

              {/* Staff Full Name */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>YOUR FULL NAME</Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="person-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="e.g. Ramesh Kumar"
                    placeholderTextColor={theme.textTertiary}
                    value={staffName}
                    onChangeText={setStaffName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Staff Phone Number */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PHONE NUMBER</Text>
                <Text style={[styles.helperText, { color: theme.textTertiary }]}>
                  Used for account verification and past performance history.
                </Text>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="call-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="e.g. +91 98765 43210"
                    placeholderTextColor={theme.textTertiary}
                    value={staffPhone}
                    onChangeText={setStaffPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Staff Invite Code */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>MEMBER JOIN CODE</Text>
                <Text style={[styles.helperText, { color: theme.textTertiary }]}>
                  Enter the 6-character code or open the direct link shared by your property manager.
                </Text>
                <View style={[styles.inputWrapper, styles.codeInputWrapper, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
                  <Ionicons name="key-outline" size={20} color={theme.accentText} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, styles.codeInputText, { color: theme.accentText }]}
                    placeholder="e.g. 7K9X2A"
                    placeholderTextColor={theme.textTertiary}
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
            style={[
              styles.submitBtn,
              { backgroundColor: theme.accent, shadowColor: theme.accent },
              loading && { backgroundColor: theme.textTertiary, opacity: 0.7 }
            ]}
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
              style={[styles.remarksOptionCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
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
              <View style={[styles.remarksOptionIconBox, { backgroundColor: theme.accentSubtle }]}>
                <Ionicons name="newspaper-outline" size={18} color={theme.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.remarksOptionTitle, { color: theme.text }]}>Check Past Remarks Ledger</Text>
                <Text style={[styles.remarksOptionSub, { color: theme.textSecondary }]}>
                  Previously disconnected from a property? View official remarks left by previous owners.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Security badge */}
        <View style={styles.securityFooter}>
          <Ionicons name="shield-checkmark-outline" size={15} color={theme.textTertiary} />
          <Text style={[styles.securityText, { color: theme.textTertiary }]}>AES-256 Encrypted Local Desk Storage</Text>
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
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 4,
    borderRadius: 14,
    marginBottom: 20
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 11
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  segmentText: {
    fontSize: 13.5,
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
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  inputGroup: {
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1.1,
    marginBottom: 8
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 10,
    lineHeight: 16
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50
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
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  codeInputText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
    color: '#2563eb',
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
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 0.9,
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
    borderRadius: 11,
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
    color: '#475569'
  },
  typeChipTextActive: {
    color: '#2563eb',
    fontWeight: '700'
  },

  // Submit Button
  submitBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff'
  },
  remarksOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  remarksOptionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remarksOptionTitle: {
    fontFamily: Fonts.serif,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  remarksOptionSub: {
    fontSize: 11.5,
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