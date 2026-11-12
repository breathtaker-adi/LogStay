// src/app/audit-log.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { ScreenHeader } from '@/lib/screen-header';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

export default function AuditLogScreen() {
  const theme = useTheme();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { can } = useStaff();

  useEffect(() => {
    if (!can('settings')) {
      Alert.alert('Access Denied', 'Only owners can view the audit log.');
      router.back();
      return;
    }
    fetchLogs();
  }, [can]);

  const fetchLogs = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: member } = await supabase
      .from('members')
      .select('property_id')
      .eq('user_id', userData.user?.id)
      .single();

    if (member) {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('property_id', member.property_id)
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (!error && data) setLogs(data);
    }
    setLoading(false);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Audit Trail"
        subtitle="Security & Transaction Trail"
      />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.logCard, { backgroundColor: theme.surface, borderColor: theme.border, borderLeftColor: theme.accent }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.actionText, { color: theme.text }]}>{item.action.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={[styles.dateText, { color: theme.textSecondary }]}>{formatDate(item.created_at)}</Text>
              </View>
              {item.record_id && (
                <Text style={[styles.recordText, { color: theme.textTertiary }]}>Ref ID: {item.record_id.substring(0, 8)}...</Text>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textTertiary }]}>No audit events recorded yet.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2563eb', fontSize: 16 },
  title: { fontFamily: Fonts.serif, fontSize: 20, fontWeight: '700' },
  logCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#2563eb' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  actionText: { fontWeight: '700', color: '#0f172a', flex: 1, fontSize: 14.5 },
  dateText: { color: '#64748b', fontSize: 12, fontVariant: ['tabular-nums'] },
  recordText: { color: '#64748b', fontSize: 12, fontFamily: Fonts.mono },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 }
});