import { useState, useEffect, useCallback, useMemo } from "react";
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
  Image,
  Animated,
  Dimensions,
  Modal,
  BackHandler,
  Platform,
  PanResponder,
  AccessibilityInfo
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { AppleExitModal } from "@/components/apple-exit-modal";
import {
  GridRoomRecord,
  GridUnitRecord,
  RoomGridMap,
  RoomGridTile,
} from "@/components/room-grid-map";
import { computeAvailabilitySummary, formatAvailabilityLabel } from "../lib/room-grid";
import { hapticSelection } from "@/lib/haptics";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);
const BANNER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.42);
const BG_STORAGE_KEY = 'home_banner_uri';
const DEFAULT_BANNER = require('../../assets/images/property-banner.jpg');

type FilterStatus = 'free' | 'occupied' | 'dirty' | 'maintenance' | null;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { activeStaff, logoutStaff, can } = useStaff();
  const theme = useTheme();

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
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [todayActivities, setTodayActivities] = useState({
    checkIns: 0,
    checkOuts: 0,
    paymentsTotal: 0,
    paymentsCount: 0,
    shiftStatus: 'No Shift' as 'Open' | 'Closed' | 'Pending Handover' | 'No Shift',
    shiftCash: 0,
    paymentDueCount: 0,
    paymentDueTotal: 0,
    dueOutCount: 0,
    overdueCount: 0,
    pendingApprovals: 0,
    handoverPending: false,
    unverifiedUpiCount: 0,
  });

  // Drawer Animation State
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(-DRAWER_WIDTH));

  // Free Rooms Bottom Sheet Animation State
  const [freeRoomsSheetVisible, setFreeRoomsSheetVisible] = useState(false);
  const [freeRoomsAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  // Floor Grid Map Data + Segmented View Toggle State
  const [gridRooms, setGridRooms] = useState<GridRoomRecord[]>([]);
  const [gridUnits, setGridUnits] = useState<GridUnitRecord[]>([]);
  const [activeUnitIds, setActiveUnitIds] = useState<Set<string>>(new Set());
  const availabilitySummary = useMemo(
    () => computeAvailabilitySummary(gridRooms, gridUnits, activeUnitIds),
    [gridRooms, gridUnits, activeUnitIds]
  );
  const freeSummaryText = useMemo(
    () => formatAvailabilityLabel(availabilitySummary),
    [availabilitySummary]
  );
  const [dashboardView, setDashboardView] = useState<'activities' | 'grid'>('activities');
  const [segmentWidth, setSegmentWidth] = useState(0);
  const [segmentAnim] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
      setReduceMotion(Boolean(enabled));
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  const switchDashboardView = useCallback(
    (next: 'activities' | 'grid') => {
      if (next === dashboardView) return;
      void hapticSelection();
      setDashboardView(next);
      const target = next === 'grid' ? 1 : 0;
      if (reduceMotion) {
        segmentAnim.setValue(target);
      } else {
        Animated.spring(segmentAnim, {
          toValue: target,
          damping: 22,
          stiffness: 260,
          mass: 0.75,
          useNativeDriver: true,
        }).start();
      }
    },
    [dashboardView, reduceMotion, segmentAnim]
  );

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

  const openFreeRoomsSheet = useCallback(() => {
    setFreeRoomsSheetVisible(true);
    Animated.spring(freeRoomsAnim, {
      toValue: 0,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [freeRoomsAnim]);

  const closeFreeRoomsSheet = useCallback((callback?: () => void) => {
    Animated.timing(freeRoomsAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setFreeRoomsSheetVisible(false);
      if (callback) callback();
    });
  }, [freeRoomsAnim]);

  // ── Apple HIG Gestures on Home Screen ──────────────────────────────
  // 1. Swipe Right anywhere -> Open Side Menu (Drawer) with smooth slide
  // 2. Swipe Left anywhere -> Open Notifications Screen with smooth transition
  // 3. Swipe Up anywhere -> Open Bottom Free Rooms Available Sheet with smooth spring
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          // Horizontal intent: Swipe Right (Drawer) or Swipe Left (Notifications)
          const isHorizontal =
            Math.abs(gestureState.dx) > 30 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4;

          // Vertical intent: Swipe Up (Open Free Rooms Sheet)
          const isSwipeUp =
            gestureState.dy < -35 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.4 &&
            (gestureState.vy < -0.2 || gestureState.dy < -60);

          return isHorizontal || isSwipeUp;
        },
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
          const isStrongHorizontal =
            Math.abs(gestureState.dx) > 40 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.8;

          const isFastSwipeUp =
            gestureState.dy < -45 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.8 &&
            gestureState.vy < -0.3;

          return isStrongHorizontal || isFastSwipeUp;
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const { dx, dy, vx, vy } = gestureState;

          // 1. Swipe Right anywhere -> Open Side Menu (Drawer)
          if (dx > 40 && Math.abs(dx) > Math.abs(dy) * 1.2 && (vx > 0.15 || dx > 60)) {
            openDrawer();
            return;
          }

          // 2. Swipe Left anywhere -> Open Notifications
          if (dx < -40 && Math.abs(dx) > Math.abs(dy) * 1.2 && (vx < -0.15 || dx < -60)) {
            router.push('/notifications');
            return;
          }

          // 3. Swipe Up anywhere -> Open Bottom Free Rooms Available
          if (dy < -35 && Math.abs(dy) > Math.abs(dx) * 1.2 && (vy < -0.18 || dy < -55)) {
            openFreeRoomsSheet();
            return;
          }
        },
      }),
    [openDrawer, openFreeRoomsSheet]
  );

  // Gesture on Drawer to close on swipe left
  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return gestureState.dx < -15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx < -30 || gestureState.vx < -0.2) {
            closeDrawer();
          }
        },
      }),
    [closeDrawer]
  );

  // Gesture on Free Rooms Sheet to dismiss on swipe down
  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return gestureState.dy > 15 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy > 30 || gestureState.vy > 0.2) {
            closeFreeRoomsSheet();
          }
        },
      }),
    [closeFreeRoomsSheet]
  );

  const handleNav = (route: string) => {
    closeDrawer(() => {
      router.push(route as any);
    });
  };

  // Ask confirmation before quitting app when user presses back on Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (freeRoomsSheetVisible) {
          closeFreeRoomsSheet();
          return true;
        }
        if (drawerVisible) {
          closeDrawer();
          return true;
        }
        setExitModalVisible(true);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [drawerVisible, closeDrawer, freeRoomsSheetVisible, closeFreeRoomsSheet])
  );

  // Load saved banner on mount
  useEffect(() => {
    AsyncStorage.getItem(BG_STORAGE_KEY).then(uri => {
      if (uri) setBannerUri(uri);
    });
  }, []);

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

  const confirmDeviceSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of this device?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
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
              await supabase.auth.signOut();
              router.replace("/login");
            } catch (e) {
              console.error("Sign out error", e);
              await logoutStaff();
              await supabase.auth.signOut();
              router.replace("/login");
            }
          }
        }
      ]
    );
  };

  const handleLogoutPress = () => {
    closeDrawer(() => {
      confirmDeviceSignOut();
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

        const isDorm = room?.kind === 'dorm';
        const displayLabel = !isDorm || u.label === room?.label
          ? (room?.label ? `Room ${room.label}` : u.label)
          : `${room?.label || 'Dorm'} • Bed ${u.label}`;

        return {
          id: u.id,
          label: displayLabel,
          status: state,
          roomId: room?.id,
          isDorm
        };
      });

      const floorEntries = [...dirtyByFloorMap.entries()].map(([title, count]) => ({ title, count }));
      setDirtyFloorDetails(floorEntries);

      setStatusCounts({ free: freeC, occupied: occC, dirty: dirtyC, maintenance: maintC });
      setRooms(localGrid);
      setGridRooms(localRooms);
      setGridUnits(localUnits);
      setActiveUnitIds(localOccupiedIds);
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
        .select('name, photo_url')
        .eq('id', memberData.property_id)
        .single();
      setPropertyName(property?.name || "Unknown");
      if (property?.photo_url) {
        setBannerUri(property.photo_url);
        await AsyncStorage.setItem(BG_STORAGE_KEY, property.photo_url);
      }

      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, property_id, label, kind, floor, floor_no, description')
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
        .select('id, property_id, unit_id, status, check_in, check_out, amount, paid_amount')
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

      // Fetch Today's Operations metrics
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        // 1. Check-ins today
        const { count: checkInsCount } = await supabase
          .from('stays')
          .select('id', { count: 'exact', head: true })
          .eq('property_id', memberData.property_id)
          .gte('check_in', todayIso);

        // 2. Check-outs today
        const { count: checkOutsCount } = await supabase
          .from('stays')
          .select('id', { count: 'exact', head: true })
          .eq('property_id', memberData.property_id)
          .eq('status', 'checked_out')
          .gte('check_out', todayIso);

        // 3. Payments collected today
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('amount')
          .eq('property_id', memberData.property_id)
          .gte('created_at', todayIso)
          .eq('refunded', false);

        const paymentsTotal = (paymentsData || []).reduce((acc: number, p: any) => acc + (parseFloat(p.amount) || 0), 0);
        const paymentsCount = paymentsData?.length || 0;

        // 4. Payment Due on Active Stays + Due Out / Overdue + UPI verification
        let dueCount = 0;
        let dueTotal = 0;
        let dueOutCount = 0;
        let overdueCount = 0;
        let unverifiedUpiCount = 0;

        const now = new Date();
        const nowIso = now.toISOString();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

        (activeStays || []).forEach((s: any) => {
          const tot = parseFloat(s.amount) || 0;
          const paid = parseFloat(s.paid_amount) || 0;
          if (tot > paid) {
            dueCount++;
            dueTotal += (tot - paid);
          }
          if (s.pay_mode === 'upi' && !s.upi_verified) {
            unverifiedUpiCount++;
          }
          if (s.expected_checkout) {
            if (s.expected_checkout < nowIso) {
              overdueCount++;
            } else if (s.expected_checkout >= startOfDay && s.expected_checkout <= endOfDay) {
              dueOutCount++;
            }
          }
        });

        // 5. Shift Handover status
        const { data: handoverShift } = await supabase
          .from('shifts')
          .select('id, closing_cash, counted_cash, status')
          .eq('property_id', memberData.property_id)
          .eq('status', 'pending_handover')
          .limit(1)
          .maybeSingle();

        // 6. Pending Managerial Approvals
        let pendingApprovalsCount = 0;
        try {
          const { count: appCount } = await supabase
            .from('approval_requests')
            .select('id', { count: 'exact', head: true })
            .eq('property_id', memberData.property_id)
            .eq('status', 'pending');
          pendingApprovalsCount = appCount || 0;
        } catch {
          // Non-blocking
        }

        setTodayActivities({
          checkIns: checkInsCount || (activeStays?.length || 0),
          checkOuts: checkOutsCount || 0,
          paymentsTotal,
          paymentsCount,
          shiftStatus: handoverShift ? 'Pending Handover' : (shiftData ? 'Open' : 'Closed'),
          shiftCash: shiftData ? (shiftData.opening_cash || 0) : (handoverShift ? (handoverShift.closing_cash ?? handoverShift.counted_cash ?? 0) : 0),
          paymentDueCount: dueCount,
          paymentDueTotal: dueTotal,
          dueOutCount,
          overdueCount,
          pendingApprovals: pendingApprovalsCount,
          handoverPending: Boolean(handoverShift),
          unverifiedUpiCount,
        });
      } catch (opErr) {
        console.error('Error fetching today operations:', opErr);
      }

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
      AsyncStorage.getItem(BG_STORAGE_KEY).then(uri => {
        if (uri) setBannerUri(uri);
      });
      const loadSmart = async () => {
        await loadDashboardFromCache();
        const initialCount = await getPendingCount();
        setPendingCount(initialCount);
        if (await isOnline()) {
          await loadDashboard();
        } else {
          setLoading(false);
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
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const bannerSource = bannerUri ? { uri: bannerUri } : DEFAULT_BANNER;

  // Banner title always displays Property Name as required
  const propertyTitle =
    propertyName && propertyName !== 'Unknown'
      ? propertyName
      : 'LogStay';

  // Formatted User Name & Position for pill / profile
  const staffDisplayName = activeStaff?.name || 'Staff';

  const displayRole =
    activeStaff?.role === 'owner'
      ? 'Owner'
      : activeStaff?.role === 'desk'
      ? 'Front Desk'
      : activeStaff?.role === 'housekeeping'
      ? 'Housekeeping'
      : 'Front Desk';

  const freeUnits = rooms.filter(r => r.status === 'clean' || (r.status as string) === 'free');

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background }]}
      {...panResponder.panHandlers}
    >
      {/* Top App Bar — Clean Apple HIG controls */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Platform.OS === 'android' ? Math.max(insets.top, 28) + 8 : insets.top + 8,
          }
        ]}
      >
        <TouchableOpacity
          style={styles.topBarIconBtn}
          onPress={openDrawer}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={26} color="#ffffff" style={styles.topBarIconShadow} />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>LogStay</Text>

        <TouchableOpacity
          style={styles.topBarIconBtn}
          onPress={() => router.push('/notifications')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={issueCount > 0 ? `Notifications, ${issueCount} open issues` : 'Notifications'}
        >
          <Ionicons name="notifications-outline" size={24} color="#ffffff" style={styles.topBarIconShadow} />
          {issueCount > 0 && (
            <View style={[styles.notifBadge, { backgroundColor: theme.destructive }]}>
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
        {/* ── HERO BANNER ────────────────────────────────────────── */}
        <View style={styles.bannerContainer}>
          <View style={styles.bannerBackground}>
            <Image
              source={bannerSource}
              style={[StyleSheet.absoluteFill, styles.bannerImage]}
              resizeMode="cover"
            />
            <View style={styles.bannerOverlay}>
              {/* Center Identity Section — Prominently shows Property Name */}
              <View style={styles.bannerIdentityContainer}>
                <Text style={styles.bannerUserName} numberOfLines={1}>
                  {propertyTitle}
                </Text>

                <View style={styles.bannerPositionPill}>
                  <Text style={styles.bannerPositionText}>
                    {activeStaff?.name ? `${activeStaff.name} • ${displayRole}` : displayRole}
                  </Text>
                </View>
              </View>

              {/* Bottom Corners Row: Sync Status in left corner */}
              <View style={styles.bannerBottomRow}>
                {lastSynced ? (
                  <View style={styles.bannerSyncCorner}>
                    <View style={styles.syncLiveDot} />
                    <Text style={styles.bannerSyncCornerText}>Synced {lastSynced}</Text>
                  </View>
                ) : (
                  <View />
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Pending Sync Alert — icon instead of emoji */}
        {pendingCount > 0 && (
          <Pressable
            style={[styles.syncBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
            onPress={() => router.push('/outbox')}
            accessibilityRole="button"
            accessibilityLabel={`${pendingCount} pending sync items. Tap to view queue.`}
          >
            <Ionicons name="cloud-upload-outline" size={15} color="#92400e" style={{ marginRight: 6 }} />
            <Text style={[styles.syncText, { color: '#92400e' }]}>{pendingCount} Pending Sync</Text>
            <Text style={[styles.syncText, { color: '#92400e', marginLeft: 'auto', opacity: 0.75 }]}>View Queue →</Text>
          </Pressable>
        )}

        {/* ── 3 MAIN STAT CARDS (RBAC adapted for Housekeeper) ─────────────── */}
        <View style={styles.statsContainer}>
          <Pressable
            style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
            onPress={() => {
              if (can('guests')) {
                router.push('/guests');
              } else {
                navigateRooms('occupied');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${activeGuests} guests in house`}
          >
            <View style={[styles.statAccentBar, { backgroundColor: theme.accent }]} />
            <Text style={[styles.statNumber, { color: theme.accent }]}>{activeGuests}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Guests in House</Text>
          </Pressable>

          <Pressable
            style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
            onPress={() => navigateRooms()}
            accessibilityRole="button"
            accessibilityLabel={`${availabilitySummary.totalRooms} rooms, ${availabilitySummary.totalBeds} total beds`}
          >
            <View style={[styles.statAccentBar, { backgroundColor: '#16a34a' }]} />
            <Text style={[styles.statNumber, { color: '#16a34a' }]}>
              {gridRooms.length > 0 ? availabilitySummary.totalRooms : rooms.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {availabilitySummary.totalBeds > availabilitySummary.totalRooms
                ? `Rooms (${availabilitySummary.totalBeds} Beds)`
                : 'Rooms Total'}
            </Text>
          </Pressable>

          {can('shift') ? (
            <Pressable
              style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
              onPress={() => router.push('/shift')}
              accessibilityRole="button"
              accessibilityLabel={activeShiftCash !== null ? `Shift open, opening cash ₹${activeShiftCash}` : 'No shift open'}
            >
              <View style={[styles.statAccentBar, { backgroundColor: '#EA580C' }]} />
              <Text style={[styles.statNumber, { color: '#EA580C' }]}>
                {activeShiftCash !== null ? `₹${activeShiftCash}` : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                {activeShiftCash !== null ? 'Shift Open' : 'No Shift'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}
              onPress={() => navigateRooms('dirty')}
              accessibilityRole="button"
              accessibilityLabel={`${statusCounts.dirty} dirty units`}
            >
              <View style={[styles.statAccentBar, { backgroundColor: theme.dirty }]} />
              <Text style={[styles.statNumber, { color: theme.dirty }]}>
                {statusCounts.dirty}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                {dirtyFloorDetails.length > 0 ? `Dirty (${dirtyFloorDetails.length} flr)` : 'Dirty Units'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── HOUSEKEEPING FLOOR CLEANING BREAKDOWN BANNER ───────────── */}
        {dirtyFloorDetails.length > 0 && (
          <Pressable
            style={[styles.housekeepingCleanBanner, { backgroundColor: theme.dirtySubtle, borderColor: theme.dirty }]}
            onPress={() => navigateRooms('dirty')}
            accessibilityRole="button"
            accessibilityLabel={`Needs cleaning: ${dirtyFloorDetails.map(d => `${d.title} (${d.count})`).join(', ')}`}
          >
            <View style={[styles.housekeepingCleanBadge, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="sparkles" size={13} color={theme.dirty} />
              <Text style={[styles.housekeepingCleanTitle, { color: theme.dirty }]}>NEEDS CLEANING</Text>
            </View>
            <Text style={[styles.housekeepingCleanText, { color: theme.text }]} numberOfLines={2}>
              {dirtyFloorDetails.map(d => `${d.title} (${d.count})`).join(', ')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.dirty} />
          </Pressable>
        )}

        {/* ── STATUS FILTER PILLS — 2×2 grid for comfortable tap targets ── */}
        <View style={styles.legendGrid}>
          <View style={styles.legendRow}>
            <Pressable
              style={[styles.legendPill, { backgroundColor: theme.freeSubtle }]}
              onPress={() => navigateRooms('free')}
              accessibilityRole="button"
              accessibilityLabel={`Free rooms: ${statusCounts.free}`}
            >
              <View style={[styles.legendDot, { backgroundColor: theme.free }]} />
              <Text style={[styles.legendPillText, { color: theme.free }]}>Free: {statusCounts.free}</Text>
            </Pressable>

            <Pressable
              style={[styles.legendPill, { backgroundColor: theme.occupiedSubtle }]}
              onPress={() => navigateRooms('occupied')}
              accessibilityRole="button"
              accessibilityLabel={`Occupied rooms: ${statusCounts.occupied}`}
            >
              <View style={[styles.legendDot, { backgroundColor: theme.occupied }]} />
              <Text style={[styles.legendPillText, { color: theme.occupied }]}>Occupied: {statusCounts.occupied}</Text>
            </Pressable>
          </View>

          <View style={styles.legendRow}>
            <Pressable
              style={[styles.legendPill, { backgroundColor: theme.dirtySubtle }]}
              onPress={() => navigateRooms('dirty')}
              accessibilityRole="button"
              accessibilityLabel={`Dirty units: ${statusCounts.dirty}`}
            >
              <View style={[styles.legendDot, { backgroundColor: theme.dirty }]} />
              <Text style={[styles.legendPillText, { color: theme.dirty }]}>Dirty: {statusCounts.dirty}</Text>
            </Pressable>

            <Pressable
              style={[styles.legendPill, { backgroundColor: theme.maintenanceSubtle }]}
              onPress={() => navigateRooms('maintenance')}
              accessibilityRole="button"
              accessibilityLabel={`Maintenance units: ${statusCounts.maintenance}`}
            >
              <View style={[styles.legendDot, { backgroundColor: theme.maintenance }]} />
              <Text style={[styles.legendPillText, { color: theme.maintenance }]}>Maintenance: {statusCounts.maintenance}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── APPLE HIG SEGMENTED CONTROL: TODAY'S ACTIVITIES vs GRID OF ROOMS ── */}
        <View style={styles.viewToggleWrap}>
          <View
            style={[
              styles.viewToggleTrack,
              {
                backgroundColor: theme.backgroundSelected,
                borderColor: theme.separator,
              },
            ]}
            accessibilityRole="tablist"
            onLayout={(e) => {
              const nextW = (e.nativeEvent.layout.width - 6) / 2;
              if (nextW > 0 && Math.abs(nextW - segmentWidth) > 0.5) {
                setSegmentWidth(nextW);
              }
            }}
          >
            {segmentWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.viewToggleIndicator,
                  {
                    width: segmentWidth,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.separator,
                    transform: [
                      {
                        translateX: segmentAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, segmentWidth],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            <Pressable
              style={styles.viewToggleSegment}
              onPress={() => switchDashboardView('activities')}
              accessibilityRole="tab"
              accessibilityState={{ selected: dashboardView === 'activities' }}
              accessibilityLabel="Today's Activities"
            >
              <Text
                style={[
                  styles.viewToggleText,
                  {
                    color: dashboardView === 'activities' ? theme.text : theme.textSecondary,
                    fontWeight: dashboardView === 'activities' ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Today&apos;s Activities
              </Text>
            </Pressable>

            <Pressable
              style={styles.viewToggleSegment}
              onPress={() => switchDashboardView('grid')}
              accessibilityRole="tab"
              accessibilityState={{ selected: dashboardView === 'grid' }}
              accessibilityLabel="Grid of Rooms"
            >
              <Text
                style={[
                  styles.viewToggleText,
                  {
                    color: dashboardView === 'grid' ? theme.text : theme.textSecondary,
                    fontWeight: dashboardView === 'grid' ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Grid of Rooms
              </Text>
            </Pressable>
          </View>
        </View>

        {dashboardView === 'grid' ? (
          <RoomGridMap
            rooms={gridRooms}
            units={gridUnits}
            activeUnitIds={activeUnitIds}
            onOpenFullMatrix={() => router.push('/room-matrix' as any)}
            onSelectTile={(tile: RoomGridTile) => {
              if (tile.isDorm) {
                router.push({ pathname: '/dorm/[roomId]', params: { roomId: tile.roomId } });
              } else if (tile.primaryUnitId) {
                router.push(`/room/${tile.primaryUnitId}`);
              } else {
                Alert.alert('Notice', 'No unit found for this room.');
              }
            }}
          />
        ) : (
        /* ── TODAY'S OPERATIONS (Editorial Inset Grouped Section) ─── */
        <View style={styles.operationsSection}>
          <View style={styles.operationsHeader}>
            <Text style={[styles.operationsSectionTitle, { color: theme.roomEyebrow }]}>
              TODAY&apos;S OPERATIONS
            </Text>
            <Text style={[styles.operationsSectionSub, { color: theme.textSecondary }]}>
              Live arrivals, departures, broadcasts, payments &amp; shift controls
            </Text>
          </View>

          <View style={[styles.operationsCard, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
            {/* 1. Check-In Row */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push(can('check_in') ? '/checkin' : '/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Check-Ins today: ${todayActivities.checkIns}`}
            >
              <View style={[styles.operationIconBox, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="log-in-outline" size={20} color="#2563eb" />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Check-Ins</Text>
                <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                  {todayActivities.checkIns} registered arrivals today
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View style={[styles.operationBadge, { backgroundColor: '#eff6ff' }]}>
                  <Text style={[styles.operationBadgeText, { color: '#2563eb' }]}>
                    {todayActivities.checkIns}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 2. Check-Out Row */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push('/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Check-Outs today: ${todayActivities.checkOuts}`}
            >
              <View style={[styles.operationIconBox, { backgroundColor: '#faf5ff' }]}>
                <Ionicons name="log-out-outline" size={20} color="#9333ea" />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Check-Outs</Text>
                <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                  {todayActivities.checkOuts} departures processed
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View style={[styles.operationBadge, { backgroundColor: '#faf5ff' }]}>
                  <Text style={[styles.operationBadgeText, { color: '#9333ea' }]}>
                    {todayActivities.checkOuts}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 2.5. Due Out & Overdue Stays Row */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push('/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <View style={[styles.operationIconBox, { backgroundColor: todayActivities.overdueCount > 0 ? '#fee2e2' : '#dcfce7' }]}>
                <Ionicons
                  name={todayActivities.overdueCount > 0 ? "alert-circle" : "time-outline"}
                  size={20}
                  color={todayActivities.overdueCount > 0 ? '#dc2626' : '#16a34a'}
                />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Due Out & Overdue</Text>
                <Text style={[styles.operationSub, { color: todayActivities.overdueCount > 0 ? '#dc2626' : theme.textSecondary }]}>
                  {todayActivities.overdueCount > 0
                    ? `⚠️ ${todayActivities.overdueCount} guest(s) overdue for checkout`
                    : (todayActivities.dueOutCount > 0
                        ? `${todayActivities.dueOutCount} guest(s) expected to depart today`
                        : 'All active guests within booked duration')}
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View
                  style={[
                    styles.operationBadge,
                    { backgroundColor: todayActivities.overdueCount > 0 ? '#fee2e2' : '#dcfce7' }
                  ]}
                >
                  <Text
                    style={[
                      styles.operationBadgeText,
                      { color: todayActivities.overdueCount > 0 ? '#dc2626' : '#16a34a' }
                    ]}
                  >
                    {todayActivities.overdueCount > 0 ? `${todayActivities.overdueCount} Overdue` : `${todayActivities.dueOutCount} Due`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 3. Payments Collected Row */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push(can('shift') ? '/shift' : '/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Payments collected: ₹${todayActivities.paymentsTotal}`}
            >
              <View style={[styles.operationIconBox, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="cash-outline" size={20} color="#16a34a" />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Payments Collected</Text>
                <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                  {todayActivities.paymentsCount} transactions settled today
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View style={[styles.operationBadge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={[styles.operationBadgeText, { color: '#16a34a' }]}>
                    ₹{todayActivities.paymentsTotal.toLocaleString('en-IN')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 4. Shift Change & Drawer Status */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push(can('shift') ? '/shift' : '/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Shift status: ${todayActivities.shiftStatus}`}
            >
              <View style={[styles.operationIconBox, { backgroundColor: todayActivities.handoverPending ? '#fef3c7' : theme.surfaceSubtle }]}>
                <Ionicons
                  name={todayActivities.handoverPending ? "people" : "swap-horizontal-outline"}
                  size={20}
                  color={todayActivities.handoverPending ? '#d97706' : theme.accent}
                />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Shift Change & Drawer</Text>
                <Text style={[styles.operationSub, { color: todayActivities.handoverPending ? '#d97706' : theme.textSecondary }]}>
                  {todayActivities.handoverPending
                    ? '🤝 Handover pending: incoming staff please accept'
                    : (todayActivities.shiftStatus === 'Open' ? `Active Drawer • ₹${todayActivities.shiftCash} float` : 'No active shift open')}
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View
                  style={[
                    styles.operationBadge,
                    { backgroundColor: todayActivities.handoverPending ? '#fef3c7' : (todayActivities.shiftStatus === 'Open' ? '#dcfce7' : theme.surfaceSubtle) }
                  ]}
                >
                  <Text
                    style={[
                      styles.operationBadgeText,
                      { color: todayActivities.handoverPending ? '#d97706' : (todayActivities.shiftStatus === 'Open' ? '#16a34a' : theme.textSecondary) }
                    ]}
                  >
                    {todayActivities.handoverPending ? 'Handover' : todayActivities.shiftStatus}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 5. Payment Due / Unsettled Folios */}
            <TouchableOpacity
              style={[styles.operationRow, styles.operationRowBorder, { borderBottomColor: theme.separator }]}
              onPress={() => router.push(can('guests') ? '/guests' : '/rooms')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Payment Due: ${todayActivities.paymentDueCount} folios, ₹${todayActivities.paymentDueTotal}`}
            >
              <View style={[styles.operationIconBox, { backgroundColor: todayActivities.paymentDueCount > 0 ? '#fee2e2' : '#dcfce7' }]}>
                <Ionicons
                  name={todayActivities.paymentDueCount > 0 ? "alert-circle-outline" : "checkmark-circle-outline"}
                  size={20}
                  color={todayActivities.paymentDueCount > 0 ? '#dc2626' : '#16a34a'}
                />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Payment Due</Text>
                <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                  {todayActivities.paymentDueCount > 0
                    ? `${todayActivities.paymentDueCount} guests with pending balance`
                    : 'All guest folios settled'}
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View
                  style={[
                    styles.operationBadge,
                    { backgroundColor: todayActivities.paymentDueCount > 0 ? '#fee2e2' : '#dcfce7' }
                  ]}
                >
                  <Text
                    style={[
                      styles.operationBadgeText,
                      { color: todayActivities.paymentDueCount > 0 ? '#dc2626' : '#16a34a' }
                    ]}
                  >
                    {todayActivities.paymentDueCount > 0 ? `₹${todayActivities.paymentDueTotal.toLocaleString('en-IN')}` : 'Settled'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 6. Manager Approvals Row */}
            <TouchableOpacity
              style={[
                styles.operationRow,
                (can('broadcast_guests') || activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin')
                  ? [styles.operationRowBorder, { borderBottomColor: theme.separator }]
                  : null,
              ]}
              onPress={() => router.push('/approvals')}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <View style={[styles.operationIconBox, { backgroundColor: todayActivities.pendingApprovals > 0 ? '#fef3c7' : '#dcfce7' }]}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={todayActivities.pendingApprovals > 0 ? '#d97706' : '#16a34a'}
                />
              </View>
              <View style={styles.operationContent}>
                <Text style={[styles.operationTitle, { color: theme.text }]}>Manager Approvals</Text>
                <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                  {todayActivities.pendingApprovals > 0
                    ? `${todayActivities.pendingApprovals} request(s) awaiting decision`
                    : 'All discount, refund & broadcast requests reviewed'}
                </Text>
              </View>
              <View style={styles.operationTrailing}>
                <View
                  style={[
                    styles.operationBadge,
                    { backgroundColor: todayActivities.pendingApprovals > 0 ? '#fef3c7' : '#dcfce7' }
                  ]}
                >
                  <Text
                    style={[
                      styles.operationBadgeText,
                      { color: todayActivities.pendingApprovals > 0 ? '#d97706' : '#16a34a' }
                    ]}
                  >
                    {todayActivities.pendingApprovals > 0 ? `${todayActivities.pendingApprovals} Pending` : 'Clear'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </TouchableOpacity>

            {/* 7. Guest Broadcast Row (Owner / Co-Admin send directly; Front Desk requests approval) */}
            {can('broadcast_guests') && (
              <TouchableOpacity
                style={[
                  styles.operationRow,
                  (activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin')
                    ? [styles.operationRowBorder, { borderBottomColor: theme.separator }]
                    : null,
                ]}
                onPress={() => router.push('/broadcast' as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Guest Broadcast to ${activeGuests} checked-in guests`}
              >
                <View style={[styles.operationIconBox, { backgroundColor: theme.accentSubtle }]}>
                  <Ionicons name="megaphone-outline" size={20} color={theme.accentText} />
                </View>
                <View style={styles.operationContent}>
                  <Text style={[styles.operationTitle, { color: theme.text }]}>Guest Broadcast</Text>
                  <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                    {activeStaff?.role === 'desk'
                      ? 'Draft notice for Owner / Co-Admin approval'
                      : 'Send notice to all checked-in guests'}
                  </Text>
                </View>
                <View style={styles.operationTrailing}>
                  <View style={[styles.operationBadge, { backgroundColor: theme.accentSubtle }]}>
                    <Text style={[styles.operationBadgeText, { color: theme.accentText }]}>
                      {activeGuests} In-House
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                </View>
              </TouchableOpacity>
            )}

            {/* 8. UPI Reconciliation Row (Owner & Co-Admin only) */}
            {(activeStaff?.role === 'owner' || activeStaff?.role === 'co_admin') && (
              <TouchableOpacity
                style={styles.operationRow}
                onPress={() => router.push('/upi-reconciliation')}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <View style={[styles.operationIconBox, { backgroundColor: todayActivities.unverifiedUpiCount > 0 ? '#fff7ed' : '#ecfdf5' }]}>
                  <Ionicons
                    name="qr-code-outline"
                    size={20}
                    color={todayActivities.unverifiedUpiCount > 0 ? '#ea580c' : '#16a34a'}
                  />
                </View>
                <View style={styles.operationContent}>
                  <Text style={[styles.operationTitle, { color: theme.text }]}>UPI Reconciliation</Text>
                  <Text style={[styles.operationSub, { color: theme.textSecondary }]}>
                    {todayActivities.unverifiedUpiCount > 0
                      ? `⚠️ ${todayActivities.unverifiedUpiCount} UPI payment(s) awaiting bank statement match`
                      : 'All UPI payments matched with bank'}
                  </Text>
                </View>
                <View style={styles.operationTrailing}>
                  <View
                    style={[
                      styles.operationBadge,
                      { backgroundColor: todayActivities.unverifiedUpiCount > 0 ? '#ffedd5' : '#dcfce7' }
                    ]}
                  >
                    <Text
                      style={[
                        styles.operationBadgeText,
                        { color: todayActivities.unverifiedUpiCount > 0 ? '#c2410c' : '#15803d' }
                      ]}
                    >
                      {todayActivities.unverifiedUpiCount > 0 ? `${todayActivities.unverifiedUpiCount} Unverified` : 'Matched'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
        )}
      </ScrollView>

      {/* ── FREE ROOMS / BEDS AVAILABLE — pinned bottom bar ────────── */}
      <Pressable
        style={({ pressed }) => [
          styles.freeRoomsBar,
          {
            paddingBottom: insets.bottom + 10,
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.separator,
            opacity: pressed ? 0.75 : 1.0,
          }
        ]}
        onPress={openFreeRoomsSheet}
        accessibilityRole="button"
        accessibilityLabel={`${freeSummaryText}. Tap or swipe up anywhere to view.`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.freeRoomsDot, { backgroundColor: theme.free }]} />
          <Text style={[styles.freeRoomsTitle, { color: theme.text }]}>
            {freeSummaryText}
          </Text>
        </View>
        <Ionicons name="chevron-up" size={18} color={theme.textSecondary} />
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
            {...drawerPanResponder.panHandlers}
            style={[
              styles.drawerContainer,
              {
                width: DRAWER_WIDTH,
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 16,
                transform: [{ translateX: slideAnim }],
                backgroundColor: theme.backgroundElement,
              }
            ]}
          >
            {/* Drawer Staff Profile Header */}
            <View style={styles.drawerProfileHeader}>
              <View style={styles.drawerProfileRow}>
                <View style={[styles.drawerAvatar, { backgroundColor: theme.text }]}>
                  <Text style={[styles.drawerAvatarInitial, { color: theme.backgroundElement }]}>
                    {staffDisplayName ? staffDisplayName.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={styles.drawerProfileInfo}>
                  <Text style={[styles.drawerProfileName, { color: theme.text }]} numberOfLines={1}>
                    {staffDisplayName}
                  </Text>
                  <Text style={[styles.drawerProfileRole, { color: theme.textSecondary }]}>
                    {displayRole}
                  </Text>
                  {dutyStartTime ? (
                    <Text style={[styles.drawerProfileSince, { color: theme.textTertiary }]}>
                      Since {new Date(dutyStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : (
                    <Text style={[styles.drawerProfileSince, { color: theme.textTertiary }]}>Active</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.drawerDivider, { backgroundColor: theme.separator }]} />

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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Check-In</Text>
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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Check-Out</Text>
                </TouchableOpacity>
              )}

              {can('guests') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/guests')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="people" size={24} color={theme.accent} />
                  </View>
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Guests</Text>
                </TouchableOpacity>
              )}

              {can('broadcast_guests') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/broadcast')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="megaphone-outline" size={24} color={theme.accent} />
                  </View>
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Guest Broadcast</Text>
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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Shift</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => handleNav('/notifications')}
              >
                <View style={styles.drawerIconBox}>
                  <Ionicons name="notifications-outline" size={24} color="#8b5cf6" />
                </View>
                <Text style={[styles.drawerItemText, { color: theme.text }]}>Notifications</Text>
                {issueCount > 0 && (
                  <View style={[styles.drawerBadge, { backgroundColor: theme.destructive }]}>
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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Export Reports</Text>
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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Form C</Text>
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
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Digest</Text>
                </TouchableOpacity>
              )}

              {can('settings') && (
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => handleNav('/settings')}
                >
                  <View style={styles.drawerIconBox}>
                    <Ionicons name="settings-sharp" size={24} color={theme.textSecondary} />
                  </View>
                  <Text style={[styles.drawerItemText, { color: theme.text }]}>Settings</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Bottom Logout Button */}
            <View style={styles.drawerBottomWrapper}>
              <TouchableOpacity
                style={[styles.drawerLogoutBtn, { backgroundColor: theme.destructiveSubtle }]}
                onPress={handleLogoutPress}
              >
                <MaterialCommunityIcons name="power" size={20} color={theme.destructive} />
                <Text style={[styles.drawerLogoutText, { color: theme.destructive }]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ── APPLE HIG FREE ROOMS BOTTOM SHEET ───────────────────── */}
      <Modal
        visible={freeRoomsSheetVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => closeFreeRoomsSheet()}
      >
        <View style={styles.sheetModalOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => closeFreeRoomsSheet()} />

          <Animated.View
            style={[
              styles.sheetContainer,
              {
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: freeRoomsAnim }],
                backgroundColor: theme.backgroundElement,
                borderColor: theme.separator,
              }
            ]}
          >
            {/* Grabber handle with pan responder to drag down to dismiss */}
            <View {...sheetPanResponder.panHandlers} style={styles.grabberTouchArea}>
              <View style={[styles.sheetGrabber, { backgroundColor: theme.separator }]} />
            </View>

            {/* Sheet Header */}
            <View style={[styles.sheetHeader, { borderBottomColor: theme.separator }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.freeRoomsDot, { backgroundColor: theme.free }]} />
                  <Text style={[styles.sheetTitle, { color: theme.text }]}>
                    {freeSummaryText}
                  </Text>
                </View>
                <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                  Vacant units ready for immediate guest check-in
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.sheetCloseBtn, { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }]}
                onPress={() => closeFreeRoomsSheet()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close sheet"
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Free Rooms List */}
            {freeUnits.length === 0 ? (
              <View style={styles.sheetEmptyContainer}>
                <View style={[styles.sheetEmptyIconCircle, { backgroundColor: theme.freeSubtle }]}>
                  <Ionicons name="bed-outline" size={30} color={theme.free} />
                </View>
                <Text style={[styles.sheetEmptyTitle, { color: theme.text }]}>
                  All Rooms Occupied
                </Text>
                <Text style={[styles.sheetEmptySub, { color: theme.textSecondary }]}>
                  There are currently no vacant units available.
                </Text>
                <TouchableOpacity
                  style={[styles.sheetMatrixBtn, { backgroundColor: theme.accent }]}
                  onPress={() => {
                    closeFreeRoomsSheet(() => router.push('/room-matrix' as any));
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sheetMatrixBtnText}>Open Full Matrix</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheetList}>
                  {freeUnits.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.sheetUnitCard,
                        { backgroundColor: theme.backgroundSubtle, borderColor: theme.separator }
                      ]}
                      onPress={() => {
                        closeFreeRoomsSheet(() => {
                          if (u.isDorm && u.roomId) {
                            router.push(`/dorm/${u.roomId}` as any);
                          } else {
                            router.push(`/room/${u.id}` as any);
                          }
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.sheetUnitIconBox, { backgroundColor: theme.freeSubtle }]}>
                        <MaterialCommunityIcons
                          name={u.isDorm ? "bunk-bed-outline" : "bed-outline"}
                          size={20}
                          color={theme.free}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetUnitLabel, { color: theme.text }]} numberOfLines={1}>
                          {u.label}
                        </Text>
                        <Text style={[styles.sheetUnitSub, { color: theme.textSecondary }]}>
                          {u.isDorm ? 'Dormitory Bed' : 'Private Suite'} • Clean & Ready
                        </Text>
                      </View>
                      {can('check_in') && (
                        <TouchableOpacity
                          style={[styles.sheetCheckInPill, { backgroundColor: theme.accent }]}
                          onPress={() => {
                            closeFreeRoomsSheet(() => {
                              router.push(`/checkin?unitId=${u.id}` as any);
                            });
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`Check in to ${u.label}`}
                        >
                          <Text style={styles.sheetCheckInPillText}>Check In</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* View Full Room Grid Shortcut */}
                <TouchableOpacity
                  style={[styles.sheetFullMatrixBtn, { borderColor: theme.separator }]}
                  onPress={() => {
                    closeFreeRoomsSheet(() => navigateRooms('free'));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="grid-outline" size={16} color={theme.accent} />
                  <Text style={[styles.sheetFullMatrixText, { color: theme.accent }]}>
                    Open Rooms Matrix Filtered by Free
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Apple HIG Exit Modal */}
      <AppleExitModal
        visible={exitModalVisible}
        onCancel={() => setExitModalVisible(false)}
        onConfirm={() => {
          setExitModalVisible(false);
          BackHandler.exitApp();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 80  // room for pinned bottom bar
  },

  // Top App Bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10
  },
  topBarIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarIconShadow: {
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topBarTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.serif,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Hero Property Banner ──────────────────────────────────────────
  bannerContainer: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 16,
    overflow: 'hidden',
    height: BANNER_HEIGHT,
    backgroundColor: '#0F172A',
  },
  bannerBackground: {
    width: '100%',
    height: '100%',
  },
  bannerImage: {
    resizeMode: 'cover'
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 85,
  },
  bannerIdentityContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '92%',
  },
  bannerUserName: {
    fontSize: 34,
    fontWeight: '700',
    fontFamily: Fonts.serif,
    fontStyle: 'italic',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 6,
  },
  bannerPositionPill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  bannerPositionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  bannerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  bannerSyncCorner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  syncLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  bannerSyncCornerText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
  },

  // Sync Badge
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  syncText: {
    fontWeight: "600",
    fontSize: 13
  },

  // ── 3 Main Stat Cards — no inner pill ────────────────────────────
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  // Top accent bar replacing the inner pill
  statAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 10,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Housekeeping Clean Banner ──────────────────────────────────────
  housekeepingCleanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8
  },
  housekeepingCleanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  housekeepingCleanTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  housekeepingCleanText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Status Filter Pills — 2×2 grid ───────────────────────────────
  legendGrid: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 20
  },
  legendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  legendPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    minHeight: 44,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  legendPillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Segmented Toggle (Today's Activities vs Grid of Rooms) ────────
  viewToggleWrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  viewToggleTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  viewToggleIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  viewToggleSegment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    zIndex: 1,
  },
  viewToggleText: {
    fontSize: 14,
    letterSpacing: -0.2,
  },

  // ── Today's Operations Section ──────────────────────────────────
  operationsSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  operationsHeader: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  operationsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  operationsSectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  operationsCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  operationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  operationRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  operationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  operationContent: {
    flex: 1,
  },
  operationTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  operationSub: {
    fontSize: 12,
    marginTop: 2,
  },
  operationTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  operationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  operationBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Free Rooms Bar — pinned to the very bottom ────────────────────
  freeRoomsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  freeRoomsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  freeRoomsTitle: {
    fontSize: 15,
    fontWeight: '600',
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
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAvatarInitial: {
    fontSize: 22,
    fontWeight: '700',
  },
  drawerProfileInfo: {
    marginLeft: 14,
    flex: 1
  },
  drawerProfileName: {
    fontSize: 19,
    fontWeight: '700',
  },
  drawerProfileRole: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2
  },
  drawerProfileSince: {
    fontSize: 12,
    marginTop: 2
  },
  drawerDivider: {
    height: StyleSheet.hairlineWidth,
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
    fontWeight: '500',
    marginLeft: 14
  },

  // Drawer Bottom Logout
  drawerBottomWrapper: {
    marginTop: 10
  },
  drawerLogoutBtn: {
    backgroundColor: '#FEE2E2',
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
    fontWeight: '600',
    color: '#DC2626'
  },
  notifBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
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
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  drawerBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Apple HIG Free Rooms Bottom Sheet Styles ─────────────────────
  sheetModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.75, 560),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  grabberTouchArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetGrabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    padding: 18,
    gap: 10,
  },
  sheetList: {
    gap: 10,
  },
  sheetUnitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  sheetUnitIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetUnitLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sheetUnitSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetCheckInPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  sheetCheckInPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetFullMatrixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  sheetFullMatrixText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetEmptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  sheetEmptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sheetEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sheetEmptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
  },
  sheetMatrixBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sheetMatrixBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
