// src/app/notifications.tsx
// Notification centre: Real-time room issues & maintenance alerts
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
import { useTheme } from '@/hooks/use-theme';

type NotifKind = 'issue' | 'maintenance' | 'system';

interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  meta?: string;
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

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const isHousekeeping = activeStaff?.role === 'housekeeping';

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'issue'>('all');

  const kindMeta: Record<NotifKind, { icon: any; color: string; bg: string; label: string }> = {
    issue: { icon: 'alert-circle', color: '#dc2626', bg: '#fee2e2', label: 'Room Issue' },
    maintenance: { icon: 'construct', color: theme.maintenance, bg: theme.maintenanceSubtle, label: 'Maintenance' },
    system: { icon: 'shield-checkmark', color: theme.accent, bg: theme.accentSubtle, label: 'System Alert' },
  };

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
  }, []);

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
    const meta = kindMeta[item.kind] || kindMeta.issue;

    return (
      <Pressable
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: isExpanded ? theme.accent : theme.border },
          isRead && { opacity: 0.85 }
        ]}
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
                    { backgroundColor: item.severity === 'high' ? '#fee2e2' : theme.surfaceSubtle }
                  ]}
                >
                  <Text
                    style={[
                      styles.severityText,
                      { color: item.severity === 'high' ? '#dc2626' : theme.textSecondary }
                    ]}
                  >
                    {item.meta}
                  </Text>
                </View>
              )}
              {!isRead && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
            </View>

            <Text
              style={[
                styles.cardTitle,
                { color: theme.text },
                isRead && { color: theme.textSecondary, fontWeight: '600' }
              ]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {item.title}
            </Text>
          </View>
        </View>

        {/* Snippet / Expanded Content */}
        <Text
          style={[
            styles.cardBodyText,
            { color: theme.textSecondary },
            isExpanded && { color: theme.text }
          ]}
        >
          {item.body}
        </Text>

        {/* Expanded Details Panel */}
        {isExpanded && (
          <View style={[styles.expandedPanel, { borderTopColor: theme.borderSubtle }]}>
            <View style={[styles.detailsGrid, { backgroundColor: theme.surfaceSubtle }]}>
              {item.details?.senderName && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Sender:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{item.details.senderName}</Text>
                </View>
              )}
              {item.guestPhone && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Phone:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{item.guestPhone}</Text>
                </View>
              )}
              {item.details?.inquiryDates && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Stay Dates:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{item.details.inquiryDates}</Text>
                </View>
              )}
              {item.details?.pax && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Guests / Pax:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{item.details.pax}</Text>
                </View>
              )}
              {item.details?.roomType && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Category:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{item.details.roomType}</Text>
                </View>
              )}
            </View>

            {/* Quick Action Buttons */}
            <View style={styles.actionButtonRow}>
              {item.kind === 'issue' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.accent }]}
                    onPress={() => router.push('/rooms')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="bed" size={16} color="#ffffff" />
                    <Text style={styles.actionBtnText}>View Rooms</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.free }]}
                    onPress={() => {
                      Alert.alert('Issue Resolved', 'Marked room issue as completed.');
                      setNotifs(prev => prev.filter(n => n.id !== item.id));
                    }}
                    activeOpacity={0.8}
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
          <Text style={[styles.cardTime, { color: theme.textTertiary }]}>
            {new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </Text>
          <Text style={[styles.expandHint, { color: theme.accent }]}>
            {isExpanded ? 'Tap to collapse ▴' : 'Tap to expand ▾'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={isHousekeeping ? "Housekeeping Alerts" : "Notifications"}
        subtitle={isHousekeeping ? `${unreadCount} open room issues` : (unreadCount > 0 ? `${unreadCount} unread items` : 'All caught up')}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
              <Text style={[styles.markAllBtnText, { color: theme.accent }]}>All read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Segmented Filter Control */}
      <View style={styles.filterWrap}>
        <View style={[styles.segmentedControl, { backgroundColor: theme.surfaceSubtle }]}>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              selectedFilter === 'all' && [styles.segmentedTabActive, { backgroundColor: theme.surface }]
            ]}
            onPress={() => setSelectedFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.segmentedText,
              { color: selectedFilter === 'all' ? theme.text : theme.textSecondary, fontWeight: selectedFilter === 'all' ? '700' : '500' }
            ]}>
              All ({notifs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentedTab,
              selectedFilter === 'issue' && [styles.segmentedTabActive, { backgroundColor: theme.surface }]
            ]}
            onPress={() => setSelectedFilter('issue')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="alert-circle"
              size={13}
              color={selectedFilter === 'issue' ? '#dc2626' : theme.textSecondary}
            />
            <Text style={[
              styles.segmentedText,
              { color: selectedFilter === 'issue' ? theme.text : theme.textSecondary, fontWeight: selectedFilter === 'issue' ? '700' : '500' }
            ]}>
              Room Issues ({issueCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading notifications...</Text>
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
              <MaterialCommunityIcons name="bell-check-outline" size={56} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Notifications</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
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
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  markAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center'
  },
  markAllBtnText: {
    fontSize: 13,
    fontWeight: '700'
  },

  filterWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36
  },
  segmentedTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2
  },
  segmentedText: {
    fontSize: 13
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
    marginLeft: 'auto',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardBodyText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  expandedPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailsGrid: {
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
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
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
    minHeight: 44,
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
    fontWeight: '500',
  },
  expandHint: {
    fontSize: 11,
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
    marginTop: 16,
  },
  emptyBody: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
