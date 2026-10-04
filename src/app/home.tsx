import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { getPendingCount, processOutbox, isOnline, getRoomsCache, getUnitsCache, getStaysCache, cacheRooms, cacheUnits, cacheStays } from "../lib/offline";

export default function HomeScreen() {
  // FIX: Added propertyId state here to prevent the crash!
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeGuests, setActiveGuests] = useState(0);
  const [activeShiftCash, setActiveShiftCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    try {
      // 1. INSTANT LOAD FROM LOCAL CACHE
      const localRooms = getRoomsCache();
      const localUnits = getUnitsCache();
      const localStays = getStaysCache();
      const localOccupiedIds = localStays.map((s:any) => s.unit_id);

      const localGrid = localUnits.map((u:any) => {
        const room = localRooms.find((r:any) => r.id === u.room_id);
        let status = 'free';
        if (localOccupiedIds.includes(u.id)) status = 'occupied';
        else if (u.housekeeping_status === 'dirty') status = 'dirty';
        return { id: u.id, label: `${room?.label || 'Room'} - ${u.label}`, status };
      });
      setRooms(localGrid);
      setActiveGuests(localStays.length);

      // 2. CHECK IF ONLINE
      const online = await isOnline();
      if (!online) {
        setPendingCount(getPendingCount());
        return;
      }

      // 3. FETCH FRESH DATA
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) { router.replace("/setup-property"); return; }
      setPropertyId(memberData.property_id);

      const { data: property } = await supabase.from('properties').select('name').eq('id', memberData.property_id).single();
      setPropertyName(property?.name || "Unknown");

      const { data: roomsData } = await supabase.from('rooms').select('id, label, kind').eq('property_id', memberData.property_id);
      const roomIds = roomsData?.map((r:any) => r.id) || [];
      const { data: unitsData } = await supabase.from('units').select('id, label, room_id, housekeeping_status').in('room_id', roomIds);
      
      const { data: activeStays } = await supabase
        .from('stays')
        .select('unit_id')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in');

      // 4. UPDATE CACHE
      if (roomsData) cacheRooms(roomsData);
      if (unitsData) cacheUnits(unitsData);
      if (activeStays) cacheStays(activeStays);

      const occupiedUnitIds = activeStays?.map((s:any) => s.unit_id) || [];
      const formattedGrid = (unitsData || []).map((u:any) => {
        const room = roomsData?.find((r:any) => r.id === u.room_id);
        let status = 'free';
        if (occupiedUnitIds.includes(u.id)) status = 'occupied';
        else if (u.housekeeping_status === 'dirty') status = 'dirty';
        return { id: u.id, label: `${room?.label || 'Room'} - ${u.label}`, status };
      });

      setRooms(formattedGrid);
      setActiveGuests(activeStays?.length || 0);

      // Fetch shift cash
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('opening_cash')
        .eq('property_id', memberData.property_id)
        .eq('status', 'open')
        .single();
      setActiveShiftCash(shiftData ? shiftData.opening_cash : null);

      // 5. SYNC OUTBOX
      processOutbox();
      setPendingCount(getPendingCount());

    } catch (error) {
      console.error("Error loading dashboard", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const renderRoomItem = ({ item }: any) => (
    <View style={[
      styles.roomCard, 
      item.status === 'occupied' && styles.roomOccupied,
      item.status === 'dirty' && styles.roomDirty
    ]}>
      <Text style={styles.roomLabel}>{item.label}</Text>
      <Text style={styles.roomStatus}>{item.status.toUpperCase()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoomItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>LogStay</Text>
              <Text style={styles.propertyName}>Property: {propertyName}</Text>
            </View>

            {pendingCount > 0 && (
              <View style={styles.syncBadge}>
                <Text style={styles.syncText}>⚠️ {pendingCount} record(s) pending sync</Text>
              </View>
            )}

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
              <View style={[styles.statCard, { borderLeftColor: "#059669" }]}>
                <Text style={styles.statNumber}>{activeGuests}</Text>
                <Text style={styles.statLabel}>Active Guests</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: "#2563eb" }]}>
                <Text style={styles.statNumber}>{rooms.length}</Text>
                <Text style={styles.statLabel}>Rooms Total</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: "#dc2626" }]}>
                <Text style={styles.statNumber}>₹{activeShiftCash !== null ? activeShiftCash : '0'}</Text>
                <Text style={styles.statLabel}>{activeShiftCash !== null ? 'Shift Open' : 'No Shift'}</Text>
              </View>
            </View>

            {/* Action Grid */}
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/checkin")}>
                <View style={[styles.actionCircle, { backgroundColor: "#059669" }]}>
                  <Text style={styles.actionEmoji}>✅</Text>
                </View>
                <Text style={styles.actionText}>Check-In</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/checkout")}>
                <View style={[styles.actionCircle, { backgroundColor: "#6b7280" }]}>
                  <Text style={styles.actionEmoji}>🚪</Text>
                </View>
                <Text style={styles.actionText}>Check-Out</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/shift")}>
                <View style={[styles.actionCircle, { backgroundColor: "#dc2626" }]}>
                  <Text style={styles.actionEmoji}>💰</Text>
                </View>
                <Text style={styles.actionText}>Shift</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/add-room")}>
                <View style={[styles.actionCircle, { backgroundColor: "#2563eb" }]}>
                  <Text style={styles.actionEmoji}>🛏️</Text>
                </View>
                <Text style={styles.actionText}>Add Room</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/exports")}>
                <View style={[styles.actionCircle, { backgroundColor: "#f59e0b" }]}>
                  <Text style={styles.actionEmoji}>📜</Text>
                </View>
                <Text style={styles.actionText}>Export</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/form-c")}>
                <View style={[styles.actionCircle, { backgroundColor: "#7c3aed" }]}>
                  <Text style={styles.actionEmoji}>📋</Text>
                </View>
                <Text style={styles.actionText}>Form C</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/settings")}>
                <View style={[styles.actionCircle, { backgroundColor: "#374151" }]}>
                  <Text style={styles.actionEmoji}>⚙️</Text>
                </View>
                <Text style={styles.actionText}>Settings</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Room Grid</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No rooms added yet.</Text>}
      />
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  
  // Header
  header: { padding: 20, alignItems: "center", marginTop: 20 },
  title: { fontSize: 32, fontWeight: "bold", color: "#2563eb" },
  propertyName: { fontSize: 16, color: "#6b7280", marginTop: 5 },

  // Sync Badge
  syncBadge: { backgroundColor: "#fef3c7", padding: 10, borderRadius: 8, marginHorizontal: 20, marginBottom: 15, borderWidth: 1, borderColor: "#fde68a" },
  syncText: { color: "#92400e", textAlign: "center", fontWeight: "600" },

  // Stats
  statsContainer: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 25 },
  statCard: { flex: 1, backgroundColor: "white", padding: 15, borderRadius: 12, marginHorizontal: 5, borderLeftWidth: 4, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statNumber: { fontSize: 22, fontWeight: "bold", color: "#1f2937" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },

  // Action Grid
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", paddingHorizontal: 20, marginBottom: 30 },
  actionItem: { width: "33.33%", alignItems: "center", marginBottom: 20 },
  actionCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  actionEmoji: { fontSize: 26 },
  actionText: { fontSize: 12, color: "#374151", marginTop: 8, fontWeight: "600" },

  // Room Grid
  sectionTitle: { fontSize: 20, fontWeight: "bold", color: "#1f2937", marginHorizontal: 20, marginBottom: 15 },
  roomCard: { backgroundColor: "white", padding: 15, borderRadius: 10, marginHorizontal: 20, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  roomOccupied: { backgroundColor: "#fee2e2", borderLeftColor: "#ef4444", borderLeftWidth: 4 },
  roomDirty: { backgroundColor: "#fef3c7", borderLeftColor: "#f59e0b", borderLeftWidth: 4 },
  roomLabel: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
  roomStatus: { fontSize: 12, fontWeight: "bold", color: "#6b7280" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 20, fontSize: 16 },

  // Logout
  logoutButton: { position: "absolute", bottom: 20, right: 20, backgroundColor: "#ef4444", paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  logoutText: { color: "white", fontWeight: "bold", fontSize: 16 }
});