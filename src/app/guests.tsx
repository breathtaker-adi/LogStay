// src/app/guests.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isOnline, getGuestsCache, cacheGuests } from '@/lib/offline';

export default function GuestsScreen() {
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<any[]>([]);
  const [tab, setTab] = useState<'in_house' | 'past'>('in_house');
  const [search, setSearch] = useState('');

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

  const displayGuests = search 
    ? guests.filter(s => 
        s.guests?.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.guests?.phone?.includes(search)
      ) 
    : guests;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Guests</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable 
          style={[styles.tab, tab === 'in_house' && styles.tabActive]} 
          onPress={() => setTab('in_house')}>
          <Text style={[styles.tabText, tab === 'in_house' && styles.tabTextActive]}>In House</Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, tab === 'past' && styles.tabActive]} 
          onPress={() => setTab('past')}>
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>Past</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or phone..."
        value={search}
        onChangeText={setSearch}
      />

      {loading && guests.length === 0 ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={displayGuests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable 
              style={styles.guestCard} 
              onPress={() => router.push(`/guest/${item.guests.id}?stayId=${item.id}`)}
            >
              <View style={styles.guestInfo}>
                <Text style={styles.guestName}>{item.guests?.name}</Text>
                <Text style={styles.guestPhone}>{item.guests?.phone || 'No phone'}</Text>
              </View>
              <View style={styles.stayInfo}>
                <Text style={styles.stayAmount}>₹{item.amount}</Text>
                <Text style={styles.stayStatus}>{item.status === 'checked_in' ? 'Active' : 'Out'}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No guests found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  backBtn: { color: '#2563eb', fontSize: 16 },
  tabRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  tabActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  tabText: { color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  searchInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  guestCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  guestInfo: { flex: 1 },
  guestName: { fontSize: 16, fontWeight: '600' },
  guestPhone: { color: '#64748b', marginTop: 2 },
  stayInfo: { alignItems: 'flex-end' },
  stayAmount: { fontSize: 16, fontWeight: 'bold' },
  stayStatus: { fontSize: 12, color: '#10b981', marginTop: 2 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 }
});