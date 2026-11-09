// src/app/upi-reconciliation.tsx
// Daily UPI Payment Reconciliation & Bank Statement Matching Ledger
// Strictly for Property Owner & Co-Admin to audit cashiers and verify unconfirmed UPI receipts.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStaff } from '@/lib/staff-context';
import { useTheme } from '@/hooks/use-theme';
import { ScreenHeader } from '@/lib/screen-header';
import { StayService, StayOperationRecord } from '@/services/stay.service';
import { supabase } from '@/lib/supabase';
import { getCachedPropertyId } from '@/lib/offline';

export default function UpiReconciliationScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stays, setStays] = useState<StayOperationRecord[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unverified' | 'verified'>('unverified');

  const isOwnerOrCoAdmin = activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin';

  const fetchUpiStays = useCallback(async () => {
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
        setStays([]);
        return;
      }

      const list = await StayService.getUpiStaysForReconciliation(pId);
      setStays(list);
    } catch (err: any) {
      console.error('[UpiReconciliationScreen.fetchUpiStays]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchUpiStays();
  }, [fetchUpiStays]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUpiStays();
  };

  const handleToggleVerification = async (stayId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    try {
      await StayService.verifyUpiPayment(stayId, nextStatus);
      // Optimistic local update
      setStays((prev) =>
        prev.map((s) => (s.id === stayId ? { ...s, upi_verified: nextStatus } : s))
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update verification status.');
      await fetchUpiStays();
    }
  };

  const stats = useMemo(() => {
    let totalAmt = 0;
    let verifiedCount = 0;
    let unverifiedCount = 0;
    let unverifiedAmt = 0;

    for (const s of stays) {
      const amt = Number(s.amount) || 0;
      totalAmt += amt;
      if (s.upi_verified) {
        verifiedCount++;
      } else {
        unverifiedCount++;
        unverifiedAmt += amt;
      }
    }

    return { totalAmt, verifiedCount, unverifiedCount, unverifiedAmt };
  }, [stays]);

  const filteredStays = useMemo(() => {
    if (filter === 'verified') return stays.filter((s) => s.upi_verified);
    if (filter === 'unverified') return stays.filter((s) => !s.upi_verified);
    return stays;
  }, [stays, filter]);

  if (!isOwnerOrCoAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <ScreenHeader title="UPI Reconciliation" subtitle="Restricted Access" />
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Owner Access Required</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Only Property Owners and Co-Admins are authorized to audit and reconcile UPI transactions against bank statements.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title="UPI Reconciliation"
        subtitle="Daily Bank Statement Audit"
      />

      {/* Top Metric Cards */}
      <View style={styles.metricGrid}>
        <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Unverified UPI</Text>
          <Text style={[styles.metricVal, { color: stats.unverifiedCount > 0 ? '#d97706' : '#16a34a' }]}>
            {stats.unverifiedCount}
          </Text>
          <Text style={[styles.metricSub, { color: theme.textTertiary }]}>
            ₹{stats.unverifiedAmt.toLocaleString('en-IN')} pending match
          </Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Reconciled</Text>
          <Text style={[styles.metricVal, { color: '#16a34a' }]}>{stats.verifiedCount}</Text>
          <Text style={[styles.metricSub, { color: theme.textTertiary }]}>Matched in statement</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
        {[
          { id: 'unverified', label: `Pending (${stats.unverifiedCount})` },
          { id: 'verified', label: `Matched (${stats.verifiedCount})` },
          { id: 'all', label: `All (${stays.length})` },
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, filter === t.id && [styles.tabBtnActive, { backgroundColor: theme.surface }]]}
            onPress={() => setFilter(t.id as any)}
          >
            <Text style={[styles.tabText, { color: filter === t.id ? theme.text : theme.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transactions List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.subText, { color: theme.textSecondary, marginTop: 12 }]}>
            Loading transactions...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filteredStays.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>All Caught Up</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                {filter === 'unverified'
                  ? 'All recent UPI transactions have been verified with your bank statement.'
                  : 'No transactions found in this view.'}
              </Text>
            </View>
          ) : (
            filteredStays.map((item) => {
              const isVerified = Boolean(item.upi_verified);
              return (
                <View
                  key={item.id}
                  style={[styles.itemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.itemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.guestName, { color: theme.text }]}>
                        {item.guest?.name || 'Guest Stay'}
                      </Text>
                      <Text style={[styles.unitText, { color: theme.textSecondary }]}>
                        Room / Unit: {item.unit?.name || 'Assigned Bed'}
                      </Text>
                    </View>
                    <Text style={[styles.amountText, { color: theme.text }]}>
                      ₹{Number(item.amount).toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={[styles.metaText, { color: theme.textTertiary }]}>
                      Arrival: {new Date(item.check_in).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {item.guest?.phone ? (
                      <Text style={[styles.metaText, { color: theme.textTertiary }]}>
                        {item.guest.phone}
                      </Text>
                    ) : null}
                  </View>

                  {/* Verification Toggle Row */}
                  <View style={styles.verificationRow}>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: isVerified ? '#dcfce7' : '#fef3c7',
                          borderColor: isVerified ? '#86efac' : '#fde68a',
                        },
                      ]}
                    >
                      <Ionicons
                        name={isVerified ? 'checkmark-circle' : 'time'}
                        size={14}
                        color={isVerified ? '#15803d' : '#b45309'}
                      />
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: isVerified ? '#15803d' : '#b45309' },
                        ]}
                      >
                        {isVerified ? 'Matched in Bank' : 'Unverified (Desk Scan)'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        {
                          backgroundColor: isVerified ? theme.surfaceSubtle : theme.accent,
                          borderColor: isVerified ? theme.border : theme.accent,
                        },
                      ]}
                      onPress={() => handleToggleVerification(item.id, isVerified)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isVerified ? 'arrow-undo-outline' : 'checkmark-done'}
                        size={14}
                        color={isVerified ? theme.textSecondary : '#ffffff'}
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          { color: isVerified ? theme.textSecondary : '#ffffff' },
                        ]}
                      >
                        {isVerified ? 'Un-match' : 'Confirm Match'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  metricGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 8,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
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
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 290,
    lineHeight: 18,
  },
  itemCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  guestName: {
    fontSize: 15,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 12,
    marginTop: 2,
  },
  amountText: {
    fontSize: 17,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
  },
  verificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb20',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  subText: {
    fontSize: 13,
  },
});
