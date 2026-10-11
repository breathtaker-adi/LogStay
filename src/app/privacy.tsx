// src/app/privacy.tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Privacy & Data Policy</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1. Why we collect your data</Text>
        <Text style={styles.text}>
          As per the Indian Bureau of Immigration and local police regulations, 
          all hotels, hostels, and guest houses are legally required to collect 
          and retain identification details of all guests.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. What data we collect</Text>
        <Text style={styles.text}>
          - Full Name{'\n'}
          - Phone Number{'\n'}
          - Nationality{'\n'}
          - ID Type and Number (e.g., Aadhaar, Passport){'\n'}
          - A photograph of your ID document{'\n'}
          - For foreign nationals: Visa and arrival details (Form C)
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>3. How long is it kept?</Text>
        <Text style={styles.text}>
          Your ID photograph is automatically deleted from our secure servers 
          6 months after your check-in date, as per standard data minimization 
          practices. Text records (name, phone, masked ID number) are retained 
          for the legally mandated period for police register compliance.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>4. Who can see your data?</Text>
        <Text style={styles.text}>
          Only authorized property staff and owners have access to your data. 
          Every time a staff member views your ID photograph, it is permanently 
          recorded in our audit log for security. ID photos are never made public.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { color: '#2563eb', fontSize: 16, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  text: { fontSize: 15, color: '#475569', lineHeight: 22 }
});