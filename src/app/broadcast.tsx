// src/app/broadcast.tsx
// Guest Broadcast Messaging Center
// Owner & Co-Admin send immediately to all checked-in guests; Front Desk submits for approval.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/lib/screen-header';
import { useStaff } from '@/lib/staff-context';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getCachedPropertyId } from '@/lib/offline';
import { hapticSelection, hapticSuccess } from '@/lib/haptics';
import {
  BROADCAST_CATEGORIES,
  BroadcastCategory,
  BroadcastRecipient,
  BroadcastService,
  GuestBroadcastRecord,
  extractValidPhones,
  formatBroadcastMessage,
  requiresBroadcastApproval,
} from '@/services/broadcast.service';
import { ApprovalService } from '@/services/approval.service';

export default function GuestBroadcastScreen() {
  const { activeStaff, can } = useStaff();
  const theme = useTheme();
  const params = useLocalSearchParams<{ broadcastId?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>('LogStay');
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [history, setHistory] = useState<GuestBroadcastRecord[]>([]);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  // Composer State
  const [category, setCategory] = useState<BroadcastCategory>('update');
  const [title, setTitle] = useState('Property Update');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Active Dispatch State
  const [activeDispatch, setActiveDispatch] = useState<GuestBroadcastRecord | null>(null);
  const [sentGuestIds, setSentGuestIds] = useState<Set<string>>(new Set());

  const needsApproval = requiresBroadcastApproval(activeStaff?.role);
  const isManager = activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin';
  const allowed = can('broadcast_guests');

  const loadData = useCallback(async () => {
    try {
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .limit(1)
        .maybeSingle();

      const pId = member?.property_id || (await getCachedPropertyId());
      if (!pId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setPropertyId(pId);

      const [{ data: propRow }, recs, logs] = await Promise.all([
        supabase.from('properties').select('name').eq('id', pId).maybeSingle(),
        allowed ? BroadcastService.getCheckedInRecipients(pId) : Promise.resolve([]),
        allowed ? BroadcastService.getBroadcasts(pId) : Promise.resolve([]),
      ]);

      if (propRow?.name) setPropertyName(propRow.name);
      setRecipients(recs);
      setHistory(logs);

      if (params.broadcastId) {
        const matched = logs.find((item) => item.id === params.broadcastId);
        if (matched && (matched.status === 'approved' || matched.status === 'sent')) {
          setActiveDispatch(matched);
        }
      }
    } catch (err: any) {
      console.warn('[GuestBroadcastScreen.loadData] error:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, params.broadcastId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const applyCategoryTemplate = (catId: BroadcastCategory) => {
    void hapticSelection();
    setCategory(catId);
    const tpl = BROADCAST_CATEGORIES.find((c) => c.id === catId);
    if (!tpl) return;
    const isDefaultTitle =
      !title.trim() || BROADCAST_CATEGORIES.some((c) => c.templateTitle === title.trim()) || title.trim() === 'Property Update';
    if (isDefaultTitle) {
      setTitle(tpl.templateTitle);
    }
    if (!message.trim()) {
      setMessage(tpl.templateBody);
    }
  };

  const handleSubmit = async () => {
    if (!propertyId) return;
    if (title.trim().length < 2) {
      Alert.alert('Missing Title', 'Please add a short title for this guest notice.');
      return;
    }
    if (message.trim().length < 5) {
      Alert.alert('Missing Message', 'Please write the announcement to deliver to guests.');
      return;
    }
    if (recipients.length === 0) {
      Alert.alert(
        'No Checked-In Guests',
        'There are currently zero checked-in guests to broadcast to.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await BroadcastService.submitBroadcast(
        propertyId,
        category,
        title,
        message
      );
      await hapticSuccess();

      const refreshedLogs = await BroadcastService.getBroadcasts(propertyId);
      setHistory(refreshedLogs);

      if (result.requires_approval) {
        Alert.alert(
          'Submitted for Approval',
          `Your broadcast to ${result.recipient_count} checked-in guest(s) has been queued for Owner / Co-Admin approval.`
        );
        setMessage('');
      } else {
        const created = refreshedLogs.find((r) => r.id === result.broadcast_id) || {
          id: result.broadcast_id,
          property_id: propertyId,
          category,
          title: title.trim(),
          message: message.trim(),
          status: 'sent' as const,
          recipient_count: result.recipient_count,
          recipients: result.recipients,
          approval_request_id: null,
          requested_by: '',
          requested_by_name: activeStaff?.name || 'Manager',
          requested_by_role: activeStaff?.role || 'owner',
          approved_by: null,
          approved_by_name: activeStaff?.name || 'Manager',
          approved_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        setSentGuestIds(new Set());
        setActiveDispatch(created);
        setMessage('');
      }
    } catch (err: any) {
      Alert.alert('Broadcast Failed', err.message || 'Could not submit guest broadcast.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerDecision = async (item: GuestBroadcastRecord, approve: boolean) => {
    if (!item.approval_request_id) return;
    try {
      await ApprovalService.decideApproval(item.approval_request_id, approve);
      await hapticSuccess();
      const updated = await BroadcastService.getBroadcasts(propertyId!);
      setHistory(updated);
      if (approve) {
        const ready = updated.find((b) => b.id === item.id);
        if (ready) {
          setSentGuestIds(new Set());
          setActiveDispatch(ready);
        }
      } else {
        Alert.alert('Declined', 'The guest broadcast request has been declined.');
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Could not update approval.');
    }
  };

  const handleBulkSms = async (item: GuestBroadcastRecord) => {
    const body = formatBroadcastMessage(item.category, item.title, item.message, propertyName);
    const validPhones = extractValidPhones(item.recipients);
    if (validPhones.length === 0) {
      Alert.alert('No Valid Numbers', 'None of the checked-in guests have a valid phone number.');
      return;
    }
    try {
      await BroadcastService.openBulkSms(item.recipients, body);
      if (item.status === 'approved') {
        await BroadcastService.markBroadcastSent(item.id);
        await loadData();
      }
    } catch (err: any) {
      Alert.alert('SMS Launch Error', err.message || 'Could not open SMS composer.');
    }
  };

  const handleWhatsAppGuest = async (item: GuestBroadcastRecord, r: BroadcastRecipient) => {
    const body = formatBroadcastMessage(item.category, item.title, item.message, propertyName);
    const launched = await BroadcastService.sendSingleWhatsApp(r, body);
    if (launched) {
      setSentGuestIds((prev) => new Set(prev).add(r.stay_id));
      if (item.status === 'approved') {
        await BroadcastService.markBroadcastSent(item.id);
        await loadData();
      }
    }
  };

  const handleShareText = async (item: GuestBroadcastRecord) => {
    const body = formatBroadcastMessage(item.category, item.title, item.message, propertyName);
    await Share.share({ message: body });
    if (item.status === 'approved') {
      await BroadcastService.markBroadcastSent(item.id);
      await loadData();
    }
  };

  if (!allowed) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Guest Broadcast" subtitle="Access Restricted" />
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={44} color={theme.textTertiary} />
          <Text style={[styles.restrictedTitle, { color: theme.text }]}>Restricted to Front Desk &amp; Management</Text>
          <Text style={[styles.restrictedSub, { color: theme.textSecondary }]}>
            Guest phone broadcasts are available only to Front Desk, Co-Admin, and Owner accounts.
          </Text>
        </View>
      </View>
    );
  }

  const validPhoneCount = extractValidPhones(recipients).length;
  const pendingApprovalItems = history.filter((h) => h.status === 'pending_approval');
  const readyToDispatchItems = history.filter((h) => h.status === 'approved');
  const recentLogs = history.filter((h) => h.status === 'sent' || h.status === 'declined');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Guest Broadcast"
        subtitle={`${recipients.length} Checked-In ${recipients.length === 1 ? 'Guest' : 'Guests'}`}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── ACTIVE DISPATCH CONSOLE (After Owner sends or approves) ── */}
          {activeDispatch && (
            <View style={[styles.card, { backgroundColor: theme.freeSubtle, borderColor: theme.roomCleanBorder }]}>
              <View style={styles.dispatchHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eyebrow, { color: theme.free }]}>READY FOR DELIVERY</Text>
                  <Text style={[styles.serifCardTitle, { color: theme.text }]}>{activeDispatch.title}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActiveDispatch(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle-outline" size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.dispatchMsg, { color: theme.text }]}>
                {activeDispatch.message}
              </Text>

              <View style={styles.dispatchActionRow}>
                <TouchableOpacity
                  style={[styles.dispatchPrimaryBtn, { backgroundColor: theme.free }]}
                  onPress={() => handleBulkSms(activeDispatch)}
                >
                  <Ionicons name="chatbubbles-outline" size={16} color="#ffffff" />
                  <Text style={styles.dispatchPrimaryBtnText}>
                    Bulk SMS ({extractValidPhones(activeDispatch.recipients).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dispatchSecondaryBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => handleShareText(activeDispatch)}
                >
                  <Ionicons name="share-outline" size={16} color={theme.accentText} />
                  <Text style={[styles.dispatchSecondaryBtnText, { color: theme.accentText }]}>Copy / Share</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.eyebrow, { color: theme.roomEyebrow, marginTop: 12, marginBottom: 6 }]}>
                ONE-TAP WHATSAPP BY GUEST ({sentGuestIds.size}/{activeDispatch.recipients.length} OPENED)
              </Text>

              <View style={[styles.recipientListCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {activeDispatch.recipients.map((rec, idx) => {
                  const isSent = sentGuestIds.has(rec.stay_id);
                  return (
                    <View
                      key={rec.stay_id}
                      style={[
                        styles.recipientRow,
                        idx < activeDispatch.recipients.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.borderSubtle,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recipientName, { color: theme.text }]} numberOfLines={1}>
                          {rec.name}
                        </Text>
                        <Text style={[styles.recipientMeta, { color: theme.textSecondary }]}>
                          {rec.unit_label} {rec.phone ? `• ${rec.phone}` : '• No phone'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.waBtn,
                          {
                            backgroundColor: isSent ? theme.freeSubtle : theme.accentSubtle,
                            borderColor: isSent ? theme.roomCleanBorder : theme.roomOccupiedBorder,
                          },
                        ]}
                        disabled={!rec.phone}
                        onPress={() => handleWhatsAppGuest(activeDispatch, rec)}
                      >
                        <Ionicons
                          name={isSent ? 'checkmark-circle' : 'logo-whatsapp'}
                          size={15}
                          color={isSent ? theme.free : theme.accentText}
                        />
                        <Text style={[styles.waBtnText, { color: isSent ? theme.free : theme.accentText }]}>
                          {rec.phone ? (isSent ? 'Opened' : 'WhatsApp') : 'No Phone'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── MANAGER PENDING APPROVAL QUEUE ────────────────────────── */}
          {pendingApprovalItems.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.eyebrow, { color: '#b45309' }]}>
                {isManager ? 'NEEDS YOUR APPROVAL' : 'AWAITING OWNER / CO-ADMIN APPROVAL'}
              </Text>
              {pendingApprovalItems.map((item) => (
                <View key={item.id} style={[styles.card, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                  <View style={styles.cardRowBetween}>
                    <Text style={[styles.serifCardTitle, { color: theme.text }]}>{item.title}</Text>
                    <View style={[styles.badge, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.badgeText, { color: '#d97706' }]}>{item.recipient_count} Guests</Text>
                    </View>
                  </View>
                  <Text style={[styles.bodyCopy, { color: theme.text }]}>{item.message}</Text>
                  <Text style={[styles.metaCopy, { color: theme.textSecondary }]}>
                    Drafted by {item.requested_by_name}
                  </Text>

                  {isManager && item.approval_request_id && (
                    <View style={styles.approvalActions}>
                      <TouchableOpacity
                        style={[styles.approvalBtn, { backgroundColor: theme.destructiveSubtle }]}
                        onPress={() => handleManagerDecision(item, false)}
                      >
                        <Ionicons name="close" size={16} color={theme.destructive} />
                        <Text style={[styles.approvalBtnText, { color: theme.destructive }]}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approvalBtn, { backgroundColor: theme.free }]}
                        onPress={() => handleManagerDecision(item, true)}
                      >
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                        <Text style={[styles.approvalBtnText, { color: '#ffffff' }]}>Approve &amp; Send</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── APPROVED & READY FOR DISPATCH (For Desk once Owner approves) ── */}
          {readyToDispatchItems.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.eyebrow, { color: theme.free }]}>APPROVED &amp; READY TO SEND</Text>
              {readyToDispatchItems.map((item) => (
                <View key={item.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.roomCleanBorder }]}>
                  <View style={styles.cardRowBetween}>
                    <Text style={[styles.serifCardTitle, { color: theme.text }]}>{item.title}</Text>
                    <View style={[styles.badge, { backgroundColor: theme.freeSubtle }]}>
                      <Text style={[styles.badgeText, { color: theme.free }]}>Approved</Text>
                    </View>
                  </View>
                  <Text style={[styles.bodyCopy, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.message}
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: theme.free, marginTop: 10 }]}
                    onPress={() => {
                      setSentGuestIds(new Set());
                      setActiveDispatch(item);
                    }}
                  >
                    <Ionicons name="send" size={15} color="#ffffff" />
                    <Text style={styles.primaryBtnText}>
                      Open Dispatch Queue ({item.recipient_count} Guests)
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ── AUDIENCE SNAPSHOT ─────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardRowBetween}>
              <View>
                <Text style={[styles.eyebrow, { color: theme.roomEyebrow }]}>AUDIENCE · IN-HOUSE ONLY</Text>
                <Text style={[styles.serifCardTitle, { color: theme.text }]}>
                  {recipients.length} Checked-In {recipients.length === 1 ? 'Guest' : 'Guests'}
                </Text>
                <Text style={[styles.metaCopy, { color: theme.textSecondary }]}>
                  {validPhoneCount} with verified mobile numbers
                </Text>
              </View>
              {recipients.length > 0 && (
                <TouchableOpacity
                  style={[styles.toggleListBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                  onPress={() => setShowAllRecipients((v) => !v)}
                >
                  <Text style={[styles.toggleListText, { color: theme.accentText }]}>
                    {showAllRecipients ? 'Hide List' : 'Preview'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {showAllRecipients && recipients.length > 0 && (
              <View style={styles.chipWrap}>
                {recipients.map((r) => (
                  <View
                    key={r.stay_id}
                    style={[styles.guestChip, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                  >
                    <Text style={[styles.guestChipText, { color: theme.text }]}>
                      {r.name} · {r.unit_label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── COMPOSER ─────────────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.eyebrow, { color: theme.roomEyebrow }]}>COMPOSE BROADCAST</Text>
            <Text style={[styles.serifCardTitle, { color: theme.text, marginBottom: 12 }]}>
              Message All In-House Guests
            </Text>

            {/* Category Selector */}
            <View style={styles.catGrid}>
              {BROADCAST_CATEGORIES.map((cat) => {
                const selected = category === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catPill,
                      {
                        backgroundColor: selected ? theme.accentSubtle : theme.surfaceSubtle,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => applyCategoryTemplate(cat.id)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={14}
                      color={selected ? theme.accentText : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.catPillText,
                        { color: selected ? theme.accentText : theme.textSecondary },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Scheduled Water Maintenance"
              placeholderTextColor={theme.textTertiary}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Announcement Message</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text },
              ]}
              value={message}
              onChangeText={setMessage}
              placeholder="Write your notice to all currently checked-in guests..."
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={4}
            />

            {/* Role Notice for Front Desk */}
            {needsApproval ? (
              <View style={[styles.roleNoticeBox, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#92400e" />
                <Text style={[styles.roleNoticeText, { color: '#92400e' }]}>
                  Front Desk broadcasts require Owner or Co-Admin approval before sending to guests.
                </Text>
              </View>
            ) : (
              <View style={[styles.roleNoticeBox, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#16a34a" />
                <Text style={[styles.roleNoticeText, { color: '#16a34a' }]}>
                  Direct send enabled ({activeStaff?.role === 'owner' ? 'Owner' : 'Co-Admin'} privilege).
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: recipients.length === 0 ? theme.textTertiary : theme.accent },
              ]}
              onPress={handleSubmit}
              disabled={submitting || recipients.length === 0}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons
                    name={needsApproval ? 'paper-plane-outline' : 'megaphone-outline'}
                    size={17}
                    color="#ffffff"
                  />
                  <Text style={styles.primaryBtnText}>
                    {needsApproval
                      ? `Submit for Approval (${recipients.length} Guests)`
                      : `Send to ${recipients.length} Checked-In ${recipients.length === 1 ? 'Guest' : 'Guests'}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── RECENT BROADCAST HISTORY ─────────────────────────────── */}
          {recentLogs.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.eyebrow, { color: theme.roomEyebrow }]}>BROADCAST HISTORY</Text>
              {recentLogs.map((item) => {
                const isDeclined = item.status === 'declined';
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      if (!isDeclined) {
                        setSentGuestIds(new Set());
                        setActiveDispatch(item);
                      }
                    }}
                    activeOpacity={isDeclined ? 1 : 0.75}
                  >
                    <View style={styles.cardRowBetween}>
                      <Text style={[styles.historyTitle, { color: theme.text }]}>{item.title}</Text>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: isDeclined ? theme.destructiveSubtle : theme.freeSubtle },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: isDeclined ? theme.destructive : theme.free },
                          ]}
                        >
                          {isDeclined ? 'Declined' : `Sent · ${item.recipient_count}`}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.bodyCopy, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.message}
                    </Text>
                    <Text style={[styles.metaCopy, { color: theme.textTertiary }]}>
                      By {item.requested_by_name}
                      {item.approved_by_name && item.approved_by_name !== item.requested_by_name
                        ? ` · Approved by ${item.approved_by_name}`
                        : ''}
                      {' · '}
                      {new Date(item.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  restrictedTitle: {
    fontFamily: Fonts.serif,
    fontSize: 19,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  restrictedSub: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 44,
    gap: 14,
  },
  sectionBlock: {
    gap: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  serifCardTitle: {
    fontFamily: Fonts.serif,
    fontStyle: 'italic',
    fontSize: 19,
    fontWeight: '700',
  },
  cardRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleListBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleListText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  guestChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  guestChipText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  roleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 14,
  },
  roleNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  bodyCopy: {
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 6,
  },
  metaCopy: {
    fontSize: 12,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  approvalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 42,
  },
  approvalBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dispatchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  dispatchMsg: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  dispatchActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dispatchPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 11,
  },
  dispatchPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  dispatchSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  dispatchSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  recipientListCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '600',
  },
  recipientMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  waBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
});

