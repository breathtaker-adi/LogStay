// src/app/approvals.tsx
// Managerial Approvals Pipeline (Refunds, Discounts, Write-Offs, Price Overrides)
// Strictly enforces role authorization: Desk requests, Owner/Co-Admin decides.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStaff } from '@/lib/staff-context';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { ScreenHeader } from '@/lib/screen-header';
import { ApprovalService, ApprovalRequest, ApprovalKind } from '@/services/approval.service';
import { supabase } from '@/lib/supabase';
import { getCachedPropertyId } from '@/lib/offline';

export default function ApprovalsScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  // New Request Modal State
  const [showModal, setShowModal] = useState(false);
  const [reqKind, setReqKind] = useState<ApprovalKind>('discount');
  const [reqAmount, setReqAmount] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Decline Note Modal
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  const isManager = activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin';

  const fetchRequests = useCallback(async () => {
    try {
      let pId = propertyId;
      if (!pId) {
        const { data: member } = await supabase
          .from('members')
          .select('property_id')
          .limit(1)
          .maybeSingle();

        pId = member?.property_id || (await getCachedPropertyId());
        setPropertyId(pId);
      }

      if (!pId) {
        setRequests([]);
        return;
      }

      const all = await ApprovalService.getAllApprovals(pId);
      setRequests(all);
    } catch (err: any) {
      console.error('[ApprovalsScreen.fetchRequests]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
  };

  const handleCreateRequest = async () => {
    if (!propertyId) return;
    const amountNum = parseFloat(reqAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
      return;
    }
    if (reqReason.trim().length < 4) {
      Alert.alert('Reason Required', 'Please provide a clear reason for the managerial approval.');
      return;
    }

    setSubmitting(true);
    try {
      await ApprovalService.requestApproval(propertyId, null, reqKind, amountNum, reqReason);
      Alert.alert('Request Submitted', 'Your request has been queued for Manager / Owner review.');
      setShowModal(false);
      setReqAmount('');
      setReqReason('');
      await fetchRequests();
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Could not submit approval request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (req: ApprovalRequest) => {
    const isBroadcast = req.kind === 'guest_broadcast';
    Alert.alert(
      isBroadcast ? 'Approve Guest Broadcast' : 'Approve Request',
      isBroadcast
        ? 'Approve this announcement so it can be delivered to all checked-in guests?'
        : 'Are you sure you want to approve this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBroadcast ? 'Approve & Send' : 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              await ApprovalService.decideApproval(req.id, true);
              await fetchRequests();
              if (isBroadcast) {
                Alert.alert(
                  'Broadcast Approved',
                  'Ready for delivery via SMS or WhatsApp to all checked-in guests.',
                  [
                    { text: 'Stay Here', style: 'cancel' },
                    { text: 'Open Dispatch', onPress: () => router.push('/broadcast' as any) },
                  ]
                );
              } else {
                Alert.alert('Approved', 'Request has been approved.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not approve request.');
            }
          },
        },
      ]
    );
  };

  const handleDeclinePrompt = (id: string) => {
    setSelectedReqId(id);
    setDeclineNote('');
    setShowDeclineModal(true);
  };

  const handleConfirmDecline = async () => {
    if (!selectedReqId) return;
    try {
      await ApprovalService.decideApproval(selectedReqId, false, declineNote);
      setShowDeclineModal(false);
      Alert.alert('Declined', 'Request has been declined.');
      await fetchRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not decline request.');
    }
  };

  const filtered = requests.filter((r) =>
    tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'
  );

  const getKindBadge = (kind: ApprovalKind) => {
    switch (kind) {
      case 'refund':
        return { label: 'Refund', bg: theme.destructiveSubtle, text: theme.destructive, icon: 'arrow-undo-outline' };
      case 'discount':
        return { label: 'Discount', bg: theme.accentSubtle, text: theme.accentText, icon: 'pricetag-outline' };
      case 'write_off':
        return { label: 'Write-Off', bg: '#fffbeb', text: '#d97706', icon: 'trash-outline' };
      case 'price_override':
        return { label: 'Price Override', bg: theme.maintenanceSubtle, text: theme.maintenance, icon: 'create-outline' };
      case 'guest_broadcast':
        return { label: 'Guest Broadcast', bg: theme.accentSubtle, text: theme.accentText, icon: 'megaphone-outline' };
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title="Approval Requests"
        subtitle={isManager ? 'Managerial Review & Decisions' : 'Staff Requests & Audit Trail'}
      />

      {/* Segmented Control */}
      <View style={[styles.tabBar, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'pending' && [styles.tabBtnActive, { backgroundColor: theme.surface }]]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabText, { color: tab === 'pending' ? theme.text : theme.textSecondary }]}>
            Pending ({requests.filter((r) => r.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'history' && [styles.tabBtnActive, { backgroundColor: theme.surface }]]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, { color: tab === 'history' ? theme.text : theme.textSecondary }]}>
            Decided History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.subText, { color: theme.textSecondary, marginTop: 12 }]}>
            Loading requests...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons
                name={tab === 'pending' ? 'checkmark-circle-outline' : 'archive-outline'}
                size={44}
                color={theme.textTertiary}
              />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {tab === 'pending' ? 'No Pending Approvals' : 'No Past Requests Found'}
              </Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                {tab === 'pending'
                  ? 'All staff discount and refund requests have been settled.'
                  : 'Historical approved or declined requests will appear here.'}
              </Text>
            </View>
          ) : (
            filtered.map((req) => {
              const badge = getKindBadge(req.kind);
              return (
                <View
                  key={req.id}
                  style={[styles.reqCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={[styles.kindBadge, { backgroundColor: badge.bg }]}>
                      <Ionicons name={badge.icon as any} size={14} color={badge.text} style={{ marginRight: 4 }} />
                      <Text style={[styles.kindBadgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                    {req.kind === 'guest_broadcast' ? (
                      <Text style={[styles.amountText, { color: theme.accentText, fontSize: 13 }]}>
                        All In-House
                      </Text>
                    ) : (
                      <Text style={[styles.amountText, { color: theme.text }]}>
                        ₹{Number(req.amount).toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>

                  <Text style={[styles.reasonText, { color: theme.text }]}>{req.reason}</Text>

                  <View style={[styles.metaRow, { borderTopColor: theme.borderSubtle }]}>
                    <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                      Requested by <Text style={{ fontWeight: '600', color: theme.text }}>{req.requested_by_name}</Text>
                    </Text>
                    <Text style={[styles.metaDate, { color: theme.textTertiary }]}>
                      {new Date(req.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  {/* Decision info if already decided */}
                  {req.status !== 'pending' && (
                    <View
                      style={[
                        styles.decisionBanner,
                        {
                          backgroundColor: req.status === 'approved' ? '#dcfce7' : '#fee2e2',
                          borderColor: req.status === 'approved' ? '#86efac' : '#fca5a5',
                        },
                      ]}
                    >
                      <Ionicons
                        name={req.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={req.status === 'approved' ? '#15803d' : '#b91c1c'}
                      />
                      <Text
                        style={[
                          styles.decisionText,
                          { color: req.status === 'approved' ? '#15803d' : '#b91c1c' },
                        ]}
                      >
                        {req.status === 'approved' ? 'Approved' : 'Declined'} by {req.decided_by_name || 'Manager'}
                        {req.decision_note ? ` — "${req.decision_note}"` : ''}
                      </Text>
                    </View>
                  )}

                  {req.kind === 'guest_broadcast' && req.status === 'approved' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#16a34a', marginTop: 10 }]}
                      onPress={() => router.push('/broadcast' as any)}
                    >
                      <Ionicons name="megaphone-outline" size={16} color="#ffffff" />
                      <Text style={styles.approveBtnText}>Open Dispatch Queue &amp; Send</Text>
                    </TouchableOpacity>
                  )}

                  {/* Manager Action Buttons */}
                  {req.status === 'pending' && isManager && (
                    <View style={styles.actionBtnRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.declineBtn, { backgroundColor: '#fee2e2' }]}
                        onPress={() => handleDeclinePrompt(req.id)}
                      >
                        <Ionicons name="close" size={16} color="#dc2626" />
                        <Text style={[styles.declineBtnText, { color: '#dc2626' }]}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn, { backgroundColor: '#16a34a' }]}
                        onPress={() => handleApprove(req)}
                      >
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {req.status === 'pending' && !isManager && (
                    <View style={[styles.pendingWaitBox, { backgroundColor: theme.surfaceSubtle }]}>
                      <Ionicons name="time-outline" size={14} color={theme.textTertiary} />
                      <Text style={[styles.pendingWaitText, { color: theme.textSecondary }]}>
                        Pending managerial review
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Floating Create Request Button (for Desk & Co-Admin) */}
      <View style={[styles.fabWrapper, { paddingBottom: 24, backgroundColor: theme.bg }]}>
        <TouchableOpacity
          style={[styles.fabBtn, { backgroundColor: theme.accent }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#ffffff" />
          <Text style={styles.fabBtnText}>New Approval Request</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: New Approval Request */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>New Approval Request</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Request Type</Text>
            <View style={[styles.kindPickerRow, { backgroundColor: theme.surfaceSubtle }]}>
              {[
                { id: 'discount', label: 'Discount' },
                { id: 'refund', label: 'Refund' },
                { id: 'write_off', label: 'Write-Off' },
                { id: 'price_override', label: 'Override' },
              ].map((k) => (
                <TouchableOpacity
                  key={k.id}
                  style={[
                    styles.kindPickerBtn,
                    reqKind === k.id && [styles.kindPickerBtnActive, { backgroundColor: theme.surface }],
                  ]}
                  onPress={() => setReqKind(k.id as ApprovalKind)}
                >
                  <Text
                    style={[
                      styles.kindPickerBtnText,
                      { color: reqKind === k.id ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {k.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Amount (₹)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="500"
                placeholderTextColor={theme.textTertiary}
                value={reqAmount}
                onChangeText={setReqAmount}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Reason for Approval</Text>
            <TextInput
              style={[
                styles.textArea,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text },
              ]}
              placeholder="e.g. Guest AC malfunction compensation, group booking discount..."
              placeholderTextColor={theme.textTertiary}
              value={reqReason}
              onChangeText={setReqReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={handleCreateRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Decline Note */}
      <Modal visible={showDeclineModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Decline Request</Text>
            <Text style={[styles.subText, { color: theme.textSecondary, marginBottom: 12 }]}>
              Provide an optional note to staff explaining the reason for declining:
            </Text>

            <TextInput
              style={[
                styles.textArea,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text },
              ]}
              placeholder="e.g. Beyond authorized discount threshold..."
              placeholderTextColor={theme.textTertiary}
              value={declineNote}
              onChangeText={setDeclineNote}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setShowDeclineModal(false)}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.destructive }]}
                onPress={handleConfirmDecline}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    lineHeight: 18,
  },
  reqCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb20',
  },
  metaText: {
    fontSize: 12,
  },
  metaDate: {
    fontSize: 11,
  },
  decisionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    gap: 6,
  },
  decisionText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 4,
  },
  declineBtn: {
    backgroundColor: '#fee2e2',
  },
  declineBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
  approveBtn: {
    backgroundColor: '#16a34a',
  },
  approveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  pendingWaitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
    gap: 6,
  },
  pendingWaitText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  fabWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  fabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fabBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  subText: {
    fontSize: 13,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  kindPickerRow: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  kindPickerBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  kindPickerBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  kindPickerBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
