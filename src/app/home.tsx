import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "../lib/supabase";
import { getPendingCount, processOutbox, isOnline, getRoomsCache, getUnitsCache, getStaysCache, cacheRooms, cacheUnits, cacheStays, saveToOutbox, updateLocalUnitStatus, setCachedPropertyId } from "../lib/offline";
import { useStaff } from "../lib/staff-context";

export default function HomeScreen() {
  const { activeStaff, logoutStaff, can } = useStaff();
  // FIX: Added propertyId state here to prevent the crash!
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeGuests, setActiveGuests] = useState(0);
  const [activeShiftCash, setActiveShiftCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (activeStaff?.attendanceId) {
      // Fetch the clock_in time
      supabase
        .from('staff_attendance')
        .select('clock_in')
        .eq('id', activeStaff.attendanceId)
        .single()
        .then(({ data }) => {
          if (isMounted && data?.clock_in) {
            setDutyStartTime(data.clock_in);
          }
        });
    }
    return () => {
      isMounted = false;
      setDutyStartTime(null);
    };
  }, [activeStaff?.attendanceId]);

  const switchStaff = async () => {
    Alert.alert(
      "End Shift & Lock Desk",
      "This will clock you out and lock the screen for the next staff member. Continue?",
      [
        { text: "Cancel" },
        {
          text: "Lock",
          onPress: async () => {
            // Clock out the current staff member via secure RPC
            if (activeStaff?.attendanceId) {
              await supabase.rpc('clock_out_staff', {
                p_attendance_id: activeStaff.attendanceId
              });
            }

            await logoutStaff();
            router.replace('/staff-login');
          }
        }
      ]
    );
  };

  async function loadDashboardFromCache() {
    try {
      const localRooms = getRoomsCache();
      const localUnits = getUnitsCache();
      const localStays = getStaysCache();
      const localOccupiedIds = localStays.map((s:any) => s.unit_id);

      const localGrid = localUnits.map((u:any) => {
        const room = localRooms.find((r:any) => r.id === u.room_id);
        let status = 'free';
        if (localOccupiedIds.includes(u.id)) status = 'occupied';
        else if (u.housekeeping_status === 'dirty') status = 'dirty';
        else if (u.housekeeping_status === 'maintenance') status = 'maintenance';
        return { id: u.id, label: `${room?.label || 'Room'} - ${u.label}`, status };
      });
      setRooms(localGrid);
      setActiveGuests(localStays.length);
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (e) {
      console.error("Error loading cache", e);
    }
  }

  async function loadDashboard() {
    try {
      // 1. CHECK IF ONLINE
      const online = await isOnline();
      if (!online) {
        await loadDashboardFromCache();
        return;
      }

      // 2. FETCH FRESH DATA
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) { router.replace("/setup-property"); return; }
      setPropertyId(memberData.property_id);
      await setCachedPropertyId(memberData.property_id);

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

      // 3. UPDATE CACHE
      if (roomsData) cacheRooms(roomsData);
      if (unitsData) cacheUnits(unitsData);
      if (activeStays) cacheStays(activeStays);

      // Render updated data from local cache
      loadDashboardFromCache();

      // Fetch shift cash
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('opening_cash')
        .eq('property_id', memberData.property_id)
        .eq('status', 'open')
        .single();
      setActiveShiftCash(shiftData ? shiftData.opening_cash : null);

      // 4. SYNC OUTBOX
      await processOutbox();
      const count = await getPendingCount();
      setPendingCount(count);

    } catch (error) {
      console.error("Error loading dashboard", error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      const loadSmart = async () => {
        // 1. ALWAYS load from local SQLite cache first for instant render
        await loadDashboardFromCache();
        const initialCount = await getPendingCount();
        setPendingCount(initialCount);
        const localRooms = getRoomsCache();
        if (localRooms && localRooms.length > 0) {
          setLoading(false);
        }
        
        // 2. Check if we need to fetch from Supabase
        const lastFetch = await AsyncStorage.getItem('home_last_fetch');
        const now = Date.now();
        const isStale = !lastFetch || now - parseInt(lastFetch) > 60000; // 60 seconds

        if ((await isOnline()) && isStale) {
          await loadDashboard(); // This fetches from Supabase and updates cache
          await AsyncStorage.setItem('home_last_fetch', now.toString());
        } else {
          setLoading(false);
        }
      };
      
      loadSmart();
    }, [])
  );

  async function markClean(unitId: string) {
    try {
      if (await isOnline()) {
        const { error } = await supabase.rpc('mark_unit_clean', { 
          p_unit_id: unitId, 
          p_staff_id: activeStaff?.id 
        });
          
        if (error) {
          Alert.alert('Error', 'Could not mark bed clean.');
          return;
        }
      } else {
        // Offline: Queue it (Update payload to include staff_id)
        await saveToOutbox('mark_clean', { 
          unit_id: unitId,
          staff_id: activeStaff?.id 
        });
        // Optimistic UI: Update local cache so bed turns green instantly
        await updateLocalUnitStatus(unitId, 'clean');
      }

      // Refresh the home screen UI to show the green bed
      loadDashboard();
    } catch (e) {
      console.error("Failed to mark clean", e);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const renderRoomItem = ({ item }: any) => {
    const isDirty = item.status === 'dirty';
    const isMaintenance = item.status === 'maintenance';

    return (
      <Pressable 
        key={item.id} 
        style={[
          styles.roomCard, 
          item.status === 'occupied' && styles.roomOccupied,
          isDirty && styles.roomDirty,
          isMaintenance && styles.roomMaintenance
        ]}
        onPress={() => router.push(`/room/${item.id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.roomLabel}>{item.label}</Text>
          <Text style={styles.roomStatus}>{item.status.toUpperCase()}</Text>
        </View>

        {isDirty && (
          <TouchableOpacity 
            style={styles.quickCleanBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              markClean(item.id);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.quickCleanText}>Quick Clean</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.viewRoomArrow}>›</Text>
      </Pressable>
    );
  };

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

            {/* Staff On Duty Header */}
            <View style={styles.staffHeader}>
              <View>
                <Text style={styles.dutyLabel}>ON DUTY</Text>
                <Text style={styles.dutyName}>{activeStaff?.name || 'Unknown'}</Text>
                {dutyStartTime && (
                  <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Since {new Date(dutyStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <Pressable onPress={switchStaff} style={styles.switchBtn}>
                <Text style={styles.switchText}>Switch Staff</Text>
              </Pressable>
            </View>

            {pendingCount > 0 && (
              <Pressable 
                style={[styles.syncBadge, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} 
                onPress={() => router.push('/outbox')}
              >
                <Text style={styles.syncText}>⚠️ {pendingCount} Pending Sync • View Queue ›</Text>
              </Pressable>
            )}

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
              <Pressable 
                style={[styles.statCard, { borderLeftColor: "#059669" }]} 
                onPress={() => router.push('/guests')}
              >
                <Text style={styles.statNumber}>{activeGuests}</Text>
                <Text style={styles.statLabel}>Guests In House</Text>
              </Pressable>
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
              {can('check_in') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/checkin")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#059669" }]}>
                    <Text style={styles.actionEmoji}>✅</Text>
                  </View>
                  <Text style={styles.actionText}>Check-In</Text>
                </TouchableOpacity>
              )}

              {can('check_out') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/checkout")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#6b7280" }]}>
                    <Text style={styles.actionEmoji}>🚪</Text>
                  </View>
                  <Text style={styles.actionText}>Check-Out</Text>
                </TouchableOpacity>
              )}

              {can('guests') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/guests")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#0891b2" }]}>
                    <Text style={styles.actionEmoji}>👥</Text>
                  </View>
                  <Text style={styles.actionText}>Guests</Text>
                </TouchableOpacity>
              )}

              {can('shift') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/shift")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#dc2626" }]}>
                    <Text style={styles.actionEmoji}>💰</Text>
                  </View>
                  <Text style={styles.actionText}>Shift</Text>
                </TouchableOpacity>
              )}

              {can('add_room') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/add-room")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#2563eb" }]}>
                    <Text style={styles.actionEmoji}>🛏️</Text>
                  </View>
                  <Text style={styles.actionText}>Add Room</Text>
                </TouchableOpacity>
              )}

              {can('export') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/exports")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#f59e0b" }]}>
                    <Text style={styles.actionEmoji}>📜</Text>
                  </View>
                  <Text style={styles.actionText}>Export</Text>
                </TouchableOpacity>
              )}

              {can('form_c') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/form-c")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#7c3aed" }]}>
                    <Text style={styles.actionEmoji}>📋</Text>
                  </View>
                  <Text style={styles.actionText}>Form C</Text>
                </TouchableOpacity>
              )}

              {can('settings') && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/settings")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#374151" }]}>
                    <Text style={styles.actionEmoji}>⚙️</Text>
                  </View>
                  <Text style={styles.actionText}>Settings</Text>
                </TouchableOpacity>
              )}

              {activeStaff?.role === 'owner' && (
                <TouchableOpacity style={styles.actionItem} onPress={() => router.push("/digest")}>
                  <View style={[styles.actionCircle, { backgroundColor: "#0f172a" }]}>
                    <Text style={styles.actionEmoji}>📊</Text>
                  </View>
                  <Text style={styles.actionText}>Digest</Text>
                </TouchableOpacity>
              )}
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
  roomMaintenance: { backgroundColor: "#fef2f2", borderLeftColor: "#dc2626", borderLeftWidth: 4 },
  quickCleanBtn: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#fde68a' },
  quickCleanText: { fontSize: 11, color: '#b45309', fontWeight: 'bold' },
  viewRoomArrow: { fontSize: 20, color: '#9ca3af', fontWeight: 'bold' },
  roomLabel: { fontSize: 16, fontWeight: "600", color: "#1f2937" },
  roomStatus: { fontSize: 12, fontWeight: "bold", color: "#6b7280" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 20, fontSize: 16 },

  // Logout
  logoutButton: { position: "absolute", bottom: 20, right: 20, backgroundColor: "#ef4444", paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  logoutText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Staff Header
  staffHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginHorizontal: 20, backgroundColor: '#fff', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  dutyLabel: { fontSize: 11, color: '#64748b', fontWeight: 'bold' },
  dutyName: { fontSize: 18, fontWeight: 'bold' },
  switchBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  switchText: { color: '#2563eb', fontWeight: 'bold' }
});