// src/app/dorm/[roomId].tsx
// Dorm Bed Breakdown & Dorm Lifecycle Management
// Elevate UI with Dorm Hero Card, Status Pills, Bed Cards, and smooth modals

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, processOutbox, saveToOutbox } from '@/lib/offline';
import { bedState, BedState } from '@/lib/bed-state';
import * as Crypto from 'expo-crypto';
import { ScreenHeader } from '@/lib/screen-header';
import { floorLabel, resolveFloorNo } from '@/lib/floors';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

export default function DormDetailScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { activeStaff, can } = useStaff();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [room, setRoom] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [activeStaysMap, setActiveStaysMap] = useState<Record<string, any>>({});
  const [lastSynced, setLastSynced] = useState<string>('');

  // Maintenance & Issues States
  const [issues, setIssues] = useState<any[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueTargetUnitId, setIssueTargetUnitId] = useState<string>('');
  const [issueCategory, setIssueCategory] = useState<'ac' | 'water' | 'cleanliness' | 'electrical' | 'noise' | 'other'>('cleanliness');
  const [issueNote, setIssueNote] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // Edit Room Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editFloorNo, setEditFloorNo] = useState<number>(0);
  const [editGenderRule, setEditGenderRule] = useState<'any' | 'male' | 'female'>('any');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Add Bed State
  const [showAddBedModal, setShowAddBedModal] = useState(false);
  const [newBedLabel, setNewBedLabel] = useState('');

  const fetchDormData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch Room Info
      const { data: rData, error: rError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .is('archived_at', null)
        .single();

      if (rError || !rData) {
        Alert.alert('Error', 'Dorm room not found or has been archived.');
        router.back();
        return;
      }
      setRoom(rData);
      setEditLabel(rData.label);
      setEditFloorNo(resolveFloorNo(rData) ?? 0);

      // 2. Fetch Beds (Units)
      const { data: uData, error: uError } = await supabase
        .from('units')
        .select('*')
        .eq('room_id', roomId)
        .is('archived_at', null)
        .order('label');

      if (uError) throw uError;
      setUnits(uData || []);

      if (uData && uData.length > 0) {
        setEditGenderRule((uData[0].gender_rule as any) || 'any');
        const unitIds = uData.map(u => u.id);

        // 3. Fetch Active Stays for these beds
        const { data: staysData } = await supabase
          .from('stays')
          .select('id, unit_id, amount, pay_mode, guests ( name, phone )')
          .in('unit_id', unitIds)
          .eq('status', 'checked_in');

        const map: Record<string, any> = {};
        (staysData || []).forEach((s: any) => {
          map[s.unit_id] = s;
        });
        setActiveStaysMap(map);

        // 4. Fetch Open Issues for these beds
        const { data: issuesData } = await supabase
          .from('issues')
          .select('id, unit_id, category, note, created_at, status')
          .in('unit_id', unitIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false });

        setIssues(issuesData || []);
      }

      setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      console.error('Error fetching dorm data:', err);
      Alert.alert('Error', err.message || 'Failed to load dorm details');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchDormData();
  }, [fetchDormData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await processOutbox();
      await fetchDormData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchDormData]);

  // Section 3C: Edit Room (Owner only, Online-only)
  const handleSaveEdit = async () => {
    if (!editLabel.trim()) {
      return Alert.alert('Validation', 'Room label is required.');
    }
    if (!(await isOnline())) {
      return Alert.alert('Online Required', 'Room editing requires an internet connection.');
    }

    try {
      setSubmittingEdit(true);
      const { error } = await supabase.rpc('update_room', {
        p_room_id: roomId,
        p_label: editLabel.trim(),
        p_floor: floorLabel(editFloorNo),
        p_gender_rule: editGenderRule,
        p_staff_id: activeStaff?.id,
        p_floor_no: editFloorNo
      });

      if (error) {
        Alert.alert('Update Failed', error.message);
        return;
      }

      Alert.alert('Success', 'Dorm room updated successfully.');
      setShowEditModal(false);
      fetchDormData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Section 3C: Add Bed to Dorm
  const handleAddBed = async () => {
    if (!newBedLabel.trim()) {
      return Alert.alert('Validation', 'Bed label is required (e.g. Bed 5).');
    }
    if (!(await isOnline())) {
      return Alert.alert('Online Required', 'Adding beds requires an internet connection.');
    }

    try {
      setSubmittingEdit(true);
      const newUnitId = Crypto.randomUUID();
      const { error } = await supabase.rpc('add_beds', {
        p_room_id: roomId,
        p_unit_ids: [newUnitId],
        p_unit_labels: [newBedLabel.trim()],
        p_staff_id: activeStaff?.id
      });

      if (error) {
        Alert.alert('Add Bed Failed', error.message);
        return;
      }

      Alert.alert('Success', `Bed "${newBedLabel.trim()}" added.`);
      setShowAddBedModal(false);
      setNewBedLabel('');
      fetchDormData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Maintenance & Issue Handlers
  const handleToggleBedMaintenance = async (unitId: string, currentStatus: string) => {
    if (!can('set_maintenance')) {
      return Alert.alert('Unauthorized', 'You do not have permission to change maintenance status.');
    }
    const newStatus = currentStatus === 'maintenance' ? 'clean' : 'maintenance';
    const rpcName = newStatus === 'maintenance' ? 'set_unit_maintenance' : 'mark_unit_clean';

    try {
      if (await isOnline()) {
        const { error } = await supabase.rpc(rpcName, {
          p_unit_id: unitId,
          p_staff_id: activeStaff?.id || null
        });
        if (error) return Alert.alert('Error', error.message);
      } else {
        await saveToOutbox(newStatus === 'maintenance' ? 'set_maintenance' : 'mark_clean', {
          unit_id: unitId,
          staff_id: activeStaff?.id || null
        });
      }
      Alert.alert('Status Updated', `Bed marked as ${newStatus}.`);
      fetchDormData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleSetDormMaintenance = () => {
    if (!can('set_maintenance')) return;
    if (units.length === 0) return;

    Alert.alert(
      'Dorm Maintenance',
      'Set all vacant beds in this dorm to maintenance status?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set All to Maintenance',
          style: 'destructive',
          onPress: async () => {
            try {
              const vacantUnits = units.filter(u => !activeStaysMap[u.id]);
              for (const u of vacantUnits) {
                if (await isOnline()) {
                  await supabase.rpc('set_unit_maintenance', {
                    p_unit_id: u.id,
                    p_staff_id: activeStaff?.id || null
                  });
                } else {
                  await saveToOutbox('set_maintenance', { unit_id: u.id, staff_id: activeStaff?.id || null });
                }
              }
              Alert.alert('Success', 'Vacant beds set to maintenance.');
              fetchDormData();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const handleReportIssue = async () => {
    if (!activeStaff) return;
    const targetUnit = issueTargetUnitId || units[0]?.id;
    if (!targetUnit) {
      return Alert.alert('Error', 'No bed selected to attach issue to.');
    }

    setSubmittingIssue(true);
    const issueId = Crypto.randomUUID();
    const activeStay = activeStaysMap[targetUnit];

    try {
      if (await isOnline()) {
        const { error } = await supabase.rpc('report_issue', {
          p_issue_id: issueId,
          p_unit_id: targetUnit,
          p_stay_id: activeStay?.id || null,
          p_category: issueCategory,
          p_note: issueNote.trim() || null,
          p_staff_id: activeStaff.id
        });
        if (error) throw error;
      } else {
        await saveToOutbox('report_issue', {
          issue_id: issueId,
          unit_id: targetUnit,
          stay_id: activeStay?.id || null,
          category: issueCategory,
          note: issueNote.trim() || null,
          staff_id: activeStaff.id
        });
      }

      setShowIssueModal(false);
      setIssueNote('');
      Alert.alert('Issue Reported', 'The maintenance issue has been logged for this dorm.');
      fetchDormData();
    } catch (err: any) {
      Alert.alert('Report Failed', err.message);
    } finally {
      setSubmittingIssue(false);
    }
  };

  const handleResolveIssue = async (issueId: string) => {
    try {
      const { error } = await supabase.rpc('resolve_issue', {
        p_issue_id: issueId,
        p_staff_id: activeStaff?.id || null
      });
      if (error) {
        await supabase
          .from('issues')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', issueId);
      }
      Alert.alert('Resolved', 'Issue has been marked as resolved.');
      fetchDormData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Section 3C: Remove Room (Owner only, Online-only)
  const handleRemoveRoom = () => {
    const activeCount = Object.keys(activeStaysMap).length;
    if (activeCount > 0) {
      return Alert.alert(
        'Blocked',
        `Cannot remove this dorm while ${activeCount} guest${activeCount > 1 ? 's are' : ' is'} checked in.`
      );
    }

    Alert.alert(
      'Remove Dorm Confirmation',
      'Are you sure you want to remove this dorm room? All beds will be removed or archived.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: executeRemove
        }
      ]
    );
  };

  const executeRemove = async () => {
    if (!(await isOnline())) {
      return Alert.alert('Online Required', 'Room removal requires an internet connection.');
    }

    try {
      const { data: result, error } = await supabase.rpc('remove_room', {
        p_room_id: roomId,
        p_staff_id: activeStaff?.id
      });

      if (error) {
        Alert.alert('Removal Failed', error.message);
        return;
      }

      Alert.alert(
        'Room Removed',
        result === 'archived'
          ? 'Room has historical stays and was safely archived.'
          : 'Room had no stays and was permanently deleted.'
      );
      router.replace('/rooms');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading && !room) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const activeUnitIds = new Set(Object.keys(activeStaysMap));
  const totalBeds = units.length;
  const occupiedCount = activeUnitIds.size;
  const dirtyCount = units.filter(u => u.housekeeping_status === 'dirty').length;
  const maintCount = units.filter(u => u.housekeeping_status === 'maintenance').length;
  const cleanCount = Math.max(0, totalBeds - occupiedCount - dirtyCount - maintCount);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={room?.label || 'Dorm'}
        subtitle={`${room?.floor ? `Floor ${room.floor} • ` : ''}${totalBeds} Beds • ${occupiedCount} Taken${lastSynced ? ` • Synced ${lastSynced}` : ''}`}
        right={
          can('settings') ? (
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: theme.accent }]}
              onPress={() => setShowAddBedModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text style={styles.headerActionText}>Add Bed</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* ── HERO DORM SUMMARY CARD ───────────────────────────────── */}
        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroIconBox, { backgroundColor: theme.accentSubtle }]}>
              <MaterialCommunityIcons name="bunk-bed-outline" size={26} color={theme.accentText} />
            </View>
            <View style={styles.heroTitleBox}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>{room?.label || 'Dorm'}</Text>
              <View style={styles.heroBadgeRow}>
                <View style={[styles.heroFloorBadge, { backgroundColor: theme.surfaceSubtle }]}>
                  <Text style={[styles.heroFloorText, { color: theme.textSecondary }]}>Floor {room?.floor || 'G'}</Text>
                </View>
                <View
                  style={[
                    styles.heroGenderBadge,
                    {
                      backgroundColor:
                        editGenderRule === 'female'
                          ? theme.occupiedSubtle
                          : editGenderRule === 'male'
                          ? theme.accentSubtle
                          : theme.surfaceSubtle
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.heroGenderText,
                      {
                        color:
                          editGenderRule === 'female'
                            ? theme.occupied
                            : editGenderRule === 'male'
                            ? theme.accentText
                            : theme.textSecondary
                      }
                    ]}
                  >
                    {editGenderRule === 'female' ? 'Female Only' : editGenderRule === 'male' ? 'Male Only' : 'Any Gender'}
                  </Text>
                </View>
              </View>
            </View>
            {can('settings') && (
              <TouchableOpacity
                style={[styles.heroEditBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.border }]}
                onPress={() => setShowEditModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={16} color={theme.accentText} />
                <Text style={[styles.heroEditText, { color: theme.accentText }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Stats Pills */}
          <View style={[styles.metricsRow, { borderTopColor: theme.borderSubtle }]}>
            <View style={[styles.metricPill, { backgroundColor: theme.accentSubtle }]}>
              <Text style={[styles.metricNumber, { color: theme.accentText }]}>{totalBeds}</Text>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Beds</Text>
            </View>
            <View style={[styles.metricPill, { backgroundColor: theme.occupiedSubtle }]}>
              <Text style={[styles.metricNumber, { color: theme.occupied }]}>{occupiedCount}</Text>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Occupied</Text>
            </View>
            <View style={[styles.metricPill, { backgroundColor: theme.freeSubtle }]}>
              <Text style={[styles.metricNumber, { color: theme.free }]}>{cleanCount}</Text>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Available</Text>
            </View>
            {dirtyCount > 0 && (
              <View style={[styles.metricPill, { backgroundColor: theme.dirtySubtle }]}>
                <Text style={[styles.metricNumber, { color: theme.dirty }]}>{dirtyCount}</Text>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Dirty</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Operations Bar */}
        <View style={styles.quickOpsRow}>
          <TouchableOpacity
            style={[styles.quickOpBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => {
              setIssueTargetUnitId(units[0]?.id || '');
              setShowIssueModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={16} color="#d97706" />
            <Text style={[styles.quickOpText, { color: theme.text }]}>Report Issue</Text>
          </TouchableOpacity>

          {can('set_maintenance') && (
            <TouchableOpacity
              style={[styles.quickOpBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={handleSetDormMaintenance}
              activeOpacity={0.7}
            >
              <Ionicons name="construct-outline" size={16} color={theme.maintenance} />
              <Text style={[styles.quickOpText, { color: theme.text }]}>Dorm Maintenance</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── BEDS LIST SECTION ───────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>BEDS IN THIS ROOM</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textTertiary }]}>{units.length} total</Text>
        </View>

        {units.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.emptyIconBox, { backgroundColor: theme.surfaceSubtle }]}>
              <MaterialCommunityIcons name="bed-empty" size={38} color={theme.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No beds in this dorm yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Add beds to this dorm to begin checking in guests.</Text>
            {can('settings') && (
              <TouchableOpacity
                style={[styles.addFirstBedBtn, { backgroundColor: theme.accent }]}
                onPress={() => setShowAddBedModal(true)}
              >
                <Text style={styles.addFirstBedText}>+ Add First Bed</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          units.map(unit => {
            const state: BedState = bedState(unit, activeUnitIds);
            const stay = activeStaysMap[unit.id];
            const guestName = Array.isArray(stay?.guests) ? stay?.guests[0]?.name : stay?.guests?.name;
            const guestPhone = Array.isArray(stay?.guests) ? stay?.guests[0]?.phone : stay?.guests?.phone;

            const stateTheme = {
              clean: { bg: theme.freeSubtle, text: theme.free, dot: theme.free, label: 'Clean / Free' },
              occupied: { bg: theme.occupiedSubtle, text: theme.occupied, dot: theme.occupied, label: 'Occupied' },
              dirty: { bg: theme.dirtySubtle, text: theme.dirty, dot: theme.dirty, label: 'Needs Clean' },
              maintenance: { bg: theme.maintenanceSubtle, text: theme.maintenance, dot: theme.maintenance, label: 'Maintenance' }
            }[state] || { bg: theme.surfaceSubtle, text: theme.textSecondary, dot: theme.textSecondary, label: state };

            return (
              <Pressable
                key={unit.id}
                style={[styles.bedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => router.push(`/room/${unit.id}`)}
              >
                <View style={styles.bedTopRow}>
                  <View style={[styles.bedIconBadge, { backgroundColor: theme.accentSubtle }]}>
                    <Ionicons name="bed-outline" size={18} color={theme.accentText} />
                  </View>
                  <View style={styles.bedInfoBox}>
                    <Text style={[styles.bedLabel, { color: theme.text }]}>{unit.label}</Text>
                    {unit.gender_rule && unit.gender_rule !== 'any' && (
                      <Text style={[styles.bedSubrule, { color: theme.textSecondary }]}>
                        {unit.gender_rule.toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: stateTheme.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: stateTheme.dot }]} />
                    <Text style={[styles.statusBadgeText, { color: stateTheme.text }]}>
                      {stateTheme.label}
                    </Text>
                  </View>
                </View>

                {/* Occupant / Vacant Banner */}
                {stay ? (
                  <View style={[styles.occupantBanner, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
                    <View style={[styles.occupantAvatar, { backgroundColor: theme.accentSubtle }]}>
                      <Text style={[styles.occupantAvatarText, { color: theme.accentText }]}>
                        {(guestName || 'G').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.occupantInfo}>
                      <Text style={[styles.occupantName, { color: theme.text }]} numberOfLines={1}>
                        {guestName || 'Guest Checked In'}
                      </Text>
                      {activeStaff?.role !== 'housekeeping' && guestPhone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="call-outline" size={12} color={theme.textSecondary} />
                          <Text style={[styles.occupantPhone, { color: theme.textSecondary }]}>{guestPhone}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.chevronBox}>
                      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.vacantBanner, { backgroundColor: theme.surfaceSubtle }]}>
                    <Ionicons
                      name={state === 'clean' ? 'checkmark-circle-outline' : state === 'dirty' ? 'sparkles-outline' : 'construct-outline'}
                      size={15}
                      color={stateTheme.dot}
                    />
                    <Text style={[styles.vacantText, { color: stateTheme.text }]}>
                      {state === 'clean'
                        ? 'Vacant • Ready for immediate check-in'
                        : state === 'dirty'
                        ? 'Awaiting housekeeping cleaning'
                        : 'Bed currently out of service'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} style={{ marginLeft: 'auto' }} />
                  </View>
                )}

                {/* Quick Maintenance Toggle for Vacant Beds */}
                {!stay && can('set_maintenance') && (
                  <View style={[styles.bedActionRow, { borderTopColor: theme.borderSubtle }]}>
                    <TouchableOpacity
                      style={[
                        styles.bedQuickMaintBtn,
                        state === 'maintenance'
                          ? { backgroundColor: theme.freeSubtle, borderColor: theme.roomCleanBorder }
                          : { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleToggleBedMaintenance(unit.id, state);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={state === 'maintenance' ? "checkmark-circle-outline" : "construct-outline"}
                        size={13}
                        color={state === 'maintenance' ? theme.free : theme.maintenance}
                      />
                      <Text
                        style={[
                          styles.bedQuickMaintText,
                          { color: state === 'maintenance' ? theme.free : theme.maintenance }
                        ]}
                      >
                        {state === 'maintenance' ? 'Mark Available (Clean)' : 'Set Maintenance'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        {/* ── OPEN ISSUES CARD ────────────────────────────────────── */}
        <View style={[styles.issuesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.issuesHeaderRow, { borderBottomColor: theme.borderSubtle }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="construct-outline" size={18} color="#d97706" />
              <Text style={[styles.issuesTitle, { color: theme.text }]}>Open Issues ({issues.length})</Text>
            </View>
            <TouchableOpacity
              style={[styles.reportIssueLink, { backgroundColor: theme.accentSubtle }]}
              onPress={() => {
                setIssueTargetUnitId(units[0]?.id || '');
                setShowIssueModal(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={14} color={theme.accentText} />
              <Text style={[styles.reportIssueLinkText, { color: theme.accentText }]}>Report</Text>
            </TouchableOpacity>
          </View>

          {issues.length === 0 ? (
            <View style={styles.noIssuesBox}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#16a34a" />
              <Text style={[styles.noIssuesText, { color: theme.textSecondary }]}>
                No open issues reported for this dorm.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 4 }}>
              {issues.map((iss) => {
                const targetBed = units.find(u => u.id === iss.unit_id);
                return (
                  <View key={iss.id} style={[styles.issueItem, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
                    <View style={styles.issueItemTop}>
                      <View style={[styles.issueCategoryChip, { backgroundColor: '#fef3c7' }]}>
                        <Text style={[styles.issueCategoryText, { color: '#d97706' }]}>{iss.category.toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.issueBedBadge, { color: theme.textSecondary }]}>
                        {targetBed?.label || 'Dorm Bed'}
                      </Text>
                      <Text style={[styles.issueTimeText, { color: theme.textTertiary }]}>
                        {new Date(iss.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={[styles.issueNoteText, { color: theme.text }]}>{iss.note || 'No description provided'}</Text>
                    <TouchableOpacity
                      style={[styles.resolveBtn, { backgroundColor: '#16a34a' }]}
                      onPress={() => handleResolveIssue(iss.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                      <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── OWNER ACTIONS CARD ──────────────────────────────────── */}
        {can('settings') && (
          <View style={[styles.dangerZone, { backgroundColor: theme.destructiveSubtle, borderColor: theme.destructive }]}>
            <View style={styles.dangerHeader}>
              <MaterialCommunityIcons name="shield-alert-outline" size={18} color={theme.destructive} />
              <Text style={[styles.dangerTitle, { color: theme.destructive }]}>OWNER ROOM ACTIONS</Text>
            </View>
            <Text style={[styles.dangerNote, { color: theme.textSecondary }]}>
              Remove or archive this dorm. Only permitted when all beds in this room are completely vacant.
            </Text>
            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: theme.destructive }]}
              onPress={handleRemoveRoom}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#ffffff" />
              <Text style={styles.deleteBtnText}>Remove / Archive This Dorm</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── EDIT DORM MODAL ───────────────────────────────────────── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalCard, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Dorm Room</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Room Label</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              value={editLabel}
              onChangeText={setEditLabel}
              placeholder="e.g. Dorm 201"
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
                    {f === -1 ? 'Basement' : f === 0 ? 'Ground' : `F${f}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Gender Rule</Text>
            <View style={styles.genderOptions}>
              {(['any', 'male', 'female'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                    editGenderRule === g && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setEditGenderRule(g)}
                >
                  <Text style={[styles.genderBtnText, { color: editGenderRule === g ? '#ffffff' : theme.textSecondary }]}>
                    {g === 'any' ? 'Any Gender' : g === 'male' ? 'Male Only' : 'Female Only'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: theme.destructive }]}
                onPress={handleRemoveRoom}
                disabled={submittingEdit}
              >
                <Text style={styles.modalSaveText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSaveEdit}
                disabled={submittingEdit}
              >
                {submittingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── ADD BED MODAL ─────────────────────────────────────────── */}
      <Modal visible={showAddBedModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalCard, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Bed to Dorm</Text>
              <TouchableOpacity onPress={() => setShowAddBedModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Bed Label</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              value={newBedLabel}
              onChangeText={setNewBedLabel}
              placeholder={`e.g. Bed ${units.length + 1}`}
              placeholderTextColor={theme.textTertiary}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddBedModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: theme.accent }]}
                onPress={handleAddBed}
                disabled={submittingEdit}
              >
                {submittingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Add Bed</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── REPORT ISSUE MODAL ─────────────────────────────────────── */}
      <Modal visible={showIssueModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalCard, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="warning-outline" size={22} color="#d97706" />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Report Dorm Issue</Text>
              </View>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Target Bed Selector */}
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Select Bed / Location</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPickerRow}>
              {units.map((u) => {
                const isSelected = (issueTargetUnitId || units[0]?.id) === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      styles.unitPickerChip,
                      { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                      isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }
                    ]}
                    onPress={() => setIssueTargetUnitId(u.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="bed-outline"
                      size={13}
                      color={isSelected ? '#ffffff' : theme.textSecondary}
                    />
                    <Text style={[styles.unitPickerChipText, { color: isSelected ? '#ffffff' : theme.textSecondary }]}>
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category Selector */}
            <Text style={[styles.inputLabel, { marginTop: 8, color: theme.textSecondary }]}>Issue Category</Text>
            <View style={styles.categoryChipsRow}>
              {[
                { id: 'cleanliness', label: 'Cleanliness', icon: 'sparkles-outline' },
                { id: 'ac', label: 'AC / Climate', icon: 'thermometer-outline' },
                { id: 'water', label: 'Water / Plumbing', icon: 'water-outline' },
                { id: 'electrical', label: 'Electrical', icon: 'flash-outline' },
                { id: 'noise', label: 'Noise / Disturbance', icon: 'volume-high-outline' },
                { id: 'other', label: 'Other', icon: 'help-circle-outline' },
              ].map((c) => {
                const isSelected = issueCategory === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                      isSelected && { backgroundColor: '#d97706', borderColor: '#d97706' }
                    ]}
                    onPress={() => setIssueCategory(c.id as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={c.icon as any}
                      size={14}
                      color={isSelected ? '#ffffff' : theme.textSecondary}
                    />
                    <Text style={[styles.categoryChipText, { color: isSelected ? '#ffffff' : theme.textSecondary }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note / Description */}
            <Text style={[styles.inputLabel, { marginTop: 8, color: theme.textSecondary }]}>Details / Notes</Text>
            <TextInput
              style={[styles.textAreaInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              value={issueNote}
              onChangeText={setIssueNote}
              placeholder="Describe the issue (e.g. AC leaking water on Bed 3)..."
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowIssueModal(false); setIssueNote(''); }}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#d97706' }]}
                onPress={handleReportIssue}
                disabled={submittingIssue}
              >
                {submittingIssue ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10
  },
  headerActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
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
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
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
  heroTitleBox: {
    flex: 1
  },
  heroTitle: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a'
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4
  },
  heroFloorBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  heroFloorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569'
  },
  heroGenderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  badgeFemale: {
    backgroundColor: '#fce7f3'
  },
  badgeMale: {
    backgroundColor: '#dbeafe'
  },
  badgeAny: {
    backgroundColor: '#f1f5f9'
  },
  heroGenderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a'
  },
  heroEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  heroEditText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700'
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  metricPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12
  },
  metricNumber: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    marginTop: 1
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1.1
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },
  bedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1
  },
  bedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  bedIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  bedInfoBox: {
    flex: 1
  },
  bedLabel: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a'
  },
  bedSubrule: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10
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
  occupantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  occupantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  occupantAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb'
  },
  occupantInfo: {
    flex: 1
  },
  occupantName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  occupantPhone: {
    fontSize: 11,
    color: '#475569',
    fontVariant: ['tabular-nums'],
    marginTop: 1
  },
  chevronBox: {
    paddingLeft: 6
  },
  vacantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  vacantText: {
    fontSize: 12,
    fontWeight: '600'
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4
  },
  emptyText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16
  },
  addFirstBedBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8
  },
  addFirstBedText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  },
  dangerZone: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6
  },
  dangerTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#dc2626',
    letterSpacing: 1.0
  },
  dangerNote: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 14,
    lineHeight: 16
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingVertical: 11,
    borderRadius: 10
  },
  deleteBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontFamily: Fonts.serif,
    fontSize: 19,
    fontWeight: '600',
    color: '#0f172a'
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc'
  },
  genderOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  genderBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  genderBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569'
  },
  genderBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14
  },
  modalSaveBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
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
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepperBtnDisabled: {
    backgroundColor: '#f1f5f9'
  },
  stepperValueBox: {
    flex: 1,
    alignItems: 'center'
  },
  stepperFloorTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#f1f5f9',
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
  },

  // ── Quick Operations Bar ─────────────────────────────────────────
  quickOpsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickOpBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickOpText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Bed Action Row ───────────────────────────────────────────────
  bedActionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  bedQuickMaintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  bedQuickMaintText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Open Issues Card ─────────────────────────────────────────────
  issuesCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  issuesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  issuesTitle: {
    fontFamily: Fonts.serif,
    fontSize: 15.5,
    fontWeight: '600',
  },
  reportIssueLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reportIssueLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  noIssuesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  noIssuesText: {
    fontSize: 13,
  },
  issueItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  issueItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  issueCategoryChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  issueCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  issueBedBadge: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  issueTimeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  issueNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  resolveBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 2,
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Report Issue Modal Picker Styles ─────────────────────────────
  unitPickerRow: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  unitPickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  unitPickerChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  unitPickerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  unitPickerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  textAreaInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    marginBottom: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
});
