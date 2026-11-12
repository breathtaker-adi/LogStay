// src/app/outbox.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { getDb, processOutbox } from '@/lib/offline';
import { ScreenHeader } from '@/lib/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

export default function OutboxScreen() {
  const theme = useTheme();
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
    <View style={[styles.itemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemType, { color: theme.text }]}>{item.type.replace(/_/g, ' ').toUpperCase()}</Text>
        <Text style={[styles.statusBadge,
          item.status === 'failed' ? { backgroundColor: '#ef4444' } :
          item.status === 'pending' ? { backgroundColor: '#f59e0b' } : { backgroundColor: '#16a34a' }
        ]}>
          {item.status?.toUpperCase() || 'PENDING'}
        </Text>
      </View>
      <Text style={[styles.itemPayload, { color: theme.textSecondary }]}>{item.payload}</Text>
      {item.attempts > 0 && <Text style={[styles.attempts, { color: theme.textTertiary }]}>Attempts: {item.attempts}/5</Text>}
      {item.last_error && <Text style={[styles.errorText, { color: theme.destructive }]}>Error: {item.last_error}</Text>}

      {item.status === 'failed' && (
        <Pressable style={[styles.discardBtn, { backgroundColor: theme.destructiveSubtle }]} onPress={() => handleDiscard(item.id)}>
          <Text style={[styles.discardBtnText, { color: theme.destructive }]}>Discard Failed Item</Text>
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Offline Outbox"
        subtitle="Sync Queue"
        right={
          <Pressable onPress={handleRetryAll} disabled={loading} style={{ paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={[styles.retryBtn, { color: theme.free }]}>Retry</Text>
          </Pressable>
        }
      />

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textTertiary }]}>Queue is empty. All data synced.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2563eb', fontSize: 16 },
  title: { fontFamily: Fonts.serif, fontSize: 20, fontWeight: '700' },
  retryBtn: { color: '#16a34a', fontWeight: '700', fontSize: 15 },
  itemCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemType: { fontWeight: '700', color: '#0f172a' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 10, fontWeight: '700', color: '#fff', overflow: 'hidden' },
  statusPending: { backgroundColor: '#f59e0b' },
  statusFailed: { backgroundColor: '#ef4444' },
  statusSynced: { backgroundColor: '#16a34a' },
  itemPayload: { fontSize: 12, color: '#475569', fontFamily: Fonts.mono },
  attempts: { fontSize: 12, color: '#64748b', marginTop: 8, fontVariant: ['tabular-nums'] },
  errorText: { fontSize: 12, color: '#dc2626', marginTop: 4, fontStyle: 'italic' },
  discardBtn: { marginTop: 12, backgroundColor: '#fee2e2', padding: 10, borderRadius: 8, alignItems: 'center' },
  discardBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 }
});