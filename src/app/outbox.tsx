// src/app/outbox.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { getDb, processOutbox } from '@/lib/offline';
import { ScreenHeader } from '@/lib/screen-header';

export default function OutboxScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    setLoading(true);
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM outbox ORDER BY created_at DESC');
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleRetryAll = async () => {
    setLoading(true);
    await processOutbox();
    await fetchItems();
    Alert.alert('Sync Complete', 'Pending items have been processed.');
  };

  const handleDiscard = async (id: string) => {
    Alert.alert(
      "Discard Failed Item?",
      "This action cannot be undone. The data will be lost.",
      [
        { text: "Cancel" },
        { text: "Discard", style: "destructive", onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
          fetchItems();
        }}
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemType}>{item.type.replace(/_/g, ' ').toUpperCase()}</Text>
        <Text style={[styles.statusBadge, 
          item.status === 'failed' ? styles.statusFailed : 
          item.status === 'pending' ? styles.statusPending : styles.statusSynced
        ]}>
          {item.status?.toUpperCase() || 'PENDING'}
        </Text>
      </View>
      <Text style={styles.itemPayload}>{item.payload}</Text>
      {item.attempts > 0 && <Text style={styles.attempts}>Attempts: {item.attempts}/5</Text>}
      {item.last_error && <Text style={styles.errorText}>Error: {item.last_error}</Text>}
      
      {item.status === 'failed' && (
        <Pressable style={styles.discardBtn} onPress={() => handleDiscard(item.id)}>
          <Text style={styles.discardBtnText}>Discard Failed Item</Text>
        </Pressable>
      )}
    </View>
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await processOutbox();
      await fetchItems();
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Offline Outbox"
        subtitle="Sync Queue"
        right={
          <Pressable onPress={handleRetryAll} disabled={loading} style={{ paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={styles.retryBtn}>Retry</Text>
          </Pressable>
        }
      />

      {loading && !refreshing ? (
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Queue is empty. All data synced.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2563eb', fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  retryBtn: { color: '#10b981', fontWeight: 'bold', fontSize: 16 },
  itemCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemType: { fontWeight: 'bold', color: '#1e293b' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 10, fontWeight: 'bold', color: '#fff', overflow: 'hidden' },
  statusPending: { backgroundColor: '#f59e0b' },
  statusFailed: { backgroundColor: '#ef4444' },
  statusSynced: { backgroundColor: '#10b981' },
  itemPayload: { fontSize: 12, color: '#64748b', fontFamily: 'monospace' },
  attempts: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4, fontStyle: 'italic' },
  discardBtn: { marginTop: 12, backgroundColor: '#fee2e2', padding: 8, borderRadius: 6, alignItems: 'center' },
  discardBtnText: { color: '#ef4444', fontWeight: 'bold', fontSize: 12 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 16 }
});