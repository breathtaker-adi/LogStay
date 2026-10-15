// src/app/guests.tsx
import React, { useState, useEffect } from 'react';
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

export default function GuestsScreen() {
  const { activeStaff, can } = useStaff();
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

  const fetchGuests = async () => {
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
  };

  useEffect(() => {
    fetchGuests();
  }, [tab]);

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
    <View style={styles.root}>
      <ScreenHeader
        title="Guests"
        subtitle={lastSynced ? `Last synced ${lastSynced}` : `${guests.length} guest${guests.length === 1 ? '' : 's'}`}
        right={
          <TouchableOpacity
            style={styles.addGuestHeaderBtn}
            onPress={() => router.push('/checkin')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add" size={16} color="#ffffff" />
            <Text style={styles.addGuestHeaderText}>Check-In</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.container}>
        {/* Segmented Filter Pills */}
        <View style={styles.tabContainer}>
          <Pressable 
            style={[styles.tabPill, tab === 'in_house' && styles.tabPillActive]} 
            onPress={() => handleTabChange('in_house')}
          >
            <Ionicons 
              name="bed" 
              size={16} 
              color={tab === 'in_house' ? '#2563eb' : '#64748b'} 
            />
            <Text style={[styles.tabPillText, tab === 'in_house' && styles.tabPillTextActive]}>
              In House
            </Text>
            {tab === 'in_house' && guests.length > 0 && (
              <View style={styles.tabCountBadge}>
                <Text style={styles.tabCountText}>{guests.length}</Text>
              </View>
            )}
          </Pressable>

          <Pressable 
            style={[styles.tabPill, tab === 'past' && styles.tabPillActive]} 
            onPress={() => handleTabChange('past')}
          >
            <Ionicons 
              name="time" 
              size={16} 
              color={tab === 'past' ? '#2563eb' : '#64748b'} 
            />
            <Text style={[styles.tabPillText, tab === 'past' && styles.tabPillTextActive]}>
              Past Guests
            </Text>
          </Pressable>
        </View>

        {/* Daily Police Register PDF Export Button */}
        <TouchableOpacity
          style={styles.exportRegisterBtn}
          onPress={handleExportRegisterPDF}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text-outline" size={15} color="#1d4ed8" />
          <Text style={styles.exportRegisterText}>Export Daily Register (PDF)</Text>
        </TouchableOpacity>

        {/* Modern Search Input */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search guest by name or phone..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {loading && guests.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading guest records...</Text>
          </View>
        ) : (
          <FlatList
            data={displayGuests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const guestName = item.guests?.name || 'Guest';
              const initial = guestName.charAt(0).toUpperCase() || 'G';
              const isInHouse = item.status === 'checked_in';
              const stayAmount = Number(item.amount || 0);

              return (
                <TouchableOpacity 
                  style={styles.guestCard} 
                  activeOpacity={0.7}
                  onPress={() => router.push(`/guest/${item.guests?.id || item.id}?stayId=${item.id}`)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>

                  <View style={styles.guestDetails}>
                    <View style={styles.nameRow}>
                      <Text style={styles.guestName} numberOfLines={1}>{guestName}</Text>
                      {item.guests?.nationality && item.guests.nationality.toLowerCase() !== 'india' && (
                        <View style={styles.foreignPill}>
                          <Text style={styles.foreignPillText}>🌐 {item.guests.nationality}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.metaRow}>
                      <Ionicons name="call-outline" size={13} color="#64748b" />
                      <Text style={styles.guestPhone}>{item.guests?.phone || 'No phone number'}</Text>
                    </View>
                  </View>

                  <View style={styles.rightSection}>
                    <View style={[styles.statusBadge, isInHouse ? styles.statusBadgeActive : styles.statusBadgeOut]}>
                      <View style={[styles.statusDot, isInHouse ? styles.statusDotActive : styles.statusDotOut]} />
                      <Text style={[styles.statusText, isInHouse ? styles.statusTextActive : styles.statusTextOut]}>
                        {isInHouse ? 'In House' : 'Checked Out'}
                      </Text>
                    </View>

                    {stayAmount > 0 ? (
                      <Text style={styles.stayAmount}>₹{stayAmount.toLocaleString('en-IN')}</Text>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" style={styles.chevron} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="people-outline" size={40} color="#94a3b8" />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? 'No Matching Guests' : tab === 'in_house' ? 'No Guests In House' : 'No Past Stays Recorded'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {search 
                    ? `No records found matching "${search}". Try searching another name or phone number.`
                    : tab === 'in_house' 
                      ? 'Register guests now using quick check-in to assign rooms and track folios.' 
                      : 'Past checked-out guest history will show up here.'}
                </Text>
                {tab === 'in_house' && !search && (
                  <TouchableOpacity
                    style={styles.emptyActionBtn}
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
    backgroundColor: '#f8fafc'
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
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2
  },
  addGuestHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    padding: 4,
    borderRadius: 14,
    marginBottom: 12
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10
  },
  tabPillActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },
  tabPillTextActive: {
    color: '#1e293b',
    fontWeight: '700'
  },
  tabCountBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
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
    color: '#64748b',
    fontWeight: '500'
  },
  listContent: {
    paddingBottom: 40
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb'
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
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  foreignPill: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  foreignPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e'
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  guestPhone: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500'
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
    paddingVertical: 4,
    borderRadius: 8
  },
  statusBadgeActive: {
    backgroundColor: '#dcfce7'
  },
  statusBadgeOut: {
    backgroundColor: '#f1f5f9'
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusDotActive: {
    backgroundColor: '#16a34a'
  },
  statusDotOut: {
    backgroundColor: '#94a3b8'
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  statusTextActive: {
    color: '#166534'
  },
  statusTextOut: {
    color: '#475569'
  },
  stayAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
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
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  emptyActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  exportRegisterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  exportRegisterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1d4ed8'
  }
});