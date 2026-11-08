// src/app/my-remarks.tsx
// Apple HIG Staff Remarks & Exit Record Lookup Screen
// Enables any departed or removed staff member to enter their phone number or departure code
// to view their official performance ledger notes left by previous property managers.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/lib/screen-header';
import { useTheme } from '@/hooks/use-theme';

import { TeamService, AuthService } from '@/services';
import { StaffRemark } from '@/types';

export default function MyRemarksScreen() {
  const theme = useTheme();
  const searchParams = useLocalSearchParams<{ code?: string; phone?: string }>();

  const [lookupQuery, setLookupQuery] = useState(
    (searchParams?.code || searchParams?.phone || '').toString()
  );
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [remarks, setRemarks] = useState<StaffRemark[]>([]);
  const [searchedKey, setSearchedKey] = useState('');

  const performSearch = useCallback(async (query: string) => {
    setLoading(true);
    setHasSearched(true);
    setSearchedKey(query);

    try {
      const data = await TeamService.lookupRemarks(query);
      setRemarks(data);
    } catch (err) {
      console.warn('Error fetching remarks ledger:', err);
      setRemarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search on mount if query provided in params or authenticated user
  useEffect(() => {
    let isMounted = true;
    async function initCheck() {
      if (lookupQuery.trim()) {
        if (isMounted) performSearch(lookupQuery.trim());
      } else {
        const user = await AuthService.getCurrentUser();
        if (user && isMounted) {
          performSearch('');
        }
      }
    }
    initCheck();
    return () => {
      isMounted = false;
    };
  }, [lookupQuery, performSearch]);

  const formatRoleLabel = (r: string) => {
    switch (r) {
      case 'owner': return 'Owner';
      case 'co_admin': return 'Co-Admin';
      case 'desk': return 'Front Desk';
      case 'housekeeping': return 'Housekeeper';
      default: return r ? r.toUpperCase() : 'STAFF';
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="My Remarks Ledger"
        subtitle="Official LogStay Exit & Work History"
        showBack={true}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Apple HIG Lookup Input Card */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: theme.accentSubtle }]}>
                <Ionicons name="document-text" size={20} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Employment History Lookup
                </Text>
                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                  Enter your registered phone number or departure pass code to view your official ledger records.
                </Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PHONE NUMBER OR CODE</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
              <Ionicons name="search-outline" size={18} color={theme.textTertiary} style={styles.searchIcon} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="e.g. +91 98765 43210 or 7K9X2A"
                placeholderTextColor={theme.textTertiary}
                value={lookupQuery}
                onChangeText={setLookupQuery}
                onSubmitEditing={() => performSearch(lookupQuery)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {lookupQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setLookupQuery('')}
                  style={styles.clearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.searchBtn, { backgroundColor: theme.accent }]}
              onPress={() => performSearch(lookupQuery)}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#ffffff" />
                  <Text style={styles.searchBtnText}>Retrieve Official Record</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Results Section */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                Retrieving verified remarks from ledger...
              </Text>
            </View>
          ) : hasSearched && remarks.length === 0 ? (
            /* Clean Record / No Remarks Found */
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.freeSubtle }]}>
                <Ionicons name="checkmark-done-circle" size={36} color={theme.free} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Exit Remarks Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {searchedKey
                  ? `There are no disciplinary remarks or negative departure records on file for "${searchedKey}". Your record with partner properties is spotless.`
                  : "No prior performance remarks recorded on your profile. Your record is clear."}
              </Text>
            </View>
          ) : remarks.length > 0 ? (
            /* Remarks List */
            <View style={styles.resultsContainer}>
              <View style={styles.resultsHeaderRow}>
                <Text style={[styles.resultsHeaderTitle, { color: theme.textSecondary }]}>
                  RECORDED REMARKS ({remarks.length})
                </Text>
                <Text style={[styles.ledgerBadge, { color: theme.free }]}>✓ Verified Ledger</Text>
              </View>

              {remarks.map((item, index) => (
                <View
                  key={item.id || index}
                  style={[styles.remarkCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.remarkTopRow}>
                    <View style={styles.propertyInfo}>
                      <Ionicons name="business" size={16} color={theme.accent} />
                      <Text style={[styles.propertyName, { color: theme.text }]}>
                        {item.property_name}
                      </Text>
                    </View>
                    <View style={[styles.roleTagPill, { backgroundColor: theme.accentSubtle }]}>
                      <Text style={[styles.roleTagText, { color: theme.accent }]}>
                        {formatRoleLabel(item.role)}
                      </Text>
                    </View>
                  </View>

                  {/* Remark Quote Callout */}
                  <View style={[styles.quoteContainer, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.textTertiary} style={{ marginTop: 2 }} />
                    <Text style={[styles.quoteText, { color: theme.text }]}>
                      “{item.remark}”
                    </Text>
                  </View>

                  {/* Footer Meta */}
                  <View style={styles.remarkFooterRow}>
                    <Text style={[styles.authorMeta, { color: theme.textTertiary }]}>
                      Authored by {item.removed_by_name} ({formatRoleLabel(item.removed_by_role)})
                    </Text>
                    <Text style={[styles.dateMeta, { color: theme.textTertiary }]}>
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Initial State */
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.surfaceSubtle }]}>
                <Ionicons name="shield-outline" size={32} color={theme.textSecondary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Official Ledger Lookup</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Staff records and manager remarks across all properties are cryptographically signed and stored for transparency.
              </Text>
            </View>
          )}

          {/* Quick Return to Join Property */}
          <TouchableOpacity
            style={[styles.returnBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSubtle }]}
            onPress={() => router.replace('/setup-property')}
            activeOpacity={0.7}
          >
            <Ionicons name="enter-outline" size={16} color={theme.text} />
            <Text style={[styles.returnBtnText, { color: theme.text }]}>
              Connect to a New Property with Join Code
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 18, paddingBottom: 40 },

  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },

  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  searchBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  centerBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    marginTop: 12,
    fontSize: 13,
  },

  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 10,
  },

  resultsContainer: {
    marginBottom: 20,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  resultsHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  ledgerBadge: {
    fontSize: 11,
    fontWeight: '700',
  },

  remarkCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  remarkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  propertyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  propertyName: {
    fontSize: 15,
    fontWeight: '700',
  },
  roleTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  quoteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  quoteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  remarkFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  authorMeta: {
    fontSize: 11,
  },
  dateMeta: {
    fontSize: 11,
  },

  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  returnBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
