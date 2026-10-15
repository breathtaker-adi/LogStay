import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  ImageBackground,
  Animated,
  Dimensions,
  Modal,
  BackHandler
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "../lib/supabase";
import {
  getPendingCount,
  processOutbox,
  isOnline,
  getRoomsCache,
  getUnitsCache,
  getStaysCache,
  cacheRooms,
  cacheUnits,
  cacheStays,
  saveToOutbox,
  setCachedPropertyId
} from "../lib/offline";
import { useStaff } from "../lib/staff-context";
import { bedState, BedState } from "../lib/bed-state";
import { floorLabel, resolveFloorNo } from "../lib/floors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);
const BANNER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.42);
const BG_STORAGE_KEY = 'home_banner_uri';
const DEFAULT_BANNER = require('../../assets/images/property-banner.jpg');

type FilterStatus = 'free' | 'occupied' | 'dirty' | 'maintenance' | null;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { activeStaff, logoutStaff, can } = useStaff();

  const [propertyName, setPropertyName] = useState<string>("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeGuests, setActiveGuests] = useState(0);
  const [activeShiftCash, setActiveShiftCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>('');
  const [pendingCount, setPendingCount] = useState(0);
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState({ free: 0, occupied: 0, dirty: 0, maintenance: 0 });
  const [dirtyFloorDetails, setDirtyFloorDetails] = useState<{ title: string; count: number }[]>([]);
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [issueCount, setIssueCount] = useState<number>(0);

  // Drawer Animation State
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(-DRAWER_WIDTH));

  const openDrawer = useCallback(() => {
    setDrawerVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const closeDrawer = useCallback((callback?: () => void) => {
    Animated.timing(slideAnim, {
      toValue: -DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setDrawerVisible(false);
      if (callback) callback();
    });
  }, [slideAnim]);

  const handleNav = (route: string) => {
    closeDrawer(() => {
      router.push(route as any);
    });
  };

  // Ask confirmation before quitting app when user presses back on Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (drawerVisible) {
          closeDrawer();
          return true;
        }
        Alert.alert(
          "Exit LogStay",
          "Are you sure you want to exit the application?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() }
          ]
        );
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [drawerVisible, closeDrawer])
  );

  // Load saved banner on mount
  useEffect(() => {
    AsyncStorage.getItem(BG_STORAGE_KEY).then(uri => {
      if (uri) setBannerUri(uri);
    });
  }, []);

  /** Owner: pick a new banner image from the photo library */
  const handleChangeBanner = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Allow photo library access to change the background.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      await AsyncStorage.setItem(BG_STORAGE_KEY, uri);
      setBannerUri(uri);
    }
  };

  const handleResetBanner = async () => {
    await AsyncStorage.removeItem(BG_STORAGE_KEY);
    setBannerUri(null);
  };

  useEffect(() => {
    let isMounted = true;
    if (activeStaff?.attendanceId) {
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
            try {
              if (activeStaff?.attendanceId) {
                if (await isOnline()) {
                  await supabase.rpc('clock_out_staff', { p_attendance_id: activeStaff.attendanceId });
                } else {
                  await saveToOutbox('clock_out', { attendance_id: activeStaff.attendanceId });
                }
              }
              await logoutStaff();
              router.replace("/staff-login");
            } catch (e) {
              console.error("Lock desk error", e);
              await logoutStaff();
              router.replace("/staff-login");
            }
          }
        }
      ]
    );
  };

  const handleLogoutPress = () => {
    closeDrawer(() => {
      switchStaff();
    });
  };

  async function loadDashboardFromCache() {
    try {
      const localRooms = getRoomsCache() || [];
      const localUnits = getUnitsCache() || [];
      const localStays = getStaysCache() || [];
      const localOccupiedIds = new Set<string>(localStays.map((s: any) => s.unit_id));

      let freeC = 0, occC = 0, dirtyC = 0, maintC = 0;
      const dirtyByFloorMap = new Map<string, number>();

      const localGrid = localUnits.map((u: any) => {
        const room = localRooms.find((r: any) => r.id === u.room_id);
        const state: BedState = bedState(u, localOccupiedIds);

        if (state === 'occupied') occC++;
        else if (state === 'dirty') {
          dirtyC++;
          const fTitle = floorLabel(resolveFloorNo(room));
          dirtyByFloorMap.set(fTitle, (dirtyByFloorMap.get(fTitle) || 0) + 1);
        } else if (state === 'maintenance') maintC++;
        else freeC++;

        return {
          id: u.id,
          label: `${room?.label || 'Room'} - ${u.label}`,
          status: state,
          roomId: room?.id,
          isDorm: room?.kind === 'dorm'
        };
      });

      const floorEntries = [...dirtyByFloorMap.entries()].map(([title, count]) => ({ title, count }));
      setDirtyFloorDetails(floorEntries);

      setStatusCounts({ free: freeC, occupied: occC, dirty: dirtyC, maintenance: maintC });
      setRooms(localGrid);
      setActiveGuests(localStays.length);
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (e) {
      console.error("Error loading cache", e);
    }
  }

  const loadDashboard = useCallback(async () => {
    try {
      const online = await isOnline();
      if (!online) {
        await loadDashboardFromCache();
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user?.id)
        .single();

      if (!memberData) { router.replace("/setup-property"); return; }
      await setCachedPropertyId(memberData.property_id);

      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', memberData.property_id)
        .single();
      setPropertyName(property?.name || "Unknown");

      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, property_id, label, kind, floor, floor_no')
        .eq('property_id', memberData.property_id)
        .is('archived_at', null);

      const roomIds = roomsData?.map((r: any) => r.id) || [];
      let unitsData: any[] = [];
      if (roomIds.length > 0) {
        const { data: uData } = await supabase
          .from('units')
          .select('id, room_id, label, housekeeping_status, gender_rule')
          .in('room_id', roomIds)
          .is('archived_at', null);
        unitsData = uData || [];
      }

      const { data: activeStays } = await supabase
        .from('stays')
        .select('id, property_id, unit_id, status')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in');

      if (roomsData) cacheRooms(roomsData);
      if (unitsData) cacheUnits(unitsData);
      if (activeStays) cacheStays(activeStays);

      await loadDashboardFromCache();

      const { data: shiftData } = await supabase
        .from('shifts')
        .select('opening_cash')
        .eq('property_id', memberData.property_id)
        .eq('status', 'open')
        .maybeSingle();
      setActiveShiftCash(shiftData ? shiftData.opening_cash : null);

      // Fetch open issues count for notification badge
      try {
        const { count: openIssuesCount } = await supabase
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .eq('property_id', memberData.property_id)
          .eq('status', 'open');
        setIssueCount(openIssuesCount || 0);
      } catch {
        // Non-blocking
      }

      await processOutbox();
      const count = await getPendingCount();
      setPendingCount(count);
      setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error("Error loading dashboard", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await processOutbox();
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  useFocusEffect(
    useCallback(() => {
      const loadSmart = async () => {
        await loadDashboardFromCache();
        const initialCount = await getPendingCount();
        setPendingCount(initialCount);
        const localRooms = getRoomsCache();
        
        // If we already have cached rooms, serve instantly with 0 network calls
        if (localRooms && localRooms.length > 0) {
          setLoading(false);
        } else {
          // Cold cache (first launch after setup/login) -> fetch once
          if (await isOnline()) {
            await loadDashboard();
          } else {
            setLoading(false);
          }
        }
      };

      loadSmart();
    }, [loadDashboard])
  );

  /** Navigate to rooms, optionally filtered to a specific status */
  const navigateRooms = (filter?: FilterStatus) => {
    if (filter) {
      router.push({ pathname: '/rooms', params: { filter } } as any);
    } else {
      router.push('/rooms');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const bannerSource = bannerUri ? { uri: bannerUri } : DEFAULT_BANNER;
  const isOwner = activeStaff?.role === 'owner';

  return (
    <View style={styles.container}>
      {/* Top App Bar — floats over the banner */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={openDrawer}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="menu" size={26} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>LogStay</Text>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/notifications')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="notifications-outline" size={24} color="#0f172a" />
          {issueCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{issueCount > 9 ? '9+' : issueCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── HERO BANNER ──────────────────────────────────────────── */}
        <View style={styles.bannerContainer}>
          <ImageBackground
            source={bannerSource}
            style={styles.bannerBackground}
            imageStyle={styles.bannerImage}
          >
            <View style={styles.bannerOverlay}>
              <Text style={styles.bannerPropertyName} numberOfLines={2}>
                {propertyName || 'LogStay'}
              </Text>
              {lastSynced ? (
                <Text style={styles.bannerSyncText}>Last synced {lastSynced}</Text>
              ) : null}

              {/* Owner: change background button */}
              {isOwner && (
                <View style={styles.bannerOwnerRow}>
                  <TouchableOpacity
                    style={styles.bannerChangeBgBtn}
                    onPress={handleChangeBanner}
                  >
                    <Ionicons name="image-outline" size={14} color="#ffffff" />
                    <Text style={styles.bannerChangeBgText}>Change BG</Text>
                  </TouchableOpacity>
                  {bannerUri && (
                    <TouchableOpacity
                      style={[styles.bannerChangeBgBtn, { marginLeft: 8, backgroundColor: 'rgba(220,38,38,0.7)' }]}
                      onPress={handleResetBanner}
                    >
                      <Ionicons name="refresh-outline" size={14} color="#ffffff" />
                      <Text style={styles.bannerChangeBgText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </ImageBackground>
        </View>

        {/* Pending Sync Alert */}
        {pendingCount > 0 && (
          <Pressable
            style={styles.syncBadge}
            onPress={() => router.push('/outbox')}
          >
            <Text style={styles.syncText}>⚠️ {pendingCount} Pending Sync • View Queue ›</Text>
          </Pressable>
        )}

        {/* ── 3 MAIN STAT CARDS (RBAC adapted for Housekeeper) ─────────────── */}
        <View style={styles.statsContainer}>
          <Pressable
            style={styles.statCard}
            onPress={() => {
              if (can('guests')) {
                router.push('/guests');
              } else {
                navigateRooms('occupied');
              }
            }}
          >
            <View style={[styles.statPill, { backgroundColor: '#e0f2fe' }]}>
              <Text style={[styles.statNumber, { color: '#0284c7' }]}>{activeGuests}</Text>
            </View>
            <Text style={styles.statLabel}>Guests in House</Text>
          </Pressable>

          <Pressable
            style={styles.statCard}
            onPress={() => navigateRooms()}
          >
            <View style={[styles.statPill, { backgroundColor: '#ccfbf1' }]}>
              <Text style={[styles.statNumber, { color: '#0f766e' }]}>{rooms.length}</Text>
            </View>
            <Text style={styles.statLabel}>Rooms Total</Text>
          </Pressable>

          {can('shift') ? (
            <Pressable
              style={styles.statCard}
              onPress={() => router.push('/shift')}
            >
              <View style={[styles.statPill, { backgroundColor: '#ffedd5' }]}>
                <Text style={[styles.statNumber, { color: '#ea580c' }]}>
                  {activeShiftCash !== null ? `₹${activeShiftCash}` : '₹0'}
                </Text>
              </View>
              <Text style={styles.statLabel}>
                {activeShiftCash !== null ? 'Shift Open' : 'No Shift'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.statCard}
              onPress={() => navigateRooms('dirty')}
            >
              <View style={[styles.statPill, { backgroundColor: '#fef9c3' }]}>
                <Text style={[styles.statNumber, { color: '#ca8a04' }]}>
                  {statusCounts.dirty}
                </Text>
              </View>
              <Text style={styles.statLabel}>
                {dirtyFloorDetails.length > 0 ? `Dirty (${dirtyFloorDetails.length} Flr${dirtyFloorDetails.length > 1 ? 's' : ''})` : 'Dirty Units'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── HOUSEKEEPING FLOOR CLEANING BREAKDOWN BANNER ───────────── */}
        {dirtyFloorDetails.length > 0 && (
          <Pressable
            style={styles.housekeepingCleanBanner}
            onPress={() => navigateRooms('dirty')}
          >
            <View style={styles.housekeepingCleanBadge}>
              <Ionicons name="sparkles" size={13} color="#ca8a04" />
              <Text style={styles.housekeepingCleanTitle}>NEEDS CLEANING</Text>
            </View>
            <Text style={styles.housekeepingCleanText} numberOfLines={2}>
              {dirtyFloorDetails.map(d => `${d.title} (${d.count})`).join(', ')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#ca8a04" />
          </Pressable>
        )}

        {/* ── STATUS FILTER PILLS ──────────────────────────────────── */}
        <View style={styles.legendContainer}>
          <Pressable
            style={[styles.legendPill, { backgroundColor: '#dcfce7' }]}
            onPress={() => navigateRooms('free')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
            <Text style={[styles.legendPillText, { color: '#166534' }]}>Free: {statusCounts.free}</Text>
          </Pressable>

          <Pressable
            style={[styles.legendPill, { backgroundColor: '#fee2e2' }]}
            onPress={() => navigateRooms('occupied')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
            <Text style={[styles.legendPillText, { color: '#991b1b' }]}>Occupied: {statusCounts.occupied}</Text>
          </Pressable>

          <Pressable
            style={[styles.legendPill, { backgroundColor: '#fef9c3' }]}
            onPress={() => navigateRooms('dirty')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#ca8a04' }]} />
            <Text style={[styles.legendPillText, { color: '#854d0e' }]}>Dirty: {statusCounts.dirty}</Text>
          </Pressable>

          <Pressable
            style={[styles.legendPill, { backgroundColor: '#f1f5f9' }]}
            onPress={() => navigateRooms('maintenance')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#64748b' }]} />
            <Text style={[styles.legendPillText, { color: '#334155' }]}>Maint: {statusCounts.maintenance}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── FREE ROOMS AVAILABLE — pinned bottom bar ───────────────── */}
      <Pressable
        style={[styles.freeRoomsBar, { paddingBottom: insets.bottom + 10 }]}
        onPress={() => navigateRooms('free')}
      >
        <Text style={styles.freeRoomsTitle}>Free Rooms Available</Text>
        <Ionicons name="chevron-up" size={18} color="#1e293b" />
      </Pressable>

      {/* ── NAVIGATION DRAWER ─────────────────────────────────────── */}
      <Modal
        visible={drawerVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => closeDrawer()}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => closeDrawer()} />

          <Animated.View
            style={[
              styles.drawerContainer,
              {
                width: DRAWER_WIDTH,
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 16,
                transform: [{ translateX: slideAnim }]
              }
            ]}
          >
            {/* Drawer Staff Profile Header */}
            <View style={styles.drawerProfileHeader}>
              <View style={styles.drawerProfileRow}>
                <View style={styles.drawerAvatar}>
                  <Text style={styles.drawerAvatarInitial}>
                    {activeStaff?.name ? activeStaff.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={styles.drawerProfileInfo}>
                  <Text style={styles.drawerProfileName} numberOfLines={1}>
                    {activeStaff?.name || 'Staff'}
                  </Text>
                  <Text style={styles.drawerProfileRole}>
                    {activeStaff?.role ? activeStaff.role.charAt(0).toUpperCase() + activeStaff.role.slice(1) : 'Staff'}
                  </Text>
                  {dutyStartTime ? (
                    <Text style={styles.drawerProfileSince}>
                      Since {new Date(dutyStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : (
                    <Text style={styles.drawerProfileSince}>Active</Text>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={styles.switchIdBtn}
                onPress={() => closeDrawer(() => switchStaff())}
              >
                <Text style={styles.switchIdText}>Switch ID  ▾</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerDivider} />

            {/* Drawer Menu Items */}
            <ScrollView style={styles.drawerMenuList} showsVerticalScrollIndicator={false}>
              {can('check_in') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/checkin')}
                >
                  <View style={styles.drawerIconBox}>
                    <MaterialCommunityIcons name="account-arrow-right" size={24} color="#16a34a" />
                  </View>
                  <Text style={styles.drawerItemText}>Check-In</Text>
                </TouchableOpacity>
              )}

              {can('check_out') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/checkout')}
                >
                  <View style={styles.drawerIconBox}>
                    <MaterialCommunityIcons name="door-open" size={24} color="#d97706" />
                  </View>
                  <Text style={styles.drawerItemText}>Check-Out</Text>
                </TouchableOpacity>
              )}

              {can('guests') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/guests')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="people" size={24} color="#2563eb" />
                  </View>
                  <Text style={styles.drawerItemText}>Guests</Text>
                </TouchableOpacity>
              )}

              {can('shift') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/shift')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="time-outline" size={24} color="#dc2626" />
                  </View>
                  <Text style={styles.drawerItemText}>Shift</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => handleNav('/notifications')}
              >
                <View style={styles.drawerIconBox}>
                  <Ionicons name="notifications-outline" size={24} color="#8b5cf6" />
                </View>
                <Text style={styles.drawerItemText}>Notifications</Text>
                {issueCount > 0 && (
                  <View style={styles.drawerBadge}>
                    <Text style={styles.drawerBadgeText}>{issueCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {can('export') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/exports')}
                >
                  <View style={styles.drawerIconBox}>
                    <MaterialCommunityIcons name="file-download-outline" size={24} color="#ea580c" />
                  </View>
                  <Text style={styles.drawerItemText}>Export Reports</Text>
                </TouchableOpacity>
              )}

              {can('form_c') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/form-c')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="document-text" size={24} color="#7c3aed" />
                  </View>
                  <Text style={styles.drawerItemText}>Form C</Text>
                </TouchableOpacity>
              )}

              {activeStaff?.role === 'owner' && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/digest')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="bar-chart" size={24} color="#ca8a04" />
                  </View>
                  <Text style={styles.drawerItemText}>Digest</Text>
                </TouchableOpacity>
              )}

              {can('settings') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/settings')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="settings-sharp" size={24} color="#4b5563" />
                  </View>
                  <Text style={styles.drawerItemText}>Settings</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Bottom Logout Button */}
            <View style={styles.drawerBottomWrapper}>
              <TouchableOpacity
                style={styles.drawerLogoutBtn}
                onPress={handleLogoutPress}
              >
                <MaterialCommunityIcons name="power" size={20} color="#dc2626" />
                <Text style={styles.drawerLogoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: '#ffffff'
  },
  scrollContent: {
    paddingBottom: 80  // room for pinned bottom bar
  },

  // Top App Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    zIndex: 10
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.3
  },
  iconBtn: {
    padding: 4
  },

  // ── Hero Property Banner ──────────────────────────────────────────
  bannerContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
    height: BANNER_HEIGHT,
    backgroundColor: '#e7e5e4',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  bannerBackground: {
    width: '100%',
    height: '100%',
  },
  bannerImage: {
    borderRadius: 24,
    resizeMode: 'cover'
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24
  },
  bannerPropertyName: {
    fontSize: 46,
    fontWeight: '700',
    color: '#18181b',
    fontFamily: 'serif',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6
  },
  bannerSyncText: {
    fontSize: 11,
    color: '#52525b',
    marginTop: 8,
    fontWeight: '500'
  },
  bannerOwnerRow: {
    flexDirection: 'row',
    marginTop: 14,
    alignItems: 'center'
  },
  bannerChangeBgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  bannerChangeBgText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff'
  },

  // Sync Badge
  syncBadge: {
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#fde68a"
  },
  syncText: {
    color: "#92400e",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 12
  },

  // ── 3 Main Stat Cards ─────────────────────────────────────────────
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  statPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 8,
    minWidth: 42,
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700'
  },
  statLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center'
  },

  // ── Housekeeping Clean Banner ──────────────────────────────────────
  housekeepingCleanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fef08a',
    gap: 8
  },
  housekeepingCleanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef9c3',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  housekeepingCleanTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#854d0e',
    letterSpacing: 0.5
  },
  housekeepingCleanText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#713f12'
  },

  // ── Status Filter Pills ───────────────────────────────────────────
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 20
  },
  legendPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  legendPillText: {
    fontSize: 11,
    fontWeight: '700'
  },

  // ── Free Rooms Bar — pinned to the very bottom ────────────────────
  freeRoomsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8
  },
  freeRoomsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },

  // ── Modal & Drawer ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    flexDirection: 'row'
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)'
  },
  drawerContainer: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16
  },

  // Profile Header in Drawer
  drawerProfileHeader: {
    marginBottom: 12
  },
  drawerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  drawerAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0'
  },
  drawerAvatarInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  drawerProfileInfo: {
    marginLeft: 14,
    flex: 1
  },
  drawerProfileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  drawerProfileRole: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2
  },
  drawerProfileSince: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  switchIdBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff'
  },
  switchIdText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10
  },

  // Drawer Menu Items
  drawerMenuList: {
    flex: 1
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4
  },
  drawerIconBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  drawerItemText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 14
  },

  // Drawer Bottom Logout
  drawerBottomWrapper: {
    marginTop: 10
  },
  drawerLogoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  drawerLogoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626'
  },
  notifBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#dc2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  notifBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  drawerBadge: {
    marginLeft: 'auto',
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  drawerBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});