import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { isOnline, saveToOutbox, removeStayFromCache, updateLocalUnitStatus } from "../lib/offline";
import { useStaff } from "../lib/staff-context";
import { ScreenHeader } from "@/lib/screen-header";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { buildCheckoutReceiptMessage, openWhatsApp } from "@/lib/whatsapp";

export default function CheckoutScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchActiveStays = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;

      const { data: staysData } = await supabase
        .from('stays')
        .select('id, guest_id, check_in, unit_id, amount, paid_amount, guests(name, phone), units(label)')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in')
        .order('check_in', { ascending: false });

      setActiveStays(staysData || []);

      const { data: prop } = await supabase
        .from('properties')
        .select('name, google_review_url')
        .eq('id', memberData.property_id)
        .single();
      if (prop) setPropertyData(prop);
    } catch (error) {
      console.error("Error fetching stays", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveStays();
  }, [fetchActiveStays]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveStays();
  };

  async function handleCheckout(stay: any) {
    const stayId = stay.id;
    const unitId = stay.unit_id;

    if (await isOnline()) {
      // 1. Fetch stay balance
      const { data: stayData } = await supabase
        .from('stays')
        .select('amount, paid_amount')
        .eq('id', stayId)
        .single();

      const { data: chargesData } = await supabase
        .from('charges')
        .select('unit_price, qty')
        .eq('stay_id', stayId);

      const totalCharges = (chargesData || []).reduce((sum, c) => sum + Number(c.unit_price) * c.qty, 0);
      const balance = (Number(stayData?.amount || 0) + totalCharges) - Number(stayData?.paid_amount || 0);

      // 2. Check balance
      if (balance > 0) {
        Alert.alert(
          'Balance Due',
          `This guest has an unpaid balance of ₹${balance.toFixed(2)}. Please collect payment before checking out.`,
          [
            { text: 'Cancel' },
            { text: 'Go to Folio', onPress: () => router.push(`/guest/${stay.guest_id}?stayId=${stay.id}`) }
          ]
        );
        return; // Block checkout
      }
    }

    Alert.alert(
      "Confirm Check-Out",
      `Are you sure you want to check out ${stay.guests?.name || 'this guest'}? The bed will be marked dirty for housekeeping.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check-Out",
          style: "destructive",
          onPress: async () => {
            try {
              if (await isOnline()) {
                const { error: rpcError } = await supabase.rpc('check_out_guest', {
                  p_stay_id: stayId,
                  p_staff_id: activeStaff?.id
                });

                if (rpcError) {
                  Alert.alert("Checkout Failed", rpcError.message);
                  return;
                }
                // Online success: immediately reflect in local cache
                await removeStayFromCache(stayId);
                await updateLocalUnitStatus(unitId, 'dirty');
              } else {
                // Offline: Queue it
                await saveToOutbox('guest_checkout', { 
                  stay_id: stayId,
                  staff_id: activeStaff?.id
                });
                // Optimistic UI: Remove from local cache so bed grid updates instantly
                await removeStayFromCache(stayId);
                await updateLocalUnitStatus(unitId, 'dirty');
              }

              const guestPhone = stay.guests?.phone;
              const guestName = stay.guests?.name || 'Guest';
              const receiptMsg = buildCheckoutReceiptMessage({
                guestName,
                propertyName: propertyData?.name || 'LogStay',
                unitLabel: stay.units?.label || 'Room',
                checkInDate: stay.check_in ? new Date(stay.check_in).toLocaleDateString('en-GB') : undefined,
                checkOutDate: new Date().toLocaleDateString('en-GB'),
                tariffAmount: Number(stay.amount || 0),
                totalPaid: Number(stay.paid_amount || stay.amount || 0),
                googleReviewUrl: propertyData?.google_review_url
              });

              if (guestPhone) {
                Alert.alert(
                  "Checked Out",
                  `Guest ${guestName} checked out successfully.\n\nSend final receipt & review link via WhatsApp?`,
                  [
                    {
                      text: "Done",
                      onPress: () => {
                        fetchActiveStays();
                        router.replace('/home');
                      }
                    },
                    {
                      text: "Send WhatsApp",
                      onPress: async () => {
                        await openWhatsApp(guestPhone, receiptMsg);
                        fetchActiveStays();
                        router.replace('/home');
                      }
                    }
                  ]
                );
              } else {
                Alert.alert("Checked Out", "Guest has been checked out successfully.");
                fetchActiveStays(); // Refresh list
                router.replace('/home');
              }
            } catch (error: any) {
              Alert.alert("Error", error.message || "Checkout failed");
            }
          }
        }
      ]
    );
  }

  const filteredStays = search
    ? activeStays.filter(s =>
        s.guests?.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.units?.label?.toLowerCase().includes(search.toLowerCase()) ||
        s.guests?.phone?.includes(search)
      )
    : activeStays;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title="Check-Out"
        subtitle={`${activeStays.length} active stay${activeStays.length === 1 ? '' : 's'}`}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={styles.container}>
          {/* Search Bar */}
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="search" size={18} color={theme.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by guest name or room/bed..."
              placeholderTextColor={theme.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading in-house guests...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredStays}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
            renderItem={({ item }) => {
              const guestName = item.guests?.name || 'Guest';
              const initial = guestName.charAt(0).toUpperCase();

              return (
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.avatar, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
                      <Text style={[styles.avatarText, { color: theme.accentText }]}>{initial}</Text>
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.guestName, { color: theme.text }]} numberOfLines={1}>{guestName}</Text>
                      <View style={styles.pillRow}>
                        <View style={[styles.bedBadge, { backgroundColor: theme.freeSubtle }]}>
                          <Ionicons name="bed" size={12} color={theme.free} />
                          <Text style={[styles.bedLabel, { color: theme.free }]}>Bed: {item.units?.label || 'N/A'}</Text>
                        </View>
                        <View style={[styles.dateBadge, { backgroundColor: theme.surfaceSubtle }]}>
                          <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} />
                          <Text style={[styles.dateText, { color: theme.textSecondary }]}>Since {new Date(item.check_in).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.actionRow, { borderTopColor: theme.borderSubtle }]}>
                    <TouchableOpacity
                      style={[styles.folioBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                      onPress={() => router.push(`/guest/${item.guest_id}?stayId=${item.id}`)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="receipt-outline" size={15} color={theme.accentText} />
                      <Text style={[styles.folioBtnText, { color: theme.accentText }]}>Folio</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.checkoutBtn, { backgroundColor: '#dc2626', shadowColor: '#dc2626' }]}
                      onPress={() => handleCheckout(item)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="door-open" size={18} color="#ffffff" />
                      <Text style={styles.checkoutBtnText}>Check-Out</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconCircle, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color="#16a34a" />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {search ? 'No Matching Stays' : 'All Clear! No Active Guests'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  {search
                    ? `No active check-ins matched "${search}".`
                    : 'There are currently no guests checked in requiring departure.'}
                </Text>
              </View>
            }
          />
        )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
    shadowColor: "#000",
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
    color: "#0f172a",
    paddingVertical: 0
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    gap: 12
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500"
  },
  listContent: {
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe"
  },
  avatarText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: "700",
    color: "#2563eb"
  },
  cardInfo: {
    flex: 1
  },
  guestName: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 4
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap"
  },
  bedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E7ECE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  bedLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: "#3A5A3E"
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  dateText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9"
  },
  folioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1"
  },
  folioBtnText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700"
  },
  checkoutBtn: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2
  },
  checkoutBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 6
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18
  }
});