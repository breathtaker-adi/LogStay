// src/app/exports.tsx
// Compliance Exports: Police Register & Form C (Bureau of Immigration)
// High-fidelity UI with Quick Date Presets, Form Cards, and styled Export Buttons

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { csvCell } from "../lib/csv";
import { ScreenHeader } from "@/lib/screen-header";

const formatPoliceRegisterCSV = (stays: any[]) => {
  const headers = [
    'Serial No',
    'Guest Name',
    'Father/Husband Name',
    'Nationality',
    'ID Type',
    'ID Number (Last 4)',
    'Phone',
    'Date of Arrival',
    'Room/Bed No',
    'Check-Out Date'
  ];
  
  const rows = stays.map((s, index) => [
    csvCell(index + 1),
    csvCell(s.guests?.name || ''),
    csvCell(''),
    csvCell(s.guests?.nationality || ''),
    csvCell(s.guests?.id_type || ''),
    csvCell(`****${s.guests?.id_last4 || ''}`),
    csvCell(s.guests?.phone || '', true),
    csvCell(new Date(s.check_in).toLocaleDateString('en-IN')),
    csvCell(s.units?.label || s.unit_id || ''),
    csvCell(s.check_out ? new Date(s.check_out).toLocaleDateString('en-IN') : 'In House')
  ]);

  return [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
};

const formatFormC = (stays: any[]) => {
  const headers = [
    'Sl No',
    'Given Name',
    'Surname',
    'Nationality',
    'Passport No',
    'Visa Type',
    'Visa No',
    'Date of Arrival',
    'Duration of Stay (Days)',
    'Address in India',
    'Purpose of Visit',
    'Port of Embarkation',
    'Port of Disembarkation'
  ];
  
  const rows = stays.map((s, index) => {
    const checkIn = new Date(s.check_in);
    const today = new Date();
    const endDate = s.check_out ? new Date(s.check_out) : today;
    const duration = Math.max(1, Math.ceil((endDate.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
    const foreignDetails = Array.isArray(s.foreign_details) ? s.foreign_details[0] : s.foreign_details;

    const nameParts = (guest?.name || '').split(' ');
    const givenName = nameParts[0] || '';
    const surname = nameParts.slice(1).join(' ') || '-';

    return [
      csvCell(index + 1),
      csvCell(givenName),
      csvCell(surname),
      csvCell(guest?.nationality || ''),
      csvCell(foreignDetails?.passport_no || s.passport_no || ''),
      csvCell(foreignDetails?.visa_type || s.visa_type || ''),
      csvCell(foreignDetails?.visa_no || s.visa_no || ''),
      csvCell(checkIn.toLocaleDateString('en-IN')),
      csvCell(duration),
      csvCell(s.property_address || ''),
      csvCell('Tourism'),
      csvCell(foreignDetails?.arrived_from || s.arrived_from || ''),
      csvCell(foreignDetails?.next_dest || s.next_dest || '')
    ];
  });

  return [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
};

export default function ExportsScreen() {
  const [loadingType, setLoadingType] = useState<'police' | 'form_c' | null>(null);
  
  // Format today as YYYY-MM-DD
  const formatDateStr = (date: Date) => date.toISOString().split('T')[0];
  
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(formatDateStr(firstOfMonth));
  const [endDate, setEndDate] = useState(formatDateStr(today));

  const applyPreset = (preset: 'today' | '7days' | 'month') => {
    const now = new Date();
    if (preset === 'today') {
      const d = formatDateStr(now);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setStartDate(formatDateStr(past));
      setEndDate(formatDateStr(now));
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDateStr(m));
      setEndDate(formatDateStr(now));
    }
  };

  async function generateCSV() {
    if (!startDate || !endDate) {
      Alert.alert("Missing Dates", "Please enter both Start and End dates (YYYY-MM-DD).");
      return;
    }

    setLoadingType('police');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();
      if (!memberData) throw new Error("No property found.");

      const { data: staysData, error } = await supabase
        .from('stays')
        .select('check_in, check_out, unit_id, units(label), guests(name, nationality, id_type, id_last4, phone)')
        .eq('property_id', memberData.property_id)
        .gte('check_in', `${startDate}T00:00:00`)
        .lte('check_in', `${endDate}T23:59:59`)
        .order('check_in', { ascending: true });

      if (error) throw error;

      if (!staysData || staysData.length === 0) {
        Alert.alert("No Data", "No check-ins found in this date range.");
        setLoadingType(null);
        return;
      }

      const csvContent = formatPoliceRegisterCSV(staysData);
      const file = new File(Paths.cache, 'logstay_police_register.csv');
      file.create({ overwrite: true });
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'LogStay Police Register Export'
        });
      } else {
        Alert.alert("Saved", "File saved to device.");
      }
    } catch (error: any) {
      Alert.alert("Export Error", error.message);
    } finally {
      setLoadingType(null);
    }
  }

  async function generateFormC() {
    if (!startDate || !endDate) {
      Alert.alert("Missing Dates", "Please enter both Start and End dates (YYYY-MM-DD).");
      return;
    }

    setLoadingType('form_c');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();
      if (!memberData) throw new Error("No property found.");

      const { data: staysData, error } = await supabase
        .from('stays')
        .select('check_in, check_out, unit_id, units(label), guests(name, nationality, phone), foreign_details(passport_no, visa_no, visa_type, arrived_from, next_dest)')
        .eq('property_id', memberData.property_id)
        .gte('check_in', `${startDate}T00:00:00`)
        .lte('check_in', `${endDate}T23:59:59`)
        .order('check_in', { ascending: true });

      if (error) throw error;

      const DOMESTIC_TERMS = ['india', 'indian', 'ind', 'nepal', 'bhutan'];
      const isDomestic = (nat?: string) => {
        if (!nat) return false;
        const n = nat.toLowerCase().trim();
        return DOMESTIC_TERMS.some(d => n === d || n.startsWith('india'));
      };

      const foreignStays = (staysData as any[] || []).filter((s: any) => {
        const foreignDetails = Array.isArray(s.foreign_details) ? s.foreign_details[0] : s.foreign_details;
        const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
        const nat = guest?.nationality;

        // Strictly exclude domestic guests
        if (isDomestic(nat)) return false;

        return Boolean(foreignDetails?.passport_no || (nat && !isDomestic(nat)));
      });

      if (foreignStays.length === 0) {
        Alert.alert("No Foreign Guests", "No foreign check-ins found in this date range.");
        setLoadingType(null);
        return;
      }

      const csvContent = formatFormC(foreignStays);
      const file = new File(Paths.cache, 'logstay_form_c_boi.csv');
      file.create({ overwrite: true });
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'LogStay Form C (BoI Export)'
        });
      } else {
        Alert.alert("Saved", "File saved to device.");
      }
    } catch (error: any) {
      Alert.alert("Export Error", error.message);
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Compliance Exports"
        subtitle="Police Register & Form C Reports"
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* ── DATE RANGE SELECTION CARD ─────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Export Date Range</Text>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('today')}
              >
                <Text style={styles.presetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('7days')}
              >
                <Text style={styles.presetChipText}>Last 7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset('month')}
              >
                <Text style={styles.presetChipText}>This Month</Text>
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View style={styles.dateInputsRow}>
              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>FROM DATE</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="calendar" size={16} color="#64748b" />
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                </View>
              </View>

              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>TO DATE</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="calendar" size={16} color="#64748b" />
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={endDate}
                    onChangeText={setEndDate}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* ── EXPORT CARD 1: POLICE REGISTER ─────────────────────── */}
          <View style={styles.card}>
            <View style={styles.exportHeader}>
              <View style={styles.exportIconBox}>
                <Ionicons name="shield-checkmark" size={24} color="#2563eb" />
              </View>
              <View style={styles.exportInfo}>
                <Text style={styles.exportTitle}>Police Guest Register</Text>
                <Text style={styles.exportSubtitle}>
                  Standard Indian police record format with serial number, ID type, masked ID number, contact info, and room allocations.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.exportBtn, styles.policeBtn]}
              onPress={generateCSV}
              disabled={loadingType !== null}
              activeOpacity={0.8}
            >
              {loadingType === 'police' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#ffffff" />
                  <Text style={styles.exportBtnText}>Generate Police Register CSV</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── EXPORT CARD 2: FORM C (BoI) ───────────────────────── */}
          <View style={styles.card}>
            <View style={styles.exportHeader}>
              <View style={[styles.exportIconBox, { backgroundColor: '#f0fdf4' }]}>
                <MaterialCommunityIcons name="earth" size={24} color="#16a34a" />
              </View>
              <View style={styles.exportInfo}>
                <Text style={styles.exportTitle}>Form C (Bureau of Immigration / BoI)</Text>
                <Text style={styles.exportSubtitle}>
                  Official Bureau of Immigration (BoI) compliant CSV format for foreign nationals including passport, visa, embarkation and stay data.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.exportBtn, styles.formCBtn]}
              onPress={generateFormC}
              disabled={loadingType !== null}
              activeOpacity={0.8}
            >
              {loadingType === 'form_c' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#ffffff" />
                  <Text style={styles.exportBtnText}>Generate Form C CSV (BoI Format)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  keyboardAvoid: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  presetChip: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  presetChipText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700'
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 12
  },
  dateInputCol: {
    flex: 1
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600'
  },
  exportHeader: {
    flexDirection: 'row',
    marginBottom: 16
  },
  exportIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  exportInfo: {
    flex: 1
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4
  },
  exportSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  policeBtn: {
    backgroundColor: '#2563eb'
  },
  formCBtn: {
    backgroundColor: '#16a34a'
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  }
});