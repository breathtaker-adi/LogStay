// src/app/staff-login.tsx
import React, { useCallback, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  Modal
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, getStaffCache, cacheStaff, saveLocalPinHash, verifyLocalPin } from '@/lib/offline';
import { ScreenHeader } from '@/lib/screen-header';
import { formatFriendlyError } from '@/lib/error-utils';

interface StaffProfile {
  id: string;
  name: string;
  role: 'owner' | 'desk' | 'housekeeping' | string;
  phone?: string;
}

export default function StaffLoginScreen() {
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [propertyId, setPropertyId] = useState<string>('');
  
  // Forgot PIN State
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryOwnerPin, setRecoveryOwnerPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  const pinInputRef = useRef<TextInput>(null);
  const { setActiveStaff } = useStaff();

  const fetchStaff = async () => {
    setLoading(true);

    // 1. Read from local cache first
    const localStaff = await getStaffCache();
    if (localStaff && localStaff.length > 0) {
      setStaffList(localStaff);
      setLoading(false);
    }

    // 2. If online, fetch from Supabase and update cache
    if (await isOnline()) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return router.replace('/login');
        if (userData.user.email) setOwnerEmail(userData.user.email);

        // Find the user's property
        const { data: member } = await supabase
          .from('members')
          .select('property_id')
          .eq('user_id', userData.user.id)
          .single();

        if (!member) return router.replace('/setup-property');
        setPropertyId(member.property_id);

        // Fetch active staff for this property using the secure view
        const { data, error } = await supabase
          .from('staff_profiles_safe')
          .select('*')
          .eq('property_id', member.property_id)
          .eq('active', true)
          .order('name');

        if (error) {
          console.error('Fetch staff error:', error);
        } else if (data) {
          setStaffList(data);
          await cacheStaff(data); // Save to local cache
        }
      } catch (err) {
        console.error('Staff fetch error', err);
      }
    } else {
      if (!localStaff || localStaff.length === 0) {
        Alert.alert('Offline', 'No staff profiles cached. Please connect to the internet to initialize your desk.');
      }
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchStaff();
    }, [])
  );

  const selectStaffMember = (staff: StaffProfile) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedStaff(staff);
    setPin('');
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 150);
  };

  const handleVerify = async (pinValue?: string) => {
    const currentPin = pinValue !== undefined ? pinValue : pin;
    if (!selectedStaff || currentPin.length < 4) return;
    setVerifying(true);

    if (await isOnline()) {
      const { data, error } = await supabase.rpc('staff_login', {
        p_staff: selectedStaff.id,
        p_pin: currentPin
      });

      setVerifying(false);

      if (error) {
        Alert.alert('Authentication Error', formatFriendlyError(error, 'Incorrect PIN or authentication error.'));
        return;
      }

      if (data === true) {
        // Save local pin hash for offline use
        await saveLocalPinHash(selectedStaff.id, currentPin);

        // Clock in the staff member via secure RPC
        const { data: attId, error: attError } = await supabase.rpc('clock_in_staff', {
          p_staff_id: selectedStaff.id
        });

        let attendanceId = null;
        if (!attError && attId) {
          attendanceId = attId;
        }

        // Set active staff in context
        await setActiveStaff({
          id: selectedStaff.id,
          name: selectedStaff.name,
          role: selectedStaff.role,
          attendanceId: attendanceId
        });
        router.replace('/home');
      } else {
        Alert.alert('Invalid PIN', 'The 4-digit PIN you entered is incorrect.');
        setPin('');
        pinInputRef.current?.focus();
      }
    } else {
      // Offline fallback: verify locally with PBKDF2
      setVerifying(false);
      try {
        const isValid = await verifyLocalPin(selectedStaff.id, currentPin);
        if (isValid) {
          await setActiveStaff({
            id: selectedStaff.id,
            name: selectedStaff.name,
            role: selectedStaff.role,
            attendanceId: null
          });
          router.replace('/home');
        } else {
          Alert.alert('Invalid PIN', 'The 4-digit PIN you entered is incorrect.');
          setPin('');
          pinInputRef.current?.focus();
        }
      } catch (e: any) {
        Alert.alert('Profile Locked', e.message || 'Too many failed attempts. Try again later.');
        setPin('');
      }
    }
  };

  const onPinChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 4);
    setPin(cleaned);
    if (cleaned.length === 4) {
      handleVerify(cleaned);
    }
  };

  const handleForgotPinSubmit = async () => {
    if (!selectedStaff) return;

    if (newPin.length < 4) {
      return Alert.alert('Invalid PIN', 'Your new PIN must be exactly 4 digits.');
    }
    if (newPin !== confirmPin) {
      return Alert.alert('Mismatch', 'The new PIN and confirmation PIN do not match.');
    }

    if (!(await isOnline())) {
      return Alert.alert('Online Required', 'PIN recovery requires an internet connection.');
    }

    setRecoverySubmitting(true);

    try {
      if (selectedStaff.role === 'owner') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) throw new Error('Not logged in to property account.');

        if (!recoveryPassword.trim()) {
          setRecoverySubmitting(false);
          return Alert.alert('Password Required', `Please enter the account login password for ${user.email}.`);
        }

        // Re-authenticate password
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: recoveryPassword.trim()
        });

        if (authErr) {
          setRecoverySubmitting(false);
          return Alert.alert('Incorrect Password', `The password entered does not match your LogStay account (${user.email}).`);
        }

        // Call RPC
        const { error: rpcErr } = await supabase.rpc('owner_reset_forgotten_pin', {
          p_owner_id: selectedStaff.id,
          p_new_pin: newPin.trim()
        });

        if (rpcErr) throw rpcErr;

        await saveLocalPinHash(selectedStaff.id, newPin.trim());
        setRecoverySubmitting(false);
        setForgotModalVisible(false);
        Alert.alert('PIN Updated', 'Your Owner PIN has been updated. Please enter your new PIN to log in.');
        setPin('');
      } else {
        // Staff Member Forgot PIN -> Requires Owner Authorization PIN
        if (!recoveryOwnerPin.trim()) {
          setRecoverySubmitting(false);
          return Alert.alert('Owner PIN Required', 'An owner PIN is required to authorize resetting this staff member’s PIN.');
        }

        const ownerProfile = staffList.find(s => s.role === 'owner');
        if (!ownerProfile) throw new Error('No owner profile found for this property.');

        const { error: rpcErr } = await supabase.rpc('reset_staff_pin', {
          p_prop: propertyId,
          p_actor: ownerProfile.id,
          p_target: selectedStaff.id,
          p_new_pin: newPin.trim(),
          p_owner_pin: recoveryOwnerPin.trim()
        });

        if (rpcErr) throw rpcErr;

        await saveLocalPinHash(selectedStaff.id, newPin.trim());
        setRecoverySubmitting(false);
        setForgotModalVisible(false);
        Alert.alert('PIN Reset', `PIN for ${selectedStaff.name} has been reset. Please enter your new PIN to log in.`);
        setPin('');
      }
    } catch (err: any) {
      setRecoverySubmitting(false);
      Alert.alert('Recovery Failed', formatFriendlyError(err, 'Could not reset PIN. Please try again.'));
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return {
          label: 'Owner',
          bg: '#fef3c7',
          color: '#92400e',
          icon: 'shield-checkmark' as const,
          avatarBg: '#fef3c7',
          avatarText: '#b45309'
        };
      case 'desk':
        return {
          label: 'Front Desk',
          bg: '#dbeafe',
          color: '#1e40af',
          icon: 'desktop-outline' as const,
          avatarBg: '#dbeafe',
          avatarText: '#1d4ed8'
        };
      case 'housekeeping':
        return {
          label: 'Housekeeping',
          bg: '#f3e8ff',
          color: '#6b21a8',
          icon: 'sparkles' as const,
          avatarBg: '#f3e8ff',
          avatarText: '#7e22ce'
        };
      default:
        return {
          label: role,
          bg: '#f1f5f9',
          color: '#334155',
          icon: 'person' as const,
          avatarBg: '#f1f5f9',
          avatarText: '#475569'
        };
    }
  };

  if (loading && staffList.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={styles.loadingText}>Loading desk profiles...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={selectedStaff ? "Desk Verification" : "Who's at the desk?"}
        subtitle={selectedStaff ? `Logging in as ${selectedStaff.name}` : "Select your active shift profile"}
        onBack={() => {
          if (selectedStaff) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedStaff(null);
            setPin('');
          } else {
            router.replace('/login');
          }
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!selectedStaff ? (
          staffList.length === 0 ? (
            /* Empty State */
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={40} color="#64748b" />
              </View>
              <Text style={styles.emptyTitle}>No Staff Profiles Found</Text>
              <Text style={styles.emptySub}>
                Initialize your first owner or team profile with a 4-digit PIN to access the property dashboard.
              </Text>
              
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => router.push('/add-staff')}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryActionText}>Add Team Member</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={fetchStaff}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={16} color="#64748b" />
                <Text style={styles.secondaryBtnText}>Refresh List</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Staff Selection List */
            <View style={styles.listContainer}>
              <View style={styles.listHeaderRow}>
                <Text style={styles.sectionHeading}>TEAM PROFILES</Text>
                <TouchableOpacity
                  style={styles.addMiniBtn}
                  onPress={() => router.push('/add-staff')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color="#0f172a" />
                  <Text style={styles.addMiniText}>New Staff</Text>
                </TouchableOpacity>
              </View>

              {staffList.map((staff) => {
                const badge = getRoleBadge(staff.role);
                const initial = staff.name ? staff.name.charAt(0).toUpperCase() : '?';

                return (
                  <TouchableOpacity
                    key={staff.id}
                    style={styles.staffCard}
                    onPress={() => selectStaffMember(staff)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.avatarCircle, { backgroundColor: badge.avatarBg }]}>
                      <Text style={[styles.avatarInitial, { color: badge.avatarText }]}>
                        {initial}
                      </Text>
                    </View>

                    <View style={styles.staffInfo}>
                      <Text style={styles.staffName} numberOfLines={1}>{staff.name}</Text>
                      <View style={[styles.rolePill, { backgroundColor: badge.bg }]}>
                        <Ionicons name={badge.icon} size={11} color={badge.color} />
                        <Text style={[styles.rolePillText, { color: badge.color }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.chevronBox}>
                      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : (
          /* Sleek PIN Entry Screen */
          <View style={styles.pinCard}>
            {(() => {
              const badge = getRoleBadge(selectedStaff.role);
              const initial = selectedStaff.name ? selectedStaff.name.charAt(0).toUpperCase() : '?';

              return (
                <View style={styles.profileHeader}>
                  <View style={[styles.largeAvatar, { backgroundColor: badge.avatarBg }]}>
                    <Text style={[styles.largeAvatarText, { color: badge.avatarText }]}>
                      {initial}
                    </Text>
                  </View>

                  <Text style={styles.profileName}>{selectedStaff.name}</Text>
                  
                  <View style={[styles.rolePill, { backgroundColor: badge.bg, marginTop: 6 }]}>
                    <Ionicons name={badge.icon} size={12} color={badge.color} />
                    <Text style={[styles.rolePillText, { color: badge.color }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>
              );
            })()}

            <Text style={styles.pinInstructions}>
              Enter your 4-digit security PIN to unlock the desk
            </Text>

            {/* Hidden Input for keyboard handling */}
            <TextInput
              ref={pinInputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={4}
              value={pin}
              onChangeText={onPinChange}
              autoFocus={true}
              secureTextEntry={false}
              caretHidden={true}
            />

            {/* 4 PIN Dots / Cells */}
            <Pressable
              style={styles.pinDisplayRow}
              onPress={() => pinInputRef.current?.focus()}
            >
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = pin.length > idx;
                const isCurrent = pin.length === idx;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinBox,
                      isFilled && styles.pinBoxFilled,
                      isCurrent && styles.pinBoxActive
                    ]}
                  >
                    {isFilled ? (
                      <View style={styles.pinDotFilled} />
                    ) : isCurrent ? (
                      <View style={styles.pinDotCurrent} />
                    ) : null}
                  </View>
                );
              })}
            </Pressable>

            {/* Verification Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                pin.length === 4 ? styles.verifyButtonActive : styles.verifyButtonDisabled
              ]}
              onPress={() => handleVerify()}
              disabled={verifying || pin.length < 4}
              activeOpacity={0.8}
            >
              {verifying ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={styles.verifyBtnContent}>
                  <Text style={styles.verifyBtnText}>Unlock Desk</Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </View>
              )}
            </TouchableOpacity>

            {/* Forgot PIN Action Link */}
            <TouchableOpacity
              style={styles.forgotPinBtn}
              onPress={() => {
                setRecoveryPassword('');
                setRecoveryOwnerPin('');
                setNewPin('');
                setConfirmPin('');
                setForgotModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="key-outline" size={14} color="#64748b" />
              <Text style={styles.forgotPinText}>Forgot PIN?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchStaffBtn}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSelectedStaff(null);
                setPin('');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={15} color="#64748b" />
              <Text style={styles.switchStaffText}>Switch Staff Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Forgot PIN Recovery Modal */}
      <Modal visible={forgotModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconBox}>
                <Ionicons name="lock-open-outline" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Reset Forgotten PIN</Text>
                <Text style={styles.modalSub}>{selectedStaff?.name} ({selectedStaff?.role})</Text>
              </View>
            </View>

            {selectedStaff?.role === 'owner' ? (
              /* Owner: LogStay Account Login Password Verification */
              <View style={styles.modalFormGroup}>
                <Text style={styles.modalHelpText}>
                  Enter the password you use to sign in to LogStay with {ownerEmail ? <Text style={{ fontWeight: '700', color: '#0f172a' }}>{ownerEmail}</Text> : 'your account email'} to verify ownership and set a new 4-digit PIN.
                </Text>

                <Text style={styles.modalFieldLabel}>ACCOUNT LOGIN PASSWORD</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={ownerEmail ? `Password for ${ownerEmail}` : "Your account login password"}
                  placeholderTextColor="#94a3b8"
                  value={recoveryPassword}
                  onChangeText={setRecoveryPassword}
                  secureTextEntry
                />
              </View>
            ) : (
              /* Desk/Housekeeping: Owner PIN Authorization */
              <View style={styles.modalFormGroup}>
                <Text style={styles.modalHelpText}>
                  Ask the property owner to authorize resetting your PIN by entering their Owner PIN.
                </Text>

                <Text style={styles.modalFieldLabel}>PROPERTY OWNER PIN</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Owner PIN (to authorize)"
                  placeholderTextColor="#94a3b8"
                  value={recoveryOwnerPin}
                  onChangeText={setRecoveryOwnerPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
              </View>
            )}

            {/* New 4-Digit PIN */}
            <Text style={styles.modalFieldLabel}>NEW 4-DIGIT PIN</Text>
            <TextInput
              style={[styles.modalInput, styles.pinInputModal]}
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            {/* Confirm New 4-Digit PIN */}
            <Text style={styles.modalFieldLabel}>CONFIRM NEW 4-DIGIT PIN</Text>
            <TextInput
              style={[styles.modalInput, styles.pinInputModal]}
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setForgotModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, recoverySubmitting && { backgroundColor: '#94a3b8' }]}
                onPress={handleForgotPinSubmit}
                disabled={recoverySubmitting}
                activeOpacity={0.8}
              >
                {recoverySubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Reset PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    gap: 12
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500'
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40
  },

  // List View
  listContainer: {
    gap: 12
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8
  },
  addMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  addMiniText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a'
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700'
  },
  staffInfo: {
    flex: 1,
    gap: 4
  },
  staffName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center'
  },

  // PIN Entry Card
  pinCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    marginTop: 10
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20
  },
  largeAvatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  },
  largeAvatarText: {
    fontSize: 32,
    fontWeight: '800'
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a'
  },
  pinInstructions: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 240
  },

  // Hidden text input
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1
  },

  // 4 PIN Boxes
  pinDisplayRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28
  },
  pinBox: {
    width: 56,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center'
  },
  pinBoxFilled: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb'
  },
  pinBoxActive: {
    borderColor: '#0f172a',
    backgroundColor: '#ffffff'
  },
  pinDotFilled: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563eb'
  },
  pinDotCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#94a3b8'
  },

  // Verify Button
  verifyButton: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  verifyButtonActive: {
    backgroundColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3
  },
  verifyButtonDisabled: {
    backgroundColor: '#cbd5e1'
  },
  verifyBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  verifyBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },

  // Forgot PIN button
  forgotPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8
  },
  forgotPinText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600'
  },

  switchStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  switchStaffText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 20
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginBottom: 12
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },

  // Forgot PIN Modal
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16
  },
  modalIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a'
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'capitalize'
  },
  modalFormGroup: {
    marginBottom: 12
  },
  modalHelpText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 12
  },
  modalFieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 12
  },
  pinInputModal: {
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'center'
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9'
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b'
  },
  modalSubmitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#0f172a'
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  }
});