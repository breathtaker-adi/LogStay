import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

export default function PaywallScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.destructive }]}>Subscription Expired</Text>
      <Text style={[styles.text, { color: theme.textSecondary }]}>Your LogStay subscription has ended. Please contact support to renew your plan and regain access to your dashboard.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 24 },
  title: { fontFamily: Fonts.serif, fontSize: 26, fontWeight: '700', color: '#ef4444', marginBottom: 14, textAlign: 'center' },
  text: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 23 }
});