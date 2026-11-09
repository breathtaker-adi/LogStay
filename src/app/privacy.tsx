// src/app/privacy.tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenHeader } from '@/lib/screen-header';

interface PolicyCardProps {
  icon: any;
  iconBg: string;
  iconColor: string;
  tag: string;
  tagBg: string;
  tagColor: string;
  title: string;
  children: React.ReactNode;
}

function PolicyCard({ icon, iconBg, iconColor, tag, tagBg, tagColor, title, children }: PolicyCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.headerTitles}>
          <View style={[styles.tagPill, { backgroundColor: tagBg }]}>
            <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        {children}
      </View>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Privacy & Security"
        subtitle="Guest data protection & compliance policy"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1 */}
        <PolicyCard
          icon="document-text-outline"
          iconBg="#eff6ff"
          iconColor="#2563eb"
          tag="REGULATORY COMPLIANCE"
          tagBg="#dbeafe"
          tagColor="#1e40af"
          title="Why we collect guest data"
        >
          <Text style={styles.bodyText}>
            As mandated by the Indian Bureau of Immigration and local State Police regulations, 
            all hotels, hostels, and guest houses are legally required to verify and retain 
            identification details of every residing guest.
          </Text>
        </PolicyCard>

        {/* Section 2 */}
        <PolicyCard
          icon="card-outline"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          tag="DATA ELEMENTS"
          tagBg="#dcfce7"
          tagColor="#15803d"
          title="What data is collected"
        >
          <View style={styles.bulletList}>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Full Legal Name & Phone Number</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Nationality & Government ID Type (Aadhaar, Passport, Driving License)</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Secure capture photo of the government ID document</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>For foreign nationals: Visa type, number, arrival date, and port of entry (Form C)</Text>
            </View>
          </View>
        </PolicyCard>

        {/* Section 3 */}
        <PolicyCard
          icon="timer-outline"
          iconBg="#fffbeb"
          iconColor="#d97706"
          tag="DATA MINIMIZATION"
          tagBg="#fef3c7"
          tagColor="#92400e"
          title="Retention & 6-month photo purge"
        >
          <Text style={styles.bodyText}>
            Guest ID photographs are stored in private encrypted storage and are automatically 
            purged after 6 months from check-in.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            Text records (name, masked ID last-4, stay duration) are maintained solely for 
            the statutory period mandated by law for police register verification.
          </Text>
        </PolicyCard>

        {/* Section 4 */}
        <PolicyCard
          icon="eye-outline"
          iconBg="#fdf2f8"
          iconColor="#db2777"
          tag="AUDIT INTEGRITY"
          tagBg="#fce7f3"
          tagColor="#9d174d"
          title="Access controls & view auditing"
        >
          <Text style={styles.bodyText}>
            Guest records are strictly scoped to verified property staff. Whenever any staff member 
            opens or views a guest ID photo, an immutable record is logged to the property audit log 
            with timestamp and staff identifier.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            Guest records and ID photos are never indexed, shared, or made public.
          </Text>
        </PolicyCard>

        {/* Section 5 */}
        <PolicyCard
          icon="shield-checkmark"
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
          tag="HARDWARE PROTECTION"
          tagBg="#ede9fe"
          tagColor="#5b21b6"
          title="Device & database encryption"
        >
          <View style={styles.bulletList}>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Local offline database is encrypted with AES-256 (SQLCipher).</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Authentication sessions and security tokens are secured in the device hardware keystore.</Text>
            </View>
            <View style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>Direct database table writes are revoked; all mutations pass through role-validated stored procedures.</Text>
            </View>
          </View>
        </PolicyCard>

        {/* Footer */}
        <View style={styles.footerNote}>
          <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#94a3b8" />
          <Text style={styles.footerText}>LogStay Privacy & Security Engine v1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  headerTitles: {
    flex: 1
  },
  tagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4
  },
  tagText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  cardBody: {
    paddingTop: 2
  },
  bodyText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    fontWeight: '400'
  },
  bulletList: {
    gap: 8
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0f172a',
    marginTop: 7,
    marginRight: 10
  },
  bulletText: {
    flex: 1,
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 20
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 10
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500'
  }
});