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
  LayoutAnimation,
  KeyboardAvoidingView,
  Platform
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
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { StayService } from '@/services/stay.service';

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeStaff, can } = useStaff();
  const theme = useTheme();

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
  const [submittingOwnerAction, setSubmittingOwnerAction] = useState(false);

  // Stay Operations States (Extend & Move)
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendNights, setExtendNights] = useState<number>(1);
  const [extendAmount, setExtendAmount] = useState<string>('500');
  const [extendPayMode, setExtendPayMode] = useState<'cash' | 'upi' | 'pay_later'>('pay_later');
  const [submittingExtend, setSubmittingExtend] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [vacantUnits, setVacantUnits] = useState<any[]>([]);
  const [selectedMoveUnit, setSelectedMoveUnit] = useState<string | null>(null);
  const [submittingMove, setSubmittingMove] = useState(false);

  const handleOpenMoveModal = async () => {
    try {
      const { data: unitsData } = await supabase
        .from('units')
        .select('id, name, gender_rule, rooms(id, label, floor, floor_no)')
        .is('archived_at', null);

      const { data: occupiedStays } = await supabase
        .from('stays')
        .select('unit_id')
        .eq('status', 'checked_in');

      const occupiedIds = new Set((occupiedStays || []).map((s: any) => s.unit_id));
      const free = (unitsData || []).filter((u: any) => u.id !== id && !occupiedIds.has(u.id));
      setVacantUnits(free);
      setSelectedMoveUnit(free.length > 0 ? free[0].id : null);
      setShowMoveModal(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load available beds.');
    }
  };

  const handleExecuteExtendStay = async () => {
    if (!currentStay) return;
    const addNights = Number(extendNights) || 1;
    const addAmt = parseFloat(extendAmount) || 0;

    setSubmittingExtend(true);
    try {
      await StayService.extendStay(currentStay.id, addNights, addAmt, extendPayMode);
      Alert.alert('Stay Extended', `Guest stay has been extended by ${addNights} night(s).`);
      setShowExtendModal(false);
      fetchRoomDetails();
    } catch (err: any) {
      Alert.alert('Extend Error', err.message || 'Could not extend stay.');
    } finally {
      setSubmittingExtend(false);
    }
  };

  const handleExecuteMoveStay = async () => {
    if (!currentStay || !selectedMoveUnit) return;

    setSubmittingMove(true);
    try {
      await StayService.moveStay(currentStay.id, selectedMoveUnit);
      Alert.alert('Bed Transferred', 'Guest has been moved to new room/bed. Current bed marked dirty.');
      setShowMoveModal(false);
      router.replace(`/room/${selectedMoveUnit}`);
    } catch (err: any) {
      Alert.alert('Transfer Error', err.message || 'Could not transfer guest.');
    } finally {
      setSubmittingMove(false);
    }
  };

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
    if (!(await isOnline())) return Alert.alert('Online Required', 'Room editing requires an internet connection.');

    try {
      setSubmittingOwnerAction(true);
      const { error } = await supabase.rpc('update_room', {
        p_room_id: unit.rooms.id,
        p_label: editLabel.trim(),
        p_floor: floorLabel(editFloorNo),
        p_gender_rule: unit.gender_rule || null,
        p_staff_id: activeStaff?.id,
        p_floor_no: editFloorNo
      });

      if (error) return Alert.alert('Update Failed', error.message);
      Alert.alert('Success', 'Room updated.');
      setShowEditModal(false);
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
      'Are you sure you want to remove or archive this room and its units? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: executeRemoveRoom
        }
      ]
    );
  };

  const executeRemoveRoom = async () => {
    if (!(await isOnline())) return Alert.alert('Online Required', 'Room removal requires an internet connection.');

    try {
      setSubmittingOwnerAction(true);
      const { data: result, error } = await supabase.rpc('remove_room', {
        p_room_id: unit.rooms.id,
        p_staff_id: activeStaff?.id
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
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // Section 3F: Standardized bed state evaluation
  const currentState: BedState = bedState(unit, new Set(currentStay ? [unit.id] : []));
  const isDorm = unit.rooms?.kind === 'dorm';

  const stateTheme = {
    clean: { bg: theme.freeSubtle, text: theme.free, dot: theme.free, label: 'Clean & Available' },
    occupied: { bg: theme.occupiedSubtle, text: theme.occupied, dot: theme.occupied, label: 'Occupied' },
    dirty: { bg: theme.dirtySubtle, text: theme.dirty, dot: theme.dirty, label: 'Needs Cleaning' },
    maintenance: { bg: theme.maintenanceSubtle, text: theme.maintenance, dot: theme.maintenance, label: 'Maintenance' }
  }[currentState] || { bg: theme.surfaceSubtle, text: theme.textSecondary, dot: theme.textSecondary, label: currentState };

  const guest = currentStay?.guests;
  const guestName = Array.isArray(guest) ? guest[0]?.name : guest?.name;
  const guestPhone = Array.isArray(guest) ? guest[0]?.phone : guest?.phone;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={unit.rooms?.label ? `${unit.rooms.label} • ${unit.label}` : unit.label}
        subtitle={`${isDorm ? 'Dorm Bed' : 'Private Room'} • Floor ${unit.rooms?.floor || 'G'}`}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* ── HERO BED CARD ────────────────────────────────────────── */}
        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroIconBox, { backgroundColor: theme.accentSubtle }]}>
              <MaterialCommunityIcons
                name={isDorm ? "bunk-bed-outline" : "bed-king-outline"}
                size={26}
                color={theme.accent}
              />
            </View>
            <View style={styles.heroTitleGroup}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>
                {unit.rooms?.label ? `${unit.rooms.label} - ${unit.label}` : unit.label}
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
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
          <View style={[styles.housekeepingInfoRow, { borderTopColor: theme.borderSubtle }]}>
            <Ionicons name="sparkles-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.housekeepingInfoText, { color: theme.textSecondary }]}>
              Last cleaned: {unit.last_cleaned_at ? new Date(unit.last_cleaned_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No cleaning record'}
            </Text>
          </View>

          {/* Quick Housekeeping Action Buttons */}
          <View style={styles.actionRow}>
            {unit.housekeeping_status !== 'clean' && can('mark_clean') && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: theme.free }]}
                onPress={handleMarkClean}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={16} color="#ffffff" />
                <Text style={styles.quickBtnText}>Mark Clean</Text>
              </TouchableOpacity>
            )}

            {unit.housekeeping_status !== 'maintenance' && can('set_maintenance') && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: theme.maintenance }]}
                onPress={handleSetMaintenance}
                activeOpacity={0.8}
              >
                <Ionicons name="construct-outline" size={15} color="#ffffff" />
                <Text style={styles.quickBtnText}>Maintenance</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.border, borderWidth: 1 }]}
              onPress={() => setShowIssueModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={15} color={theme.accentText} />
              <Text style={[styles.quickBtnText, { color: theme.accentText }]}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SEGMENTED TAB SELECTOR (iOS Segmented Control HIG) ───────── */}
        <View style={[styles.tabContainer, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
          <Pressable
            style={[
              styles.tabButton,
              tab === 'overview' && [styles.tabButtonActive, { backgroundColor: theme.surface }]
            ]}
            onPress={() => switchTab('overview')}
          >
            <Ionicons
              name="grid-outline"
              size={15}
              color={tab === 'overview' ? theme.accentText : theme.textSecondary}
            />
            <Text style={[
              styles.tabText,
              { color: tab === 'overview' ? theme.accentText : theme.textSecondary, fontWeight: tab === 'overview' ? '700' : '500' }
            ]}>
              Overview & Status
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabButton,
              tab === 'history' && [styles.tabButtonActive, { backgroundColor: theme.surface }]
            ]}
            onPress={() => switchTab('history')}
          >
            <Ionicons
              name="time-outline"
              size={15}
              color={tab === 'history' ? theme.accentText : theme.textSecondary}
            />
            <Text style={[
              styles.tabText,
              { color: tab === 'history' ? theme.accentText : theme.textSecondary, fontWeight: tab === 'history' ? '700' : '500' }
            ]}>
              Activity History
            </Text>
          </Pressable>
        </View>

        {tab === 'overview' ? (
          <>
            {/* ── CURRENT OCCUPANT CARD ────────────────────────────── */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
                <Ionicons name="person-outline" size={18} color={theme.accentText} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>Current Occupant</Text>
              </View>

              {currentStay ? (
                <View>
                  <View style={styles.guestRow}>
                    <View style={[styles.guestAvatar, { backgroundColor: theme.accentSubtle }]}>
                      <Text style={[styles.guestAvatarText, { color: theme.accentText }]}>
                        {(guestName || 'G').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.guestInfo}>
                      <Text style={[styles.guestName, { color: theme.text }]}>{guestName || 'Registered Guest'}</Text>
                      {activeStaff?.role !== 'housekeeping' && guestPhone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="call-outline" size={13} color={theme.textSecondary} />
                          <Text style={[styles.guestPhone, { color: theme.textSecondary }]}>{guestPhone}</Text>
                        </View>
                      ) : null}
                      {activeStaff?.role !== 'housekeeping' && (
                        <Text style={[styles.guestCheckinDate, { color: theme.textTertiary }]}>
                          Checked in: {new Date(currentStay.check_in).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      )}
                      {activeStaff?.role !== 'housekeeping' && currentStay.expected_checkout ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons
                            name={new Date(currentStay.expected_checkout) < new Date() ? "alert-circle" : "time-outline"}
                            size={13}
                            color={new Date(currentStay.expected_checkout) < new Date() ? theme.destructive : theme.textSecondary}
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              color: new Date(currentStay.expected_checkout) < new Date() ? theme.destructive : theme.textSecondary,
                              fontWeight: new Date(currentStay.expected_checkout) < new Date() ? "700" : "500"
                            }}
                          >
                            {new Date(currentStay.expected_checkout) < new Date() ? "OVERDUE · " : "Expected Checkout: "}
                            {new Date(currentStay.expected_checkout).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {activeStaff?.role !== 'housekeeping' && (
                    <>
                      <TouchableOpacity
                        style={[styles.folioActionBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}
                        onPress={() => router.push(`/guest/${currentStay.guest_id}?stayId=${currentStay.id}`)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="receipt-outline" size={16} color={theme.accentText} />
                        <Text style={[styles.folioActionText, { color: theme.accentText }]}>View Guest Folio & Payments</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.accentText} style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.folioActionBtn, { flex: 1, backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle, marginTop: 0 }]}
                          onPress={() => setShowExtendModal(true)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="calendar-outline" size={16} color={theme.accentText} />
                          <Text style={[styles.folioActionText, { color: theme.accentText }]}>Extend Stay</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.folioActionBtn, { flex: 1, backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle, marginTop: 0 }]}
                          onPress={handleOpenMoveModal}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="swap-horizontal-outline" size={16} color={theme.accentText} />
                          <Text style={[styles.folioActionText, { color: theme.accentText }]}>Move Bed</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.vacantState}>
                  <View style={[styles.vacantIconBox, { backgroundColor: theme.freeSubtle }]}>
                    <Ionicons name="bed-outline" size={32} color={theme.free} />
                  </View>
                  <Text style={[styles.vacantTitle, { color: theme.text }]}>Bed is Currently Vacant</Text>
                  <Text style={[styles.vacantSubtitle, { color: theme.textSecondary }]}>
                    Ready for walk-in or booked guest check-in.
                  </Text>
                  {can('check_in') && (
                    <TouchableOpacity
                      style={[styles.checkinShortcutBtn, { backgroundColor: theme.free }]}
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
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
                <Ionicons name="alert-circle-outline" size={18} color="#d97706" />
                <Text style={[styles.cardTitle, { color: theme.text }]}>Open Issues ({issues.length})</Text>
                <TouchableOpacity
                  style={[styles.reportIssueLink, { backgroundColor: '#fef3c7' }]}
                  onPress={() => setShowIssueModal(true)}
                >
                  <Text style={[styles.reportIssueLinkText, { color: '#d97706' }]}>+ Report</Text>
                </TouchableOpacity>
              </View>

              {issues.length === 0 ? (
                <View style={[styles.noIssuesBox, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#16a34a" />
                  <Text style={[styles.noIssuesText, { color: '#16a34a' }]}>No open issues reported for this room.</Text>
                </View>
              ) : (
                issues.map(issue => (
                  <View key={issue.id} style={[styles.issueItem, { borderBottomColor: theme.borderSubtle }]}>
                    <View style={styles.issueTopLine}>
                      <View style={[styles.issueCategoryChip, { backgroundColor: theme.destructiveSubtle }]}>
                        <Text style={[styles.issueCategoryText, { color: theme.destructive }]}>{issue.category.toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.issueTime, { color: theme.textTertiary }]}>
                        {new Date(issue.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={[styles.issueNote, { color: theme.textSecondary }]}>{issue.note || 'No description provided'}</Text>
                  </View>
                ))
              )}
            </View>

            {/* ── OWNER ACTIONS CARD ───────────────────────────────── */}
            {activeStaff?.role === 'owner' && (
              <View style={[styles.ownerCard, { backgroundColor: theme.destructiveSubtle, borderColor: theme.destructive }]}>
                <View style={styles.ownerHeader}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={theme.destructive} />
                  <Text style={[styles.ownerTitle, { color: theme.destructive }]}>OWNER ROOM ACTIONS</Text>
                </View>
                <Text style={[styles.ownerDescription, { color: theme.textSecondary }]}>
                  Rename label, change floor allocation, or archive room.
                </Text>
                <View style={styles.ownerBtnRow}>
                  <TouchableOpacity
                    style={[styles.ownerEditBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => setShowEditModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={16} color={theme.text} />
                    <Text style={[styles.ownerEditBtnText, { color: theme.text }]}>Edit Room</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ownerRemoveBtn, { backgroundColor: theme.destructive }]}
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
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="timer-outline" size={18} color={theme.accentText} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Activity History Timeline</Text>
            </View>

            {history.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No activity recorded yet.</Text>
            ) : (
              history.map((item, idx) => (
                <View key={idx} style={[styles.historyItem, { borderBottomColor: theme.borderSubtle }]}>
                  <View style={[styles.historyIcon, { backgroundColor: item.type === 'clean' ? theme.freeSubtle : theme.accentSubtle }]}>
                    {item.type === 'clean' ? (
                      <Ionicons name="sparkles" size={14} color={theme.free} />
                    ) : (
                      <MaterialCommunityIcons name="door-open" size={16} color={theme.accentText} />
                    )}
                  </View>
                  <View style={styles.historyContent}>
                    <Text style={[styles.historyDetails, { color: theme.text }]}>{item.details}</Text>
                    <Text style={[styles.historyDate, { color: theme.textTertiary }]}>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalContent, { backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.modalTopHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Report Room Issue</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Select Category</Text>
            <View style={styles.categoryGrid}>
              {(['ac', 'water', 'cleanliness', 'electrical', 'noise', 'other'] as const).map(cat => (
                <Pressable
                  key={cat}
                  style={[
                    styles.catChip,
                    { backgroundColor: theme.surfaceSubtle, borderWidth: 1, borderColor: theme.border },
                    issueCategory === cat && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setIssueCategory(cat)}
                >
                  <Text style={[styles.catText, { color: issueCategory === cat ? '#ffffff' : theme.textSecondary }]}>
                    {cat.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Issue Details / Note</Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. AC remote display not responding, water pressure low..."
              placeholderTextColor={theme.textTertiary}
              value={issueNote}
              onChangeText={setIssueNote}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceSubtle }]}
                onPress={() => setShowIssueModal(false)}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.accent }]}
                onPress={handleReportIssue}
              >
                <Text style={styles.submitBtnText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── OWNER ROOM MANAGEMENT MODAL ────────────────────────────── */}
      <Modal visible={showEditModal} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalContent, { backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.modalTopHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Room Details</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Room Label</Text>
            <TextInput
              style={[styles.singleInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              value={editLabel}
              onChangeText={setEditLabel}
              placeholder="e.g. 101"
              placeholderTextColor={theme.textTertiary}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Floor Location</Text>
            <View style={[styles.stepperContainer, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <TouchableOpacity 
                style={[styles.stepperBtn, { backgroundColor: theme.surface }, editFloorNo <= -2 && { opacity: 0.45 }]} 
                onPress={() => setEditFloorNo(prev => Math.max(-2, prev - 1))}
                disabled={editFloorNo <= -2}
              >
                <Ionicons name="remove" size={18} color={editFloorNo <= -2 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>
              <View style={styles.stepperValueBox}>
                <Text style={[styles.stepperFloorTitle, { color: theme.text }]}>{floorLabel(editFloorNo)}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.stepperBtn, { backgroundColor: theme.surface }, editFloorNo >= 60 && { opacity: 0.45 }]} 
                onPress={() => setEditFloorNo(prev => Math.min(60, prev + 1))}
                disabled={editFloorNo >= 60}
              >
                <Ionicons name="add" size={18} color={editFloorNo >= 60 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.quickFloorChips}>
              {[-1, 0, 1, 2, 3].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.quickChip,
                    { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                    editFloorNo === f && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setEditFloorNo(f)}
                >
                  <Text style={[styles.quickChipText, { color: editFloorNo === f ? '#ffffff' : theme.textSecondary }]}>
                    {f === -1 ? 'Basement' : f === 0 ? 'Ground' : `Floor ${f}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceSubtle }]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.destructive }]}
                onPress={handleRemoveRoom}
                disabled={submittingOwnerAction}
              >
                <Text style={styles.submitBtnText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.accent }]}
                onPress={handleSaveRoomEdit}
                disabled={submittingOwnerAction}
              >
                <Text style={styles.submitBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Extend Stay */}
      <Modal visible={showExtendModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>Extend Guest Stay</Text>
              <TouchableOpacity onPress={() => setShowExtendModal(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
              Add nights to {guestName || 'guest'}&apos;s current reservation.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>Additional Nights</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 5, 7].map(n => (
                <TouchableOpacity
                  key={n}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: extendNights === n ? theme.accent : theme.surfaceSubtle,
                    alignItems: 'center'
                  }}
                  onPress={() => setExtendNights(n)}
                >
                  <Text style={{ color: extendNights === n ? '#ffffff' : theme.text, fontWeight: '700', fontSize: 13 }}>
                    +{n}N
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>Additional Amount (₹)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceSubtle, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textSecondary, marginRight: 6 }}>₹</Text>
              <TextInput
                style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: theme.text }}
                value={extendAmount}
                onChangeText={setExtendAmount}
                keyboardType="numeric"
              />
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>Payment Mode</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {[
                { id: 'cash', label: 'Cash' },
                { id: 'upi', label: 'UPI' },
                { id: 'pay_later', label: 'Pay Later' }
              ].map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: extendPayMode === p.id ? theme.accent : theme.surfaceSubtle,
                    alignItems: 'center'
                  }}
                  onPress={() => setExtendPayMode(p.id as any)}
                >
                  <Text style={{ color: extendPayMode === p.id ? '#ffffff' : theme.text, fontWeight: '600', fontSize: 12 }}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center' }}
                onPress={() => setShowExtendModal(false)}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center' }}
                onPress={handleExecuteExtendStay}
                disabled={submittingExtend}
              >
                {submittingExtend ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm Extension</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Move Bed / Room */}
      <Modal visible={showMoveModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>Transfer Guest Bed/Room</Text>
              <TouchableOpacity onPress={() => setShowMoveModal(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
              Select a vacant room or bed to transfer {guestName || 'guest'}:
            </Text>

            {vacantUnits.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Ionicons name="alert-circle-outline" size={32} color={theme.textTertiary} />
                <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 8 }}>
                  No other vacant beds or rooms available.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 260, marginBottom: 16 }}>
                {vacantUnits.map(u => {
                  const isSelected = selectedMoveUnit === u.id;
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: isSelected ? theme.accent + '20' : theme.surfaceSubtle,
                        borderColor: isSelected ? theme.accent : theme.border,
                        borderWidth: 1,
                        marginBottom: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onPress={() => setSelectedMoveUnit(u.id)}
                    >
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                          {u.rooms?.label || 'Room'} · {u.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                          {floorLabel(u.rooms?.floor_no)}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color={theme.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center' }}
                onPress={() => setShowMoveModal(false)}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center' }}
                onPress={handleExecuteMoveStay}
                disabled={submittingMove || vacantUnits.length === 0}
              >
                {submittingMove ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm Transfer</Text>
                )}
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
    flexGrow: 1,
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
    fontFamily: Fonts.serif,
    fontSize: 19,
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
    fontWeight: '500',
    fontVariant: ['tabular-nums']
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
    backgroundColor: '#3A5A3E'
  },
  maintBtn: {
    backgroundColor: '#3F3F46'
  },
  issueBtn: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a'
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
    fontFamily: Fonts.serif,
    fontSize: 16,
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
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb'
  },
  guestInfo: {
    flex: 1
  },
  guestName: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  guestPhone: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  guestCheckinDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontVariant: ['tabular-nums']
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
    backgroundColor: '#E7ECE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  vacantTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
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
    color: '#d97706',
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
    color: '#16a34a',
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
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  issueCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d97706'
  },
  issueTime: {
    fontSize: 11,
    color: '#64748b',
    fontVariant: ['tabular-nums']
  },
  issueNote: {
    fontSize: 13,
    color: '#475569'
  },
  ownerCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
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
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    letterSpacing: 1.0
  },
  ownerDescription: {
    fontSize: 12,
    color: '#475569',
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
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    borderRadius: 10
  },
  ownerEditBtnText: {
    color: '#475569',
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
    color: '#64748b',
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
    backgroundColor: '#E7ECE7'
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
    color: '#64748b',
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    fontFamily: Fonts.serif,
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a'
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
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
    color: '#475569',
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
    color: '#475569',
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
    fontFamily: Fonts.serif,
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