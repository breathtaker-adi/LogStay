// src/app/setup-property.tsx
import React, { useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ScreenHeader } from '@/lib/screen-header';

const PROPERTY_TYPES = ['Hostel', 'Hotel', 'Guest House', 'Resort', 'Homestay'];

export default function SetupPropertyScreen() {
  const [isOwner, setIsOwner] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('Hostel');
  const [state, setState] = useState('');
  const [pin, setPin] = useState('1234');
  
  // Staff join state
  const [propertyId, setPropertyId] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = (ownerMode: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOwner(ownerMode);
  };

  async function saveData() {
    setLoading(true);

    try {
      if (isOwner) {
        // OWNER FLOW: Create Property
        if (!name.trim() || !state.trim()) {
          Alert.alert('Missing Details', 'Please enter your Property Name and State.');
          setLoading(false);
          return;
        }

        if (pin.trim().length < 4) {
          Alert.alert('Invalid PIN', 'Please set a 4-digit security PIN.');
          setLoading(false);
          return;
        }

        const { error: propError } = await supabase.rpc('create_property', {
          p_name: name.trim(),
          p_type: type,
          p_state: state.trim(),
          p_pin: pin.trim()
        });

        if (propError) throw propError;

        Alert.alert('Success', 'Property created successfully! Now select your profile to enter.');
      } else {
        // STAFF FLOW: Join Property
        if (!propertyId.trim()) {
          Alert.alert('Missing Code', 'Please enter the Property Invite Code given to you by the owner.');
          setLoading(false);
          return;
        }

        const { data, error: joinError } = await supabase.rpc('join_property', {
          p_code: propertyId.trim()
        });

        if (joinError) throw joinError;
        if (!data) throw new Error('Invalid or expired invite code.');

        Alert.alert('Success', 'Joined property team successfully! Proceed to staff login.');
      }
      
      router.replace('/staff-login');
    } catch (error: any) {
      Alert.alert('Setup Failed', error.message || 'Could not complete property setup.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              {/* Property Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PROPERTY NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="home-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Zostel Rishikesh, Blue Beds"
                    placeholderTextColor="#94a3b8"
                    value={name}
                    onChangeText={setName}
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
              {/* Staff Invite Code */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>INVITE CODE</Text>
                <Text style={styles.helperText}>
                  Enter the 48-hour invite code generated by your property owner in Settings.
                </Text>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="ticket-confirmation-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter invite code"
                    placeholderTextColor="#94a3b8"
                    value={propertyId}
                    onChangeText={setPropertyId}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </>
          )}

          {/* 4-Digit Shift Security PIN */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>YOUR 4-DIGIT DESK PIN</Text>
            <Text style={styles.helperText}>
              Used to clock in and unlock the desk without entering your password every time.
            </Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="4-digit PIN (e.g. 1234)"
                placeholderTextColor="#94a3b8"
                value={pin}
                onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          </View>

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