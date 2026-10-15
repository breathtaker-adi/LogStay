// src/app/room/[id].tsx
// Unit Detail, Maintenance Controls, History Timeline, and Owner Room Management
// High-fidelity UI with Hero Bed Card, Housekeeping Actions, Folio Shortcut, and Modals

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  LayoutAnimation
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, saveToOutbox, updateLocalUnitStatus } from '@/lib/offline';
import { bedState, BedState } from '@/lib/bed-state';
import * as Crypto from 'expo-crypto';
import { ScreenHeader } from '@/lib/screen-header';
import { floorLabel, resolveFloorNo } from '@/lib/floors';

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

  // Owner Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editFloorNo, setEditFloorNo] = useState<number>(0);
  const [ownerPin, setOwnerPin] = useState('');
  const [submittingOwnerAction, setSubmittingOwnerAction] = useState(false);

  const fetchRoomDetails = useCallback(async () => {
    setLoading(true);

    try {
      // 1. Fetch Unit + Room details
      const { data: unitData, error: unitError } = await supabase
        .from('units')
        .select(`*, rooms ( id, label, floor, floor_no, kind, property_id )`)
        .eq('id', id)
        .is('archived_at', null)
        .single();

      if (unitError || !unitData) {
        Alert.alert('Error', 'Room not found or has been archived.');
        router.back();
        return;
      }
      setUnit(unitData);
      setEditLabel(unitData.rooms?.label || '');
      setEditFloorNo(resolveFloorNo(unitData.rooms) ?? 0);

      // 2. Fetch active stay for this unit
      const { data: stayData } = await supabase
        .from('stays')
        .select(`*, guests ( name, phone, nationality )`)
        .eq('unit_id', id)
        .eq('status', 'checked_in')
        .maybeSingle();
      setCurrentStay(stayData);

      // 3. Fetch open issues for this unit
      const { data: issuesData } = await supabase
        .from('issues')
        .select('*')
        .eq('unit_id', id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      setIssues(issuesData || []);

      // 4. Fetch History (Past stays & Housekeeping logs)
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
    } catch (err: any) {
      console.error('Error fetching room details:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRoomDetails();
  }, [fetchRoomDetails]);

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
    }
    await updateLocalUnitStatus(id, 'clean');
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
    }
    await updateLocalUnitStatus(id, 'maintenance');
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
        issue_id: issueId,
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

  // Section 3C: Edit Room (Owner only)
  const handleSaveRoomEdit = async () => {
    if (!editLabel.trim()) return Alert.alert('Validation', 'Room name is required.');
    if (!ownerPin.trim()) return Alert.alert('Security', 'Owner PIN is required.');
    if (!(await isOnline())) return Alert.alert('Online Required', 'Room editing requires an internet connection.');

    try {
      setSubmittingOwnerAction(true);
      const { error } = await supabase.rpc('update_room', {
        p_room_id: unit.rooms.id,
        p_label: editLabel.trim(),
        p_floor: floorLabel(editFloorNo),
        p_gender_rule: unit.gender_rule || null,
        p_staff_id: activeStaff?.id,
        p_owner_pin: ownerPin.trim(),
        p_floor_no: editFloorNo
      });

      if (error) return Alert.alert('Update Failed', error.message);
      Alert.alert('Success', 'Room updated.');
      setShowEditModal(false);
      setOwnerPin('');
      fetchRoomDetails();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingOwnerAction(false);
    }
  };

  // Section 3C: Remove Room (Owner only)
  const handleRemoveRoom = () => {
    if (currentStay) {
      return Alert.alert('Blocked', 'Cannot remove room while a guest is currently checked in.');
    }

    Alert.alert(
      'Remove Room Confirmation',
      'This will remove or archive this room and its units. Enter your Owner PIN in the confirmation dialog.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm with PIN',
          onPress: () => setShowEditModal(true)
        }
      ]
    );
  };

  const executeRemoveRoom = async () => {
    if (!ownerPin.trim()) return Alert.alert('Security', 'Owner PIN is required.');
    if (!(await isOnline())) return Alert.alert('Online Required', 'Room removal requires an internet connection.');

    try {
      setSubmittingOwnerAction(true);
      const { data: result, error } = await supabase.rpc('remove_room', {
        p_room_id: unit.rooms.id,
        p_staff_id: activeStaff?.id,
        p_owner_pin: ownerPin.trim()
      });

      if (error) return Alert.alert('Removal Failed', error.message);
      Alert.alert('Room Removed', result === 'archived' ? 'Room was safely archived.' : 'Room was permanently deleted.');
      setShowEditModal(false);
      router.replace('/rooms');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingOwnerAction(false);
    }
  };

  const switchTab = (nextTab: 'overview' | 'history') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTab(nextTab);
  };

  if (loading || !unit) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Section 3F: Standardized bed state evaluation
  const currentState: BedState = bedState(unit, new Set(currentStay ? [unit.id] : []));
  const isDorm = unit.rooms?.kind === 'dorm';

  const stateTheme = {
    clean: { bg: '#dcfce7', text: '#166534', dot: '#16a34a', label: 'Clean & Available' },
    occupied: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626', label: 'Occupied' },
    dirty: { bg: '#fffbeb', text: '#92400e', dot: '#d97706', label: 'Needs Cleaning' },
    maintenance: { bg: '#f1f5f9', text: '#334155', dot: '#64748b', label: 'Maintenance' }
  }[currentState] || { bg: '#f1f5f9', text: '#334155', dot: '#64748b', label: currentState };

  const guest = currentStay?.guests;
  const guestName = Array.isArray(guest) ? guest[0]?.name : guest?.name;
  const guestPhone = Array.isArray(guest) ? guest[0]?.phone : guest?.phone;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={unit.rooms?.label ? `${unit.rooms.label} • ${unit.label}` : unit.label}
        subtitle={`${isDorm ? 'Dorm Bed' : 'Private Room'} • Floor ${unit.rooms?.floor || 'G'}`}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO BED CARD ────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconBox}>
              <MaterialCommunityIcons
                name={isDorm ? "bunk-bed-outline" : "bed-king-outline"}
                size={26}
                color="#2563eb"
              />
            </View>
            <View style={styles.heroTitleGroup}>
              <Text style={styles.heroTitle}>
                {unit.rooms?.label ? `${unit.rooms.label} - ${unit.label}` : unit.label}
              </Text>
              <Text style={styles.heroSubtitle}>
                {isDorm ? 'Dormitory Unit' : 'Private Suite'} • Floor {unit.rooms?.floor || 'Ground'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: stateTheme.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: stateTheme.dot }]} />
              <Text style={[styles.statusBadgeText, { color: stateTheme.text }]}>
                {stateTheme.label}
              </Text>
            </View>
          </View>

          {/* Housekeeping Info Bar */}
          <View style={styles.housekeepingInfoRow}>
            <Ionicons name="sparkles-outline" size={14} color="#64748b" />
            <Text style={styles.housekeepingInfoText}>
              Last cleaned: {unit.last_cleaned_at ? new Date(unit.last_cleaned_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No cleaning record'}
            </Text>
          </View>

          {/* Quick Housekeeping Action Buttons */}
          <View style={styles.actionRow}>
            {unit.housekeeping_status !== 'clean' && can('mark_clean') && (
              <TouchableOpacity
                style={[styles.quickBtn, styles.cleanBtn]}
                onPress={handleMarkClean}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={16} color="#ffffff" />
                <Text style={styles.quickBtnText}>Mark Clean</Text>
              </TouchableOpacity>
            )}

            {unit.housekeeping_status !== 'maintenance' && can('set_maintenance') && (
              <TouchableOpacity
                style={[styles.quickBtn, styles.maintBtn]}
                onPress={handleSetMaintenance}
                activeOpacity={0.8}
              >
                <Ionicons name="construct-outline" size={15} color="#ffffff" />
                <Text style={styles.quickBtnText}>Maintenance</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.quickBtn, styles.issueBtn]}
              onPress={() => setShowIssueModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={15} color="#1e40af" />
              <Text style={[styles.quickBtnText, { color: '#1e40af' }]}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SEGMENTED TAB SELECTOR ───────────────────────────────── */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tabButton, tab === 'overview' && styles.tabButtonActive]}
            onPress={() => switchTab('overview')}
          >
            <Ionicons
              name="grid-outline"
              size={15}
              color={tab === 'overview' ? '#2563eb' : '#64748b'}
            />
            <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>
              Overview & Status
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabButton, tab === 'history' && styles.tabButtonActive]}
            onPress={() => switchTab('history')}
          >
            <Ionicons
              name="time-outline"
              size={15}
              color={tab === 'history' ? '#2563eb' : '#64748b'}
            />
            <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
              Activity History
            </Text>
          </Pressable>
        </View>

        {tab === 'overview' ? (
          <>
            {/* ── CURRENT OCCUPANT CARD ────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-outline" size={18} color="#2563eb" />
                <Text style={styles.cardTitle}>Current Occupant</Text>
              </View>

              {currentStay ? (
                <View>
                  <View style={styles.guestRow}>
                    <View style={styles.guestAvatar}>
                      <Text style={styles.guestAvatarText}>
                        {(guestName || 'G').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.guestInfo}>
                      <Text style={styles.guestName}>{guestName || 'Registered Guest'}</Text>
                      {activeStaff?.role !== 'housekeeping' && guestPhone ? (
                        <Text style={styles.guestPhone}>📞 {guestPhone}</Text>
                      ) : null}
                      {activeStaff?.role !== 'housekeeping' && (
                        <Text style={styles.guestCheckinDate}>
                          Checked in: {new Date(currentStay.check_in).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      )}
                    </View>
                  </View>

                  {activeStaff?.role !== 'housekeeping' && (
                    <TouchableOpacity
                      style={styles.folioActionBtn}
                      onPress={() => router.push(`/guest/${currentStay.guest_id}?stayId=${currentStay.id}`)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="receipt-outline" size={16} color="#2563eb" />
                      <Text style={styles.folioActionText}>View Guest Folio & Payments</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2563eb" style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.vacantState}>
                  <View style={styles.vacantIconBox}>
                    <Ionicons name="bed-outline" size={32} color="#16a34a" />
                  </View>
                  <Text style={styles.vacantTitle}>Bed is Currently Vacant</Text>
                  <Text style={styles.vacantSubtitle}>
                    Ready for walk-in or booked guest check-in.
                  </Text>
                  {can('check_in') && (
                    <TouchableOpacity
                      style={styles.checkinShortcutBtn}
                      onPress={() => router.push('/checkin')}
                    >
                      <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                      <Text style={styles.checkinShortcutText}>Check-In Guest Here</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* ── OPEN ISSUES CARD ─────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="alert-circle-outline" size={18} color="#d97706" />
                <Text style={styles.cardTitle}>Open Issues ({issues.length})</Text>
                <TouchableOpacity
                  style={styles.reportIssueLink}
                  onPress={() => setShowIssueModal(true)}
                >
                  <Text style={styles.reportIssueLinkText}>+ Report</Text>
                </TouchableOpacity>
              </View>

              {issues.length === 0 ? (
                <View style={styles.noIssuesBox}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#16a34a" />
                  <Text style={styles.noIssuesText}>No open issues reported for this room.</Text>
                </View>
              ) : (
                issues.map(issue => (
                  <View key={issue.id} style={styles.issueItem}>
                    <View style={styles.issueTopLine}>
                      <View style={styles.issueCategoryChip}>
                        <Text style={styles.issueCategoryText}>{issue.category.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.issueTime}>
                        {new Date(issue.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={styles.issueNote}>{issue.note || 'No description provided'}</Text>
                  </View>
                ))
              )}
            </View>

            {/* ── OWNER ACTIONS CARD ───────────────────────────────── */}
            {activeStaff?.role === 'owner' && (
              <View style={styles.ownerCard}>
                <View style={styles.ownerHeader}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#be123c" />
                  <Text style={styles.ownerTitle}>OWNER ROOM ACTIONS</Text>
                </View>
                <Text style={styles.ownerDescription}>
                  Rename label, change floor allocation, or archive room.
                </Text>
                <View style={styles.ownerBtnRow}>
                  <TouchableOpacity
                    style={styles.ownerEditBtn}
                    onPress={() => setShowEditModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={16} color="#334155" />
                    <Text style={styles.ownerEditBtnText}>Edit Room</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ownerRemoveBtn}
                    onPress={handleRemoveRoom}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ffffff" />
                    <Text style={styles.ownerRemoveBtnText}>Remove Room</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        ) : (
          /* ── HISTORY TIMELINE ───────────────────────────────────── */
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="timer-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Activity History Timeline</Text>
            </View>

            {history.length === 0 ? (
              <Text style={styles.emptyText}>No activity recorded yet.</Text>
            ) : (
              history.map((item, idx) => (
                <View key={idx} style={styles.historyItem}>
                  <View style={[styles.historyIcon, item.type === 'clean' ? styles.historyCleanIcon : styles.historyStayIcon]}>
                    {item.type === 'clean' ? (
                      <Ionicons name="sparkles" size={14} color="#16a34a" />
                    ) : (
                      <MaterialCommunityIcons name="door-open" size={16} color="#2563eb" />
                    )}
                  </View>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyDetails}>{item.details}</Text>
                    <Text style={styles.historyDate}>
                      {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── REPORT ISSUE MODAL ─────────────────────────────────────── */}
      <Modal visible={showIssueModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTopHeader}>
              <Text style={styles.modalTitle}>Report Room Issue</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close-circle" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Select Category</Text>
            <View style={styles.categoryGrid}>
              {(['ac', 'water', 'cleanliness', 'electrical', 'noise', 'other'] as const).map(cat => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, issueCategory === cat && styles.catChipActive]}
                  onPress={() => setIssueCategory(cat)}
                >
                  <Text style={[styles.catText, issueCategory === cat && styles.catTextActive]}>
                    {cat.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Issue Details / Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. AC remote display not responding, water pressure low..."
              placeholderTextColor="#94a3b8"
              value={issueNote}
              onChangeText={setIssueNote}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowIssueModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleReportIssue}
              >
                <Text style={styles.submitBtnText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── OWNER ROOM MANAGEMENT MODAL ────────────────────────────── */}
      <Modal visible={showEditModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalTopHeader}>
              <Text style={styles.modalTitle}>Edit Room Details</Text>
              <TouchableOpacity onPress={() => { setShowEditModal(false); setOwnerPin(''); }}>
                <Ionicons name="close-circle" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Room Label</Text>
            <TextInput
              style={styles.singleInput}
              value={editLabel}
              onChangeText={setEditLabel}
              placeholder="e.g. 101"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Floor Location</Text>
            <View style={styles.stepperContainer}>
              <TouchableOpacity 
                style={[styles.stepperBtn, editFloorNo <= -2 && styles.stepperBtnDisabled]} 
                onPress={() => setEditFloorNo(prev => Math.max(-2, prev - 1))}
                disabled={editFloorNo <= -2}
              >
                <Ionicons name="remove" size={18} color={editFloorNo <= -2 ? "#cbd5e1" : "#1e293b"} />
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={styles.stepperFloorTitle}>{floorLabel(editFloorNo)}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.stepperBtn, editFloorNo >= 60 && styles.stepperBtnDisabled]} 
                onPress={() => setEditFloorNo(prev => Math.min(60, prev + 1))}
                disabled={editFloorNo >= 60}
              >
                <Ionicons name="add" size={18} color={editFloorNo >= 60 ? "#cbd5e1" : "#1e293b"} />
              </TouchableOpacity>
            </View>
            <View style={styles.quickFloorChips}>
              {[-1, 0, 1, 2, 3].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.quickChip, editFloorNo === f && styles.quickChipActive]}
                  onPress={() => setEditFloorNo(f)}
                >
                  <Text style={[styles.quickChipText, editFloorNo === f && styles.quickChipTextActive]}>
                    {f === -1 ? 'Basement' : f === 0 ? 'Ground' : `Floor ${f}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Owner PIN (Required)</Text>
            <TextInput
              style={styles.singleInput}
              value={ownerPin}
              onChangeText={setOwnerPin}
              placeholder="Enter Owner PIN"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowEditModal(false); setOwnerPin(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#dc2626' }]}
                onPress={executeRemoveRoom}
                disabled={submittingOwnerAction}
              >
                <Text style={styles.submitBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveRoomEdit}
                disabled={submittingOwnerAction}
              >
                <Text style={styles.submitBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  heroIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  heroTitleGroup: {
    flex: 1
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a'
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  housekeepingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  housekeepingInfoText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10
  },
  cleanBtn: {
    backgroundColor: '#16a34a'
  },
  maintBtn: {
    backgroundColor: '#d97706'
  },
  issueBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  quickBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10
  },
  tabButtonActive: {
    backgroundColor: '#eff6ff'
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '700'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  guestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  guestAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb'
  },
  guestInfo: {
    flex: 1
  },
  guestName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  guestPhone: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2
  },
  guestCheckinDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  folioActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  folioActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb'
  },
  vacantState: {
    alignItems: 'center',
    paddingVertical: 18
  },
  vacantIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  vacantTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4
  },
  vacantSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14
  },
  checkinShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  checkinShortcutText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  reportIssueLink: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  reportIssueLinkText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '700'
  },
  noIssuesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 10
  },
  noIssuesText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '500'
  },
  issueItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  issueTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  issueCategoryChip: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  issueCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b91c1c'
  },
  issueTime: {
    fontSize: 11,
    color: '#94a3b8'
  },
  issueNote: {
    fontSize: 13,
    color: '#334155'
  },
  ownerCard: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4
  },
  ownerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be123c',
    letterSpacing: 0.5
  },
  ownerDescription: {
    fontSize: 12,
    color: '#9f1239',
    marginBottom: 14
  },
  ownerBtnRow: {
    flexDirection: 'row',
    gap: 10
  },
  ownerEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    borderRadius: 10
  },
  ownerEditBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13
  },
  ownerRemoveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    borderRadius: 10
  },
  ownerRemoveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 14
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  historyCleanIcon: {
    backgroundColor: '#dcfce7'
  },
  historyStayIcon: {
    backgroundColor: '#eff6ff'
  },
  historyContent: {
    flex: 1
  },
  historyDetails: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a'
  },
  historyDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8
  },
  modalTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a'
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6
  },
  singleInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#f1f5f9',
    borderRadius: 20
  },
  catChipActive: {
    backgroundColor: '#2563eb'
  },
  catText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600'
  },
  catTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    height: 90,
    textAlignVertical: 'top',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontSize: 14
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2563eb'
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 6,
    marginBottom: 8
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepperBtnDisabled: {
    backgroundColor: '#f8fafc'
  },
  stepperValueBox: {
    flex: 1,
    alignItems: 'center'
  },
  stepperFloorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  quickFloorChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14
  },
  quickChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  quickChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569'
  },
  quickChipTextActive: {
    color: '#ffffff'
  }
});