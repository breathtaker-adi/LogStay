import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PaywallScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Subscription Expired</Text>
      <Text style={styles.text}>Your LogStay subscription has ended. Please contact support to renew your plan and regain access to your dashboard.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ef4444', marginBottom: 16 },
  text: { fontSize: 16, color: '#64748b', textAlign: 'center', lineHeight: 24 }
});