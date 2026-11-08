// src/app/guests.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  LayoutAnimation,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, getGuestsCache, cacheGuests } from '@/lib/offline';
import { ScreenHeader } from '@/lib/screen-header';
import { exportDailyRegisterPDF, DailyRegisterRow } from '@/lib/pdf-reports';
import { useTheme } from '@/hooks/use-theme';

export default function GuestsScreen() {
  const { activeStaff, can } = useStaff();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<any[]>([]);
  const [tab, setTab] = useState<'in_house' | 'past'>('in_house');
  const [search, setSearch] = useState('');

  // RBAC Guard: Housekeeper should not access the full guest directory
  useEffect(() => {
    if (activeStaff && !can('guests')) {
      Alert.alert(
        "Access Restricted",
        "Guest directory and personal details are restricted to Front Desk and Owners."
      );
      router.replace('/home');
    }
  }, [activeStaff, can]);

  const fetchGuests = useCallback(async () => {
    setLoading(true);

    // 1. Read from local cache first (for in-house tab)
    if (tab === 'in_house') {
      const localGuests = await getGuestsCache();
      if (localGuests.length > 0) {
        // Map local cache to look like Supabase response
        const mapped = localGuests.map(g => ({
          id: g.id,
          guests: { id: g.id, name: g.name, phone: g.phone, nationality: g.nationality },
          status: 'checked_in', // We only cache active stays
          amount: 0
        }));
        setGuests(mapped);
        setLoading(false);
      }
    }

    // 2. If online, fetch from Supabase and update cache
    if (await isOnline()) {
      const { data: userData } = await supabase.auth.getUser();
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user?.id)
        .single();

      if (member) {
        let query = supabase
          .from('stays')
          .select(`*, guests ( id, name, phone, nationality )`)
          .eq('property_id', member.property_id);

        if (tab === 'in_house') {
          query = query.eq('status', 'checked_in');
        } else {
          query = query.eq('status', 'checked_out').order('check_out', { ascending: false }).limit(50);
        }

        const { data, error } = await query;
        
        if (!error && data) {
          setGuests(data);
          // Update local cache (only for in-house guests)
          if (tab === 'in_house') {
            await cacheGuests(data.map(s => s.guests).filter(Boolean));
          }
        }
      }
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const handleTabChange = (newTab: 'in_house' | 'past') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTab(newTab);
  };

  const handleExportRegisterPDF = async () => {
    try {
      const rows: DailyRegisterRow[] = guests.map((item, idx) => ({
        sNo: idx + 1,
        roomBed: item.units?.label ? `Unit ${item.units.label}` : 'In-House Bed',
        guestName: item.guests?.name || 'Guest',
        nationality: item.guests?.nationality || 'Indian',
        phone: item.guests?.phone || '—',
        idType: 'Government ID',
        idLast4: undefined,
        checkInTime: item.check_in ? new Date(item.check_in).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today',
        status: item.status === 'checked_in' ? 'IN-HOUSE' : 'CHECKED-OUT'
      }));

      const domesticCount = guests.filter(g => !g.guests?.nationality || g.guests?.nationality === 'India').length;
      const foreignCount = guests.length - domesticCount;

      await exportDailyRegisterPDF({
        propertyName: 'LogStay Hospitality',
        reportDate: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
        totalGuests: guests.length,
        domesticCount,
        foreignCount,
        rows
      });
    } catch (err: any) {
      Alert.alert('PDF Export Error', err?.message || 'Could not export Daily Register PDF');
    }
  };

  const displayGuests = search 
    ? guests.filter(s => 
        s.guests?.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.guests?.phone?.includes(search)
      ) 
    : guests;

  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState('');

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchGuests();
      setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Guests"
        subtitle={lastSynced ? `Last synced ${lastSynced}` : `${guests.length} guest${guests.length === 1 ? '' : 's'}`}
        right={
          <TouchableOpacity
            style={[styles.addGuestHeaderBtn, { backgroundColor: theme.accent }]}
            onPress={() => router.push('/checkin')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Start Guest Check-In"
          >
            <Ionicons name="person-add" size={15} color="#ffffff" />
            <Text style={styles.addGuestHeaderText}>Check-In</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.container}>
        {/* Segmented Filter Pills */}
        <View style={[styles.tabContainer, { backgroundColor: theme.backgroundSubtle }]}>
          <Pressable 
            style={[
              styles.tabPill,
              tab === 'in_house' && [styles.tabPillActive, { backgroundColor: theme.backgroundElement }]
            ]} 
            onPress={() => handleTabChange('in_house')}
            accessibilityRole="tab"
            accessibilityLabel="In House Guests"
          >
            <Ionicons 
              name="bed" 
              size={15} 
              color={tab === 'in_house' ? theme.accent : theme.textSecondary} 
            />
            <Text style={[
              styles.tabPillText,
              { color: theme.textSecondary },
              tab === 'in_house' && [styles.tabPillTextActive, { color: theme.text }]
            ]}>
              In House
            </Text>
            {tab === 'in_house' && guests.length > 0 && (
              <View style={[styles.tabCountBadge, { backgroundColor: theme.accentSubtle }]}>
                <Text style={[styles.tabCountText, { color: theme.accent }]}>{guests.length}</Text>
              </View>
            )}
          </Pressable>

          <Pressable 
            style={[
              styles.tabPill,
              tab === 'past' && [styles.tabPillActive, { backgroundColor: theme.backgroundElement }]
            ]} 
            onPress={() => handleTabChange('past')}
            accessibilityRole="tab"
            accessibilityLabel="Past Guests"
          >
            <Ionicons 
              name="time" 
              size={15} 
              color={tab === 'past' ? theme.accent : theme.textSecondary} 
            />
            <Text style={[
              styles.tabPillText,
              { color: theme.textSecondary },
              tab === 'past' && [styles.tabPillTextActive, { color: theme.text }]
            ]}>
              Past Guests
            </Text>
          </Pressable>
        </View>

        {/* Daily Police Register PDF Export Button */}
        <TouchableOpacity
          style={[styles.exportRegisterBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
          onPress={handleExportRegisterPDF}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Export Daily Register PDF"
        >
          <Ionicons name="document-text-outline" size={15} color={theme.accent} />
          <Text style={[styles.exportRegisterText, { color: theme.accent }]}>Export Daily Register (PDF)</Text>
        </TouchableOpacity>

        {/* Modern Search Input */}
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <Ionicons name="search" size={18} color={theme.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search guest by name or phone..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {loading && guests.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading guest records...</Text>
          </View>
        ) : (
          <FlatList
            data={displayGuests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const guestName = item.guests?.name || 'Guest';
              const initial = guestName.charAt(0).toUpperCase() || 'G';
              const isInHouse = item.status === 'checked_in';
              const stayAmount = Number(item.amount || 0);

              return (
                <TouchableOpacity 
                  style={[styles.guestCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]} 
                  activeOpacity={0.7}
                  onPress={() => router.push(`/guest/${item.guests?.id || item.id}?stayId=${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${guestName}, ${isInHouse ? 'In House' : 'Checked Out'}`}
                >
                  <View style={[styles.avatar, { backgroundColor: theme.accentSubtle, borderColor: theme.separator }]}>
                    <Text style={[styles.avatarText, { color: theme.accent }]}>{initial}</Text>
                  </View>

                  <View style={styles.guestDetails}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.guestName, { color: theme.text }]} numberOfLines={1}>{guestName}</Text>
                      {item.guests?.nationality && item.guests.nationality.toLowerCase() !== 'india' && (
                        <View style={[styles.foreignPill, { backgroundColor: theme.accentSubtle }]}>
                          <Ionicons name="globe-outline" size={10} color={theme.accent} style={{ marginRight: 3 }} />
                          <Text style={[styles.foreignPillText, { color: theme.accent }]}>{item.guests.nationality}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.metaRow}>
                      <Ionicons name="call-outline" size={13} color={theme.textSecondary} />
                      <Text style={[styles.guestPhone, { color: theme.textSecondary }]}>{item.guests?.phone || 'No phone number'}</Text>
                    </View>
                  </View>

                  <View style={styles.rightSection}>
                    <View style={[
                      styles.statusBadge,
                      isInHouse 
                        ? { backgroundColor: theme.freeSubtle } 
                        : { backgroundColor: theme.backgroundSubtle }
                    ]}>
                      <View style={[
                        styles.statusDot,
                        isInHouse 
                          ? { backgroundColor: theme.free } 
                          : { backgroundColor: theme.textTertiary }
                      ]} />
                      <Text style={[
                        styles.statusText,
                        isInHouse 
                          ? { color: theme.free } 
                          : { color: theme.textSecondary }
                      ]}>
                        {isInHouse ? 'In House' : 'Checked Out'}
                      </Text>
                    </View>

                    {stayAmount > 0 ? (
                      <Text style={[styles.stayAmount, { color: theme.text }]}>₹{stayAmount.toLocaleString('en-IN')}</Text>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={styles.chevron} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconCircle, { backgroundColor: theme.backgroundSubtle }]}>
                  <Ionicons name="people-outline" size={40} color={theme.textTertiary} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {search ? 'No Matching Guests' : tab === 'in_house' ? 'No Guests In House' : 'No Past Stays Recorded'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  {search 
                    ? `No records found matching "${search}". Try searching another name or phone number.`
                    : tab === 'in_house' 
                      ? 'Register guests now using quick check-in to assign rooms and track folios.' 
                      : 'Past checked-out guest history will show up here.'}
                </Text>
                {tab === 'in_house' && !search && (
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, { backgroundColor: theme.accent }]}
                    onPress={() => router.push('/checkin')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-add" size={16} color="#ffffff" />
                    <Text style={styles.emptyActionText}>Start Guest Check-In</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  addGuestHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addGuestHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    marginBottom: 12
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9
  },
  tabPillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabPillTextActive: {
    fontWeight: '600'
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    gap: 12
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500'
  },
  listContent: {
    paddingBottom: 40
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '700',
  },
  guestDetails: {
    flex: 1,
    marginRight: 8
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4
  },
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2
  },
  foreignPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  foreignPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  guestPhone: {
    fontSize: 13,
    fontWeight: '400'
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 6
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  statusBadgeActive: {
  },
  statusBadgeOut: {
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusDotActive: {
  },
  statusDotOut: {
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600'
  },
  statusTextActive: {
  },
  statusTextOut: {
  },
  stayAmount: {
    fontSize: 13,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: 6
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center'
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  exportRegisterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  exportRegisterText: {
    fontSize: 13,
    fontWeight: '600',
  }
});