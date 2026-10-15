// src/app/notifications.tsx
// Notification centre: Real-time room issues + WhatsApp inquiry integration & guest requests
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
  LayoutAnimation,
  Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { isOnline } from '@/lib/offline';
import { useStaff } from '@/lib/staff-context';
import { ScreenHeader } from '@/lib/screen-header';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NotifKind = 'issue' | 'maintenance' | 'system';

interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  meta?: string;             // category, room, sender
  guestPhone?: string;
  roomId?: string;
  createdAt: string;
  read: boolean;
  severity?: 'high' | 'medium' | 'low';
  details?: {
    senderName?: string;
    inquiryDates?: string;
    pax?: string;
    roomType?: string;
    reportedBy?: string;
  };
}

const KIND_META: Record<NotifKind, { icon: any; color: string; bg: string; label: string }> = {
  issue: { icon: 'alert-circle', color: '#dc2626', bg: '#fee2e2', label: 'Room Issue' },
  maintenance: { icon: 'construct', color: '#d97706', bg: '#fef3c7', label: 'Maintenance' },
  system: { icon: 'shield-checkmark', color: '#2563eb', bg: '#dbeafe', label: 'System Alert' },
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { activeStaff } = useStaff();
  const isHousekeeping = activeStaff?.role === 'housekeeping';

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'issue' | 'inquiry_wa'>('all');

  const loadNotifs = useCallback(async () => {
    try {
      const online = await isOnline();
      if (!online) { setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();
      if (!member) { setLoading(false); return; }

      // 1. Fetch live open issues from Supabase
      const { data: issuesData } = await supabase
        .from('issues')
        .select(`*, units ( id, label, rooms ( id, label ) )`)
        .eq('property_id', member.property_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(40);

      const issueNotifs: Notif[] = (issuesData || []).map((issue: any) => ({
        id: `issue_${issue.id}`,
        kind: 'issue',
        title: `Room Issue — ${issue.units?.rooms?.label ?? 'Room'} / Bed ${issue.units?.label ?? 'Unit'}`,
        body: issue.note || 'Issue reported. Maintenance attention required.',
        meta: issue.category?.toUpperCase() ?? 'MAINTENANCE',
        roomId: issue.units?.rooms?.id,
        createdAt: issue.created_at,
        read: false,
        severity: (issue.category === 'plumbing' || issue.category === 'electrical') ? 'high' : 'medium',
        details: {
          reportedBy: 'Front Desk / Guest',
          roomType: `${issue.units?.rooms?.label || 'Room'} (${issue.units?.label || 'Unit'})`,
        }
      }));

      setNotifs(issueNotifs);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [isHousekeeping]);

  useFocusEffect(useCallback(() => { loadNotifs(); }, [loadNotifs]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifs();
    setRefreshing(false);
  }, [loadNotifs]);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => (prev === id ? null : id));
    setReadIds(prev => new Set([...prev, id]));
  };

  const markAllRead = () => {
    setReadIds(new Set(notifs.map(n => n.id)));
  };



  const filteredNotifs = notifs.filter(n => {
    if (selectedFilter === 'all') return true;
    return n.kind === selectedFilter;
  });

  const unreadCount = notifs.filter(n => !readIds.has(n.id)).length;
  const issueCount = notifs.filter(n => n.kind === 'issue').length;

  const renderItem = ({ item }: { item: Notif }) => {
    const isRead = readIds.has(item.id);
    const isExpanded = expandedId === item.id;
    const meta = KIND_META[item.kind] || KIND_META.issue;

    return (
      <Pressable
        style={[styles.card, isRead && styles.cardRead, isExpanded && styles.cardExpanded]}
        onPress={() => toggleExpand(item.id)}
      >
        <View style={styles.cardHeaderRow}>
          <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>

          <View style={styles.cardHeaderContent}>
            <View style={styles.cardTopRow}>
              <View style={[styles.kindBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.kindText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {item.meta && (
                <View
                  style={[
                    styles.severityBadge,
                    { backgroundColor: item.severity === 'high' ? '#fef2f2' : '#f1f5f9' }
                  ]}
                >
                  <Text
                    style={[
                      styles.severityText,
                      { color: item.severity === 'high' ? '#dc2626' : '#475569' }
                    ]}
                  >
                    {item.meta}
                  </Text>
                </View>
              )}
              {!isRead && <View style={styles.unreadDot} />}
            </View>

            <Text style={[styles.cardTitle, isRead && styles.cardTitleRead]} numberOfLines={isExpanded ? undefined : 2}>
              {item.title}
            </Text>
          </View>
        </View>

        {/* Snippet / Expanded Content */}
        <Text style={[styles.cardBodyText, isExpanded && styles.cardBodyExpanded]}>
          {item.body}
        </Text>

        {/* Expanded Details Panel */}
        {isExpanded && (
          <View style={styles.expandedPanel}>
            <View style={styles.detailsGrid}>
              {item.details?.senderName && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Sender:</Text>
                  <Text style={styles.detailValue}>{item.details.senderName}</Text>
                </View>
              )}
              {item.guestPhone && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone:</Text>
                  <Text style={styles.detailValue}>{item.guestPhone}</Text>
                </View>
              )}
              {item.details?.inquiryDates && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Stay Dates:</Text>
                  <Text style={styles.detailValue}>{item.details.inquiryDates}</Text>
                </View>
              )}
              {item.details?.pax && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Guests / Pax:</Text>
                  <Text style={styles.detailValue}>{item.details.pax}</Text>
                </View>
              )}
              {item.details?.roomType && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category:</Text>
                  <Text style={styles.detailValue}>{item.details.roomType}</Text>
                </View>
              )}
            </View>

            {/* Quick Action Buttons */}
            <View style={styles.actionButtonRow}>


              {item.kind === 'issue' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                    onPress={() => router.push('/rooms')}
                  >
                    <Ionicons name="bed" size={16} color="#ffffff" />
                    <Text style={styles.actionBtnText}>View Rooms</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                    onPress={() => {
                      Alert.alert('Issue Resolved', 'Marked room issue as completed.');
                      setNotifs(prev => prev.filter(n => n.id !== item.id));
                    }}
                  >
                    <Ionicons name="checkmark-done" size={16} color="#ffffff" />
                    <Text style={styles.actionBtnText}>Mark Resolved</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardTime}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </Text>
          <Text style={styles.expandHint}>
            {isExpanded ? 'Tap to collapse ▴' : 'Tap to expand ▾'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={isHousekeeping ? "Housekeeping Alerts" : "Notifications"}
        subtitle={isHousekeeping ? `${unreadCount} open room issues` : (unreadCount > 0 ? `${unreadCount} unread items` : 'All caught up')}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
              <Text style={styles.markAllBtnText}>All read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Category Filter Pills */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterPill, selectedFilter === 'all' && styles.filterPillActive]}
          onPress={() => setSelectedFilter('all')}
        >
          <Text style={[styles.filterPillText, selectedFilter === 'all' && styles.filterPillTextActive]}>
            All ({notifs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, selectedFilter === 'issue' && styles.filterPillActive]}
          onPress={() => setSelectedFilter('issue')}
        >
          <Ionicons name="alert-circle" size={13} color={selectedFilter === 'issue' ? '#ffffff' : '#dc2626'} />
          <Text style={[styles.filterPillText, selectedFilter === 'issue' && styles.filterPillTextActive]}>
            Room Issues ({issueCount})
          </Text>
        </TouchableOpacity>


      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 30 }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="bell-check-outline" size={60} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyBody}>
                {selectedFilter === 'issue'
                  ? 'No open room issues right now.'
                  : 'You have resolved all room issues and maintenance alerts.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  markAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },

  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRead: {
    backgroundColor: '#ffffff',
    opacity: 0.85,
  },
  cardExpanded: {
    borderColor: '#cbd5e1',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardHeaderContent: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kindText: { fontSize: 10, fontWeight: '700' },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityText: { fontSize: 10, fontWeight: '700' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginLeft: 'auto',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  cardTitleRead: {
    fontWeight: '600',
    color: '#334155',
  },
  cardBodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginTop: 8,
  },
  cardBodyExpanded: {
    color: '#1e293b',
    fontSize: 14,
    lineHeight: 21,
  },

  expandedPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  detailsGrid: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
  },
  cardTime: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  expandHint: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginTop: 16,
  },
  emptyBody: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
