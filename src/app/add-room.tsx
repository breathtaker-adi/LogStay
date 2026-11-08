// src/app/add-room.tsx
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
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ScreenHeader } from '@/lib/screen-header';
import { floorLabel } from '@/lib/floors';
import { useStaff } from '@/lib/staff-context';
import { useTheme } from '@/hooks/use-theme';

export default function AddRoomScreen() {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'private' | 'dorm'>('private');
  const [floorNo, setFloorNo] = useState<number>(0);
  const [bedCount, setBedCount] = useState('4');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { activeStaff, can } = useStaff();

  useEffect(() => {
    AsyncStorage.getItem('last_created_floor').then(saved => {
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) setFloorNo(parsed);
      }
    });
  }, []);

  const adjustFloor = (delta: number) => {
    setFloorNo(prev => {
      const next = prev + delta;
      if (next < -2) return -2;
      if (next > 60) return 60;
      return next;
    });
  };

  const handleKindChange = (newKind: 'private' | 'dorm') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setKind(newKind);
  };

  async function saveRoom() {
    if (!label.trim()) {
      Alert.alert('Missing Info', 'Please enter a Room Label (e.g. 101 or Deluxe 2).');
      return;
    }

    if (activeStaff?.role && !can('add_room')) {
      Alert.alert('Owner Action Only', 'Adding rooms is restricted to Property Owners.');
      return;
    }

    setLoading(true);

    try {
      const roomId = Crypto.randomUUID();
      const numBeds = kind === 'dorm' ? (parseInt(bedCount, 10) || 1) : 1;
      const unitIds = Array.from({ length: numBeds }, () => Crypto.randomUUID());
      const floorStr = floorLabel(floorNo);

      const { error: roomError } = await supabase.rpc('add_room_with_units', {
        p_room_id: roomId,
        p_label: label.trim(),
        p_kind: kind,
        p_floor: floorStr,
        p_unit_ids: unitIds,
        p_unit_labels: null,
        p_gender_rule: 'any',
        p_floor_no: floorNo,
        p_description: description.trim() || null
      });

      if (roomError) {
        Alert.alert('Error', roomError.message);
        setLoading(false);
        return;
      }

      await AsyncStorage.setItem('last_created_floor', floorNo.toString());
      setLoading(false);
      Alert.alert('Success', `Room "${label.trim()}" added to ${floorLabel(floorNo)}.`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/rooms');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add room.');
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
        title="Add Room / Dorm"
        subtitle="Configure physical room and floor location"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >
        <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Room Label */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ROOM IDENTIFIER / LABEL</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="door" size={20} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="e.g. 101, 204, Dorm A"
                placeholderTextColor={theme.textTertiary}
                value={label}
                onChangeText={setLabel}
              />
            </View>
          </View>

          {/* Floor Stepper */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>FLOOR ASSIGNMENT</Text>
            <View style={[styles.stepperContainer, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[
                  styles.stepperBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  floorNo <= -2 && { opacity: 0.4 }
                ]}
                onPress={() => adjustFloor(-1)}
                disabled={floorNo <= -2}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={floorNo <= -2 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>

              <View style={styles.stepperValueBox}>
                <Text style={[styles.stepperFloorTitle, { color: theme.text }]}>{floorLabel(floorNo)}</Text>
                <Text style={[styles.stepperFloorSub, { color: theme.textSecondary }]}>Index: {floorNo}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.stepperBtn,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  floorNo >= 60 && { opacity: 0.4 }
                ]}
                onPress={() => adjustFloor(1)}
                disabled={floorNo >= 60}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={floorNo >= 60 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>
            </View>

            {/* Quick Floor Chips */}
            <View style={styles.quickFloorChips}>
              {[-1, 0, 1, 2, 3].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.quickChip,
                    { backgroundColor: floorNo === f ? theme.accentSubtle : theme.surfaceSubtle, borderColor: floorNo === f ? theme.accent : theme.border }
                  ]}
                  onPress={() => setFloorNo(f)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.quickChipText,
                    { color: floorNo === f ? theme.accent : theme.textSecondary, fontWeight: floorNo === f ? '700' : '500' }
                  ]}>
                    {f === -1 ? 'Basement' : f === 0 ? 'Ground' : `Floor ${f}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Room Type Selector */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ROOM CLASSIFICATION</Text>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  {
                    backgroundColor: kind === 'private' ? theme.accentSubtle : theme.surfaceSubtle,
                    borderColor: kind === 'private' ? theme.accent : theme.border
                  }
                ]}
                onPress={() => handleKindChange('private')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="bed-outline"
                  size={20}
                  color={kind === 'private' ? theme.accent : theme.textSecondary}
                />
                <Text style={[
                  styles.typeOptionText,
                  { color: kind === 'private' ? theme.accent : theme.textSecondary }
                ]}>
                  Private Room
                </Text>
                <Text style={[styles.typeOptionSub, { color: theme.textTertiary }]}>1 entire room / 1 unit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeOption,
                  {
                    backgroundColor: kind === 'dorm' ? theme.accentSubtle : theme.surfaceSubtle,
                    borderColor: kind === 'dorm' ? theme.accent : theme.border
                  }
                ]}
                onPress={() => handleKindChange('dorm')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="bunk-bed-outline"
                  size={20}
                  color={kind === 'dorm' ? theme.accent : theme.textSecondary}
                />
                <Text style={[
                  styles.typeOptionText,
                  { color: kind === 'dorm' ? theme.accent : theme.textSecondary }
                ]}>
                  Dormitory
                </Text>
                <Text style={[styles.typeOptionSub, { color: theme.textTertiary }]}>Shared beds matrix</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Dorm Bed Count */}
          {kind === 'dorm' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NUMBER OF BEDS IN DORM</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <Ionicons name="grid-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="e.g. 4, 6, 8, 12"
                  placeholderTextColor={theme.textTertiary}
                  value={bedCount}
                  onChangeText={setBedCount}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}

          {/* Description / Remark */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>REMARK / DESCRIPTION (OPTIONAL)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, minHeight: 76, alignItems: 'flex-start', paddingTop: 8 }]}>
              <Ionicons name="document-text-outline" size={18} color={theme.textTertiary} style={[styles.inputIcon, { marginTop: 2 }]} />
              <TextInput
                style={[styles.textInput, { color: theme.text, minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. Balcony view, near elevator, AC deluxe"
                placeholderTextColor={theme.textTertiary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: theme.accent },
              loading && { opacity: 0.6 }
            ]}
            onPress={saveRoom}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.submitBtnContent}>
                <Text style={styles.submitBtnText}>Create Room</Text>
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
    flexGrow: 1,
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

  // Stepper
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 8,
    marginBottom: 10
  },
  stepperBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  stepperBtnDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0'
  },
  stepperValueBox: {
    flex: 1,
    alignItems: 'center'
  },
  stepperFloorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  stepperFloorSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500'
  },
  quickFloorChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4
  },
  quickChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  quickChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb'
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  quickChipTextActive: {
    color: '#2563eb',
    fontWeight: '700'
  },

  // Type Selector
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10
  },
  typeOption: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 14,
    alignItems: 'center',
    gap: 4
  },
  typeOptionActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb'
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  },
  typeOptionTextActive: {
    color: '#1d4ed8'
  },
  typeOptionSub: {
    fontSize: 10,
    color: '#94a3b8'
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
  }
});