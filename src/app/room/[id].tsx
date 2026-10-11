// src/app/room/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, saveToOutbox, updateLocalUnitStatus } from '@/lib/offline';
import * as Crypto from 'expo-crypto';

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeStaff, can } = useStaff();
  
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<any>(null);
  const [currentStay, setCurrentStay] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueCategory, setIssueCategory] = useState<'ac' | 'water' | 'noise' | 'cleanliness' | 'electrical' | 'other'>('ac');
  const [issueNote, setIssueNote] = useState('');
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const [history, setHistory] = useState<any[]>([]);

  const fetchRoomDetails = async () => {
    setLoading(true);
    
    // Fetch Unit + Room details
    const { data: unitData, error: unitError } = await supabase
      .from('units')
      .select(`*, rooms ( label, floor, kind )`)
      .eq('id', id)
      .single();
      
    if (unitError) {
      Alert.alert('Error', 'Room not found');
      router.back();
      return;
    }
    setUnit(unitData);

    // Fetch active stay for this unit
    const { data: stayData } = await supabase
      .from('stays')
      .select(`*, guests ( name, phone, nationality )`)
      .eq('unit_id', id)
      .eq('status', 'checked_in')
      .maybeSingle();
    setCurrentStay(stayData);

    // Fetch open issues for this unit
    const { data: issuesData } = await supabase
      .from('issues')
      .select('*')
      .eq('unit_id', id)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    setIssues(issuesData || []);

    // Fetch History (Past stays & Housekeeping logs)
    const { data: pastStays } = await supabase
      .from('stays')
      .select(`check_in, check_out, guests ( name )`)
      .eq('unit_id', id)
      .eq('status', 'checked_out')
      .order('check_out', { ascending: false })
      .limit(10);

    const { data: cleans } = await supabase
      .from('housekeeping_log')
      .select(`created_at, staff_id`)
      .eq('unit_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Combine and sort timeline
    const combinedHistory = [
      ...(pastStays || []).map((s: any) => ({
        type: 'stay',
        date: s.check_out,
        details: `Checked out: ${(Array.isArray(s.guests) ? s.guests[0]?.name : s.guests?.name) || 'Guest'}`
      })),
      ...(cleans || []).map((c: any) => ({ type: 'clean', date: c.created_at, details: 'Marked clean' }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setHistory(combinedHistory);

    setLoading(false);
  };

  useEffect(() => {
    fetchRoomDetails();
  }, [id]);

  const handleMarkClean = async () => {
    if (!activeStaff) return;
    
    if (await isOnline()) {
      const { error } = await supabase.rpc('mark_unit_clean', { 
        p_unit_id: id, 
        p_staff_id: activeStaff.id 
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('mark_clean', { unit_id: id, staff_id: activeStaff.id });
      await updateLocalUnitStatus(id, 'clean');
    }
    Alert.alert('Success', 'Marked as clean.');
    fetchRoomDetails();
  };

  const handleSetMaintenance = async () => {
    if (await isOnline()) {
      const { error } = await supabase.rpc('set_unit_maintenance', {
        p_unit_id: id,
        p_staff_id: activeStaff?.id || null
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('set_maintenance', { unit_id: id, staff_id: activeStaff?.id || null });
      await updateLocalUnitStatus(id, 'maintenance');
    }
    Alert.alert('Success', 'Room set to maintenance.');
    fetchRoomDetails();
  };

  const handleReportIssue = async () => {
    if (!activeStaff) return;
    const issueId = Crypto.randomUUID();
    
    if (await isOnline()) {
      const { error } = await supabase.rpc('report_issue', {
        p_issue_id: issueId,
        p_unit_id: id,
        p_stay_id: currentStay?.id || null,
        p_category: issueCategory,
        p_note: issueNote || null,
        p_staff_id: activeStaff.id
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('report_issue', {
        id: issueId,
        issue_id: issueId,
        property_id: unit.property_id,
        unit_id: id,
        stay_id: currentStay?.id || null,
        category: issueCategory,
        note: issueNote || null,
        staff_id: activeStaff.id
      });
    }
    
    setShowIssueModal(false);
    setIssueNote('');
    Alert.alert('Success', 'Issue reported.');
    fetchRoomDetails();
  };

  if (loading || !unit) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const statusColors: any = {
    clean: '#10b981',
    dirty: '#f59e0b',
    maintenance: '#ef4444'
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.roomLabel}>{unit.rooms.label} - {unit.label}</Text>
          <Text style={styles.floorText}>Floor {unit.rooms.floor || 'G'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[unit.housekeeping_status] + '20' }]}>
          <Text style={[styles.statusText, { color: statusColors[unit.housekeeping_status] }]}>
            {unit.housekeeping_status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable 
          style={[styles.tab, tab === 'overview' && styles.tabActive]} 
          onPress={() => setTab('overview')}>
          <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>Overview</Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, tab === 'history' && styles.tabActive]} 
          onPress={() => setTab('history')}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
        </Pressable>
      </View>

      {tab === 'overview' ? (
        <>
          {/* Current Guest */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Guest</Text>
            {currentStay ? (
              <View>
                <Text style={styles.guestName}>{currentStay.guests.name}</Text>
                <Text style={styles.guestInfo}>{currentStay.guests.phone || 'No phone'}</Text>
                <Text style={styles.guestInfo}>Check-in: {new Date(currentStay.check_in).toLocaleDateString()}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>Bed is empty</Text>
            )}
          </View>

          {/* Housekeeping */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Housekeeping</Text>
            <Text style={styles.infoText}>
              Last Cleaned: {unit.last_cleaned_at ? new Date(unit.last_cleaned_at).toLocaleString() : 'Never'}
            </Text>
            
            <View style={styles.btnRow}>
              {unit.housekeeping_status !== 'clean' && can('mark_clean') && (
                <Pressable style={styles.actionBtn} onPress={handleMarkClean}>
                  <Text style={styles.actionBtnText}>Mark Clean</Text>
                </Pressable>
              )}
              {unit.housekeeping_status !== 'maintenance' && can('set_maintenance') && (
                <Pressable style={[styles.actionBtn, styles.maintBtn]} onPress={handleSetMaintenance}>
                  <Text style={styles.actionBtnText}>Set Maintenance</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Issues */}
          <View style={styles.card}>
            <View style={styles.issueHeader}>
              <Text style={styles.cardTitle}>Open Issues ({issues.length})</Text>
              <Pressable onPress={() => setShowIssueModal(true)}>
                <Text style={styles.addIssueBtn}>+ Report Issue</Text>
              </Pressable>
            </View>

            {issues.length === 0 ? (
              <Text style={styles.emptyText}>No open issues. Good job!</Text>
            ) : (
              issues.map(issue => (
                <View key={issue.id} style={styles.issueItem}>
                  <Text style={styles.issueCategory}>{issue.category.toUpperCase()}</Text>
                  <Text style={styles.issueNote}>{issue.note}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        /* History Timeline */
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Room History</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No history yet.</Text>
          ) : (
            history.map((item, index) => (
              <View key={index} style={styles.historyItem}>
                <View style={[styles.historyDot, { backgroundColor: item.type === 'stay' ? '#f59e0b' : '#10b981' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDetails}>{item.details}</Text>
                  <Text style={styles.historyDate}>{new Date(item.date).toLocaleString()}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Report Issue Modal */}
      <Modal visible={showIssueModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report an Issue</Text>
            
            <View style={styles.categoryGrid}>
              {(['ac', 'water', 'noise', 'cleanliness', 'electrical', 'other'] as const).map(cat => (
                <Pressable 
                  key={cat} 
                  style={[styles.catChip, issueCategory === cat && styles.catChipActive]}
                  onPress={() => setIssueCategory(cat)}
                >
                  <Text style={[styles.catText, issueCategory === cat && styles.catTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Describe the issue..."
              value={issueNote}
              onChangeText={setIssueNote}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowIssueModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={handleReportIssue}>
                <Text style={styles.submitBtnText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  roomLabel: { fontSize: 22, fontWeight: 'bold' },
  floorText: { color: '#64748b', marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  guestName: { fontSize: 18, fontWeight: '600' },
  guestInfo: { color: '#64748b', marginTop: 4 },
  emptyText: { color: '#94a3b8', fontStyle: 'italic' },
  infoText: { color: '#64748b', marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#10b981', padding: 12, borderRadius: 8, alignItems: 'center' },
  maintBtn: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontWeight: 'bold' },
  issueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addIssueBtn: { color: '#2563eb', fontWeight: 'bold' },
  issueItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  issueCategory: { fontSize: 12, fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase' },
  issueNote: { marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 20 },
  catChipActive: { backgroundColor: '#2563eb' },
  catText: { color: '#64748b', textTransform: 'capitalize' },
  catTextActive: { color: '#fff', fontWeight: 'bold' },
  noteInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, height: 80, textAlignVertical: 'top' },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#64748b', fontWeight: 'bold' },
  submitBtn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb' },
  submitBtnText: { color: '#fff', fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#2563eb' },
  tabText: { color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#2563eb' },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  historyDot: { width: 10, height: 10, borderRadius: 5 },
  historyDetails: { fontSize: 15, fontWeight: '500' },
  historyDate: { fontSize: 12, color: '#94a3b8', marginTop: 2 }
});