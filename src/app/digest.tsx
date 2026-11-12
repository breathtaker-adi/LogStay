import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getCachedPropertyId } from '../lib/offline';
import { ScreenHeader } from '@/lib/screen-header';
import { detectShiftAnomalies, ShiftRecord } from '@/lib/anomaly';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

// Configurable thresholds for insider-fraud detection
export const PETTY_FLAG = 1000; // Flag petty cash entries > ₹1,000
export const LONG_STAY_DAYS = 7; // Flag checked-in stays > 7 days

interface CashSummary {
  openingCash: number;
  collections: number;
  pettyCash: number;
  refunds: number;
  expectedDrawer: number;
  countedCash: number | null;
  variance: number | null;
  hasClosedShift: boolean;
  hasOpenShift: boolean;
}

interface AlertItem {
  id: string;
  type: 'refund' | 'large_petty' | 'pay_later' | 'outstanding' | 'lockout' | 'pin_failed';
  title: string;
  subtitle: string;
  detail: string;
  severity: 'high' | 'medium' | 'info';
}

interface ReconSnapshot {
  activeGuestsCount: number;
  totalBedsCount: number;
  maintenanceBeds: string[];
  dirtyBeds: string[];
  longStays: { guestName: string; days: number; bedLabel: string }[];
}

export default function DailyDigestScreen() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propertyName, setPropertyName] = useState('Property');
  const [fetchedAt, setFetchedAt] = useState<string>('');

  const [cashSummary, setCashSummary] = useState<CashSummary>({
    openingCash: 0,
    collections: 0,
    pettyCash: 0,
    refunds: 0,
    expectedDrawer: 0,
    countedCash: null,
    variance: null,
    hasClosedShift: false,
    hasOpenShift: false,
  });

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recon, setRecon] = useState<ReconSnapshot>({
    activeGuestsCount: 0,
    totalBedsCount: 0,
    maintenanceBeds: [],
    dirtyBeds: [],
    longStays: [],
  });

  const loadDigest = useCallback(async () => {
    try {
      // 1. Resolve property ID
      let propId = await getCachedPropertyId();
      if (!propId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: member } = await supabase
            .from('members')
            .select('property_id')
            .eq('user_id', user.id)
            .single();
          propId = member?.property_id || null;
        }
      }

      if (!propId) {
        setLoading(false);
        return;
      }

      // Fetch Property Name
      const { data: prop } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propId)
        .single();
      if (prop?.name) setPropertyName(prop.name);

      // Local midnight timestamp for today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayIso = startOfDay.toISOString();

      // Parallel Data Fetching
      const [
        shiftsRes,
        staffRes,
        staysRes,
        roomsRes,
        auditRes,
      ] = await Promise.all([
        // Today's shifts
        supabase
          .from('shifts')
          .select('id, staff_id, opening_cash, counted_cash, status, opened_at, closed_at')
          .eq('property_id', propId)
          .gte('opened_at', todayIso),

        // Staff profiles for name mapping (column-safe view without pin_hash/lockouts)
        supabase
          .from('staff_profiles_safe')
          .select('id, name, role')
          .eq('property_id', propId)
          .eq('active', true),

        // Stays for pay-later, long-stays, bad debt & active count
        supabase
          .from('stays')
          .select('id, guest_id, unit_id, status, amount, paid_amount, pay_mode, check_in, guests(name), units(label)')
          .eq('property_id', propId),

        // Rooms & units for bed reconciliation
        supabase
          .from('rooms')
          .select('id, label, units(id, label, housekeeping_status)')
          .eq('property_id', propId),

        // Failed PIN attempts today
        supabase
          .from('audit_log')
          .select('id, action, created_at, record_id')
          .eq('property_id', propId)
          .eq('action', 'cosign_failed')
          .gte('created_at', todayIso),
      ]);

      const staffMap = new Map<string, string>();
      const lockouts: AlertItem[] = [];
      (staffRes.data || []).forEach((s: any) => {
        staffMap.set(s.id, s.name);
        if (s.locked_until && new Date(s.locked_until) > new Date()) {
          lockouts.push({
            id: `lockout-${s.id}`,
            type: 'lockout',
            title: `Staff Locked Out: ${s.name}`,
            subtitle: `Role: ${s.role}`,
            detail: `Account locked until ${new Date(s.locked_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            severity: 'high',
          });
        }
      });

      // --- SECTION A: CASH SUMMARY ---
      const todayShifts = shiftsRes.data || [];
      const shiftIds = todayShifts.map((s: any) => s.id);
      let collections = 0;
      let pettyCash = 0;
      let refunds = 0;
      let cashEntries: any[] = [];

      if (shiftIds.length > 0) {
        const { data: entries } = await supabase
          .from('cash_entries')
          .select('id, shift_id, kind, amount, note, staff_id, created_at')
          .in('shift_id', shiftIds);
        cashEntries = entries || [];

        cashEntries.forEach((e: any) => {
          const amt = Number(e.amount || 0);
          if (e.kind === 'collection') collections += amt;
          else if (e.kind === 'petty') pettyCash += amt;
          else if (e.kind === 'refund') refunds += amt;
        });
      }

      const totalOpening = todayShifts.reduce((sum: number, s: any) => sum + Number(s.opening_cash || 0), 0);
      const expectedDrawer = totalOpening + collections - pettyCash - refunds;

      const closedShifts = todayShifts.filter((s: any) => s.status === 'closed');
      const hasClosedShift = closedShifts.length > 0;
      const hasOpenShift = todayShifts.some((s: any) => s.status === 'open');

      let countedCash: number | null = null;
      let variance: number | null = null;
      if (hasClosedShift) {
        countedCash = closedShifts.reduce((sum: number, s: any) => sum + Number(s.counted_cash || 0), 0);
        variance = countedCash - expectedDrawer;
      }

      setCashSummary({
        openingCash: totalOpening,
        collections,
        pettyCash,
        refunds,
        expectedDrawer,
        countedCash,
        variance,
        hasClosedShift,
        hasOpenShift,
      });

      // --- SECTION B: ALERTS & CASH ANOMALIES ---
      const generatedAlerts: AlertItem[] = [...lockouts];

      // Robust Statistical Cash Anomaly Flags
      if (hasClosedShift) {
        for (const cs of closedShifts) {
          const shiftObj: ShiftRecord = {
            id: cs.id,
            staff_name: staffMap.get(cs.staff_id) || 'Staff',
            opened_at: cs.opened_at,
            closed_at: cs.closed_at,
            opening_cash: Number(cs.opening_cash || 0),
            cash_collected: collections,
            upi_collected: 0,
            petty_cash_expenses: pettyCash,
            actual_cash: Number(cs.counted_cash || 0),
            expected_cash: expectedDrawer,
            variance: Number(cs.counted_cash || 0) - expectedDrawer,
            refund_count: cashEntries.filter((e: any) => e.kind === 'refund').length,
            refund_total: refunds,
            checkin_count: staysRes.data?.length || 0,
            pay_later_count: staysRes.data?.filter((s: any) => s.pay_mode === 'pay_later').length || 0,
          };
          const anomalyFlags = detectShiftAnomalies(shiftObj);
          for (const af of anomalyFlags) {
            generatedAlerts.push({
              id: af.id,
              type: af.severity === 'critical' ? 'refund' : 'large_petty',
              title: af.title,
              subtitle: af.description,
              detail: af.recommendation,
              severity: af.severity === 'critical' ? 'high' : af.severity === 'warning' ? 'medium' : 'info',
            });
          }
        }
      }

      // 1. Refunds logged today
      cashEntries
        .filter((e: any) => e.kind === 'refund')
        .forEach((e: any) => {
          const staffName = staffMap.get(e.staff_id) || 'Staff';
          generatedAlerts.push({
            id: `refund-${e.id}`,
            type: 'refund',
            title: `Refund Logged: ₹${Number(e.amount).toLocaleString('en-IN')}`,
            subtitle: `By ${staffName} • ${e.note || 'No reason provided'}`,
            detail: new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            severity: 'high',
          });
        });

      // 2. Large petty cash (> PETTY_FLAG)
      cashEntries
        .filter((e: any) => e.kind === 'petty' && Number(e.amount) > PETTY_FLAG)
        .forEach((e: any) => {
          const staffName = staffMap.get(e.staff_id) || 'Staff';
          generatedAlerts.push({
            id: `petty-${e.id}`,
            type: 'large_petty',
            title: `Large Petty Cash: ₹${Number(e.amount).toLocaleString('en-IN')}`,
            subtitle: `By ${staffName} • ${e.note || 'No note'}`,
            detail: `Exceeds ₹${PETTY_FLAG.toLocaleString('en-IN')} threshold`,
            severity: 'medium',
          });
        });

      // 3. Pay-later check-ins today
      const allStays = staysRes.data || [];
      allStays
        .filter((s: any) => s.pay_mode === 'pay_later' && new Date(s.check_in) >= startOfDay)
        .forEach((s: any) => {
          const guestName = s.guests?.name || 'Guest';
          const bed = s.units?.label || 'Unit';
          generatedAlerts.push({
            id: `paylater-${s.id}`,
            type: 'pay_later',
            title: `Pay-Later Check-in: ₹${Number(s.amount).toLocaleString('en-IN')}`,
            subtitle: `${guestName} (${bed})`,
            detail: `Checked in ${new Date(s.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            severity: 'medium',
          });
        });

      // 4. Outstanding balances on checked-out stays (Bad Debt, all-time)
      allStays
        .filter((s: any) => s.status === 'checked_out' && Number(s.paid_amount || 0) < Number(s.amount || 0))
        .forEach((s: any) => {
          const guestName = s.guests?.name || 'Guest';
          const unpaid = Number(s.amount) - Number(s.paid_amount || 0);
          generatedAlerts.push({
            id: `baddebt-${s.id}`,
            type: 'outstanding',
            title: `Uncollected Balance: ₹${unpaid.toLocaleString('en-IN')}`,
            subtitle: `${guestName} (Checked-out)`,
            detail: `Total ₹${Number(s.amount).toLocaleString('en-IN')} | Paid ₹${Number(s.paid_amount || 0).toLocaleString('en-IN')}`,
            severity: 'high',
          });
        });

      // 5. Co-sign PIN failures today
      const failedPins = auditRes.data || [];
      if (failedPins.length > 0) {
        generatedAlerts.push({
          id: 'pin-failures-today',
          type: 'pin_failed',
          title: `Co-Sign Verification Failures: ${failedPins.length} attempt(s)`,
          subtitle: 'Potential unauthorized handover attempt',
          detail: `Last failure at ${new Date(failedPins[failedPins.length - 1].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          severity: 'medium',
        });
      }

      setAlerts(generatedAlerts);

      // --- SECTION C: RECONCILIATION SNAPSHOT ---
      const activeStays = allStays.filter((s: any) => s.status === 'checked_in');
      const longStaysList: { guestName: string; days: number; bedLabel: string }[] = [];
      const nowMs = Date.now();
      const longStayThresholdMs = LONG_STAY_DAYS * 24 * 60 * 60 * 1000;

      activeStays.forEach((s: any) => {
        const checkInMs = new Date(s.check_in).getTime();
        const durationMs = nowMs - checkInMs;
        if (durationMs > longStayThresholdMs) {
          const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
          longStaysList.push({
            guestName: s.guests?.name || 'Guest',
            days,
            bedLabel: s.units?.label || 'Unit',
          });
        }
      });

      const allRooms = roomsRes.data || [];
      let totalBeds = 0;
      const maintenance: string[] = [];
      const dirty: string[] = [];

      allRooms.forEach((r: any) => {
        const units = r.units || [];
        units.forEach((u: any) => {
          totalBeds += 1;
          const fullLabel = `${r.label} - ${u.label}`;
          if (u.housekeeping_status === 'maintenance') maintenance.push(fullLabel);
          else if (u.housekeeping_status === 'dirty') dirty.push(fullLabel);
        });
      });

      setRecon({
        activeGuestsCount: activeStays.length,
        totalBedsCount: totalBeds,
        maintenanceBeds: maintenance,
        dirtyBeds: dirty,
        longStays: longStaysList,
      });

      setFetchedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Error loading daily digest:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDigest();
    }, [loadDigest])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDigest();
  };

  const todayDisplay = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accentText} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Compiling daily audit digest...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Daily Digest"
        subtitle={`${propertyName} • ${todayDisplay}`}
        right={
          <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: theme.surfaceSubtle }]} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={theme.accentText} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentText} />}
      >
        {/* Timestamp */}
        <View style={styles.timeBadgeRow}>
          <Text style={[styles.timeBadgeText, { color: theme.textTertiary }]}>Last updated at {fetchedAt || 'just now'}</Text>
        </View>

        {/* SECTION A: CASH SUMMARY */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="wallet-outline" size={18} color={theme.accentText} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Cash Summary (Today)</Text>
            </View>
            {cashSummary.hasOpenShift && (
              <View style={[styles.openBadge, { backgroundColor: '#dbeafe' }]}>
                <Text style={[styles.openBadgeText, { color: '#1d4ed8' }]}>Shift Open</Text>
              </View>
            )}
          </View>

          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: theme.textSecondary }]}>Opening Drawer Cash</Text>
            <Text style={[styles.calcValue, { color: theme.text }]}>₹{cashSummary.openingCash.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: '#059669' }]}>+ Cash Collections</Text>
            <Text style={[styles.calcValue, { color: '#059669' }]}>+₹{cashSummary.collections.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: theme.destructive }]}>− Petty Cash Expenses</Text>
            <Text style={[styles.calcValue, { color: theme.destructive }]}>−₹{cashSummary.pettyCash.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { color: theme.destructive }]}>− Cash Refunds</Text>
            <Text style={[styles.calcValue, { color: theme.destructive }]}>−₹{cashSummary.refunds.toLocaleString('en-IN')}</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

          <View style={styles.calcRowTotal}>
            <Text style={[styles.calcLabelTotal, { color: theme.text }]}>Expected Drawer Cash</Text>
            <Text style={[styles.calcValueTotal, { color: theme.text }]}>₹{cashSummary.expectedDrawer.toLocaleString('en-IN')}</Text>
          </View>

          {cashSummary.hasClosedShift && (
            <>
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: theme.textSecondary }]}>Counted Cash (Closed Shifts)</Text>
                <Text style={[styles.calcValue, { color: theme.text }]}>₹{Number(cashSummary.countedCash).toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.calcRow, styles.varianceRow, { borderTopColor: theme.borderSubtle }]}>
                <Text style={[styles.varianceLabel, { color: theme.textSecondary }]}>Drawer Variance</Text>
                <Text
                  style={[
                    styles.varianceValue,
                    { color: (cashSummary.variance || 0) === 0 ? '#16a34a' : '#dc2626' },
                  ]}
                >
                  {(cashSummary.variance || 0) > 0 ? '+' : ''}
                  ₹{Number(cashSummary.variance).toLocaleString('en-IN')}
                  {(cashSummary.variance || 0) === 0 ? ' (Matched ✓)' : ' (Discrepancy)'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* SECTION B: ALERTS */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="alert-circle-outline" size={18} color={alerts.length > 0 ? '#f59e0b' : '#16a34a'} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Audit Alerts</Text>
            </View>
            <View
              style={[
                styles.alertCountBadge,
                { backgroundColor: alerts.length > 0 ? '#fee2e2' : '#dcfce7' }
              ]}
            >
              <Text
                style={[
                  styles.alertCountText,
                  { color: alerts.length > 0 ? '#dc2626' : '#15803d' }
                ]}
              >
                {alerts.length}
              </Text>
            </View>
          </View>

          {alerts.length === 0 ? (
            <View style={[styles.emptyAlertsBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
              <Ionicons name="checkmark-circle-outline" size={26} color="#16a34a" />
              <Text style={[styles.emptyAlertsTitle, { color: '#15803d' }]}>No alerts today</Text>
              <Text style={[styles.emptyAlertsSub, { color: theme.textSecondary }]}>
                No refunds, excessive petty cash, or lockout anomalies recorded.
              </Text>
            </View>
          ) : (
            <View style={styles.alertsList}>
              {alerts.map((alert) => (
                <View
                  key={alert.id}
                  style={[
                    styles.alertCard,
                    {
                      backgroundColor:
                        alert.severity === 'high'
                          ? '#fef2f2'
                          : alert.severity === 'medium'
                          ? '#fffbeb'
                          : theme.surfaceSubtle,
                      borderLeftColor:
                        alert.severity === 'high'
                          ? '#ef4444'
                          : alert.severity === 'medium'
                          ? '#f59e0b'
                          : theme.textTertiary,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertItemTitle, { color: theme.text }]}>{alert.title}</Text>
                    <Text style={[styles.alertItemSub, { color: theme.textSecondary }]}>{alert.subtitle}</Text>
                  </View>
                  <Text style={[styles.alertItemDetail, { color: theme.textSecondary }]}>{alert.detail}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* SECTION C: RECONCILIATION SNAPSHOT */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="bed-outline" size={18} color={theme.accentText} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Bed & Stay Reconciliation</Text>
            </View>
          </View>

          <View style={styles.snapshotGrid}>
            <View style={[styles.snapshotBox, { backgroundColor: theme.surfaceSubtle }]}>
              <Text style={[styles.snapshotNum, { color: theme.text }]}>{recon.activeGuestsCount}</Text>
              <Text style={[styles.snapshotLbl, { color: theme.textSecondary }]}>Active Guests</Text>
            </View>
            <View style={[styles.snapshotBox, { backgroundColor: theme.surfaceSubtle }]}>
              <Text style={[styles.snapshotNum, { color: theme.text }]}>{recon.totalBedsCount}</Text>
              <Text style={[styles.snapshotLbl, { color: theme.textSecondary }]}>Total Beds</Text>
            </View>
            <View style={[styles.snapshotBox, { backgroundColor: theme.surfaceSubtle }]}>
              <Text style={[styles.snapshotNum, { color: recon.dirtyBeds.length > 0 ? theme.dirty : theme.free }]}>
                {recon.dirtyBeds.length}
              </Text>
              <Text style={[styles.snapshotLbl, { color: theme.textSecondary }]}>Dirty Beds</Text>
            </View>
          </View>

          {recon.dirtyBeds.length > 0 && (
            <View style={[styles.subDetailSection, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subDetailTitle, { color: theme.dirty }]}>Beds Needing Turnover:</Text>
              <Text style={[styles.subDetailList, { color: theme.textSecondary }]}>{recon.dirtyBeds.join(', ')}</Text>
            </View>
          )}

          {recon.maintenanceBeds.length > 0 && (
            <View style={[styles.subDetailSection, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subDetailTitle, { color: theme.destructive }]}>Beds in Maintenance:</Text>
              <Text style={[styles.subDetailList, { color: theme.textSecondary }]}>{recon.maintenanceBeds.join(', ')}</Text>
            </View>
          )}

          {recon.longStays.length > 0 && (
            <View style={[styles.subDetailSection, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subDetailTitle, { color: '#7c3aed' }]}>
                Long Stays ({`>`} {LONG_STAY_DAYS} days):
              </Text>
              {recon.longStays.map((ls, idx) => (
                <Text key={idx} style={[styles.longStayRow, { color: theme.textSecondary }]}>
                  • {ls.guestName} ({ls.bedLabel}) — {ls.days} days in-house
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* FOOTER */}
        <View style={[styles.footerBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
          <Ionicons name="clipboard-outline" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Physical check: count the physical cash drawer and compare against the expected drawer balance above.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  refreshBtnText: {
    fontSize: 18,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  timeBadgeRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  timeBadgeText: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
  },
  openBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  openBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcLabel: {
    fontSize: 14,
    color: '#475569',
  },
  calcValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#0f172a',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  calcRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcLabelTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  calcValueTotal: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#0f172a',
  },
  varianceRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  varianceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  varianceValue: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  alertCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeRed: {
    backgroundColor: '#fee2e2',
  },
  badgeGreen: {
    backgroundColor: '#dcfce7',
  },
  alertCountText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#0f172a',
  },
  emptyAlertsBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  emptyAlertsEmoji: {
    fontSize: 24,
    color: '#16a34a',
    fontWeight: 'bold',
  },
  emptyAlertsTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '600',
    color: '#15803d',
    marginTop: 6,
  },
  emptyAlertsSub: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  alertsList: {
    gap: 8,
  },
  alertCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
    borderLeftColor: '#94a3b8',
  },
  alertCardHigh: {
    backgroundColor: '#fef2f2',
    borderLeftColor: '#ef4444',
  },
  alertCardMedium: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#f59e0b',
  },
  alertItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  alertItemSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  alertItemDetail: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
  snapshotGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  snapshotBox: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginHorizontal: 3,
  },
  snapshotNum: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#0f172a',
  },
  snapshotLbl: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  subDetailSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  subDetailTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  subDetailList: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  longStayRow: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  footerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  footerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#1e40af',
    flex: 1,
    lineHeight: 16,
  },
});
