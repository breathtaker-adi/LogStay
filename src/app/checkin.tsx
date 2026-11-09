import * as Crypto from 'expo-crypto';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import { router } from "expo-router";
import { useEffect, useState, useMemo } from "react";
import { 
  ActivityIndicator, 
  Alert, 
  FlatList,
  Image, 
  Modal, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isOnline, saveToOutbox, addStayToCache, getCachedPropertyId, setCachedPropertyId, getRoomsCache, getUnitsCache, getStaysCache } from '../lib/offline';
import { supabase } from "../lib/supabase";
import { COUNTRIES } from '../lib/countries';
import { useStaff } from '../lib/staff-context';
import { uploadIdPhoto } from '../lib/photo';
import { ScreenHeader } from '@/lib/screen-header';
import { floorLabel, resolveFloorNo } from '@/lib/floors';
import { parseTD3, ParsedMRZ } from '@/lib/mrz';
import { useTheme } from '@/hooks/use-theme';
import { buildWelcomeKitMessage, openWhatsApp } from '@/lib/whatsapp';
import { StayCalendarModal } from '@/components/stay-calendar-modal';

const ALL_DOCS = [
  { id: 'Passport', label: 'Passport', icon: 'book-outline' as const, tag: 'Form C' },
  { id: 'Aadhaar', label: 'Aadhaar', icon: 'card-outline' as const, tag: 'Domestic' },
  { id: 'Driving License', label: 'Driving License', icon: 'car-outline' as const, tag: 'Domestic' },
  { id: 'Voter ID', label: 'Voter ID', icon: 'checkbox-outline' as const, tag: 'Domestic' },
  { id: 'Citizenship Card', label: 'Citizenship Card', icon: 'document-text-outline' as const, tag: 'Nepal/Bhutan' }
];

export default function CheckInScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  
  // Payment States
  const [amount, setAmount] = useState("");
  const [payMode, setPayMode] = useState<"cash" | "upi" | "pay_later">("cash");
  const [nights, setNights] = useState<number>(1);
  const [checkoutTime, setCheckoutTime] = useState<{ hours: number; minutes: number }>({ hours: 11, minutes: 0 });
  const [showCalendarModal, setShowCalendarModal] = useState<boolean>(false);
  
  // Gender & Nationality
  const [gender, setGender] = useState("male");
  const [nationality, setNationality] = useState("");
  const [natQuery, setNatQuery] = useState("");
  const [showCountryModal, setShowCountryModal] = useState(false);

  // ID Doc
  const [idType, setIdType] = useState("");
  const [idLast4, setIdLast4] = useState("");

  // Foreign Guest States (Form C)
  const [passportNo, setPassportNo] = useState("");
  const [visaNo, setVisaNo] = useState("");
  const [arrivedFrom, setArrivedFrom] = useState("");
  const [nextDest, setNextDest] = useState("");

  // MRZ Scanner Modal State
  const [showMrzModal, setShowMrzModal] = useState(false);
  const [showSpecimensHelp, setShowSpecimensHelp] = useState(false);
  const [mrzL1, setMrzL1] = useState("");
  const [mrzL2, setMrzL2] = useState("");
  const [mrzParsed, setMrzParsed] = useState<ParsedMRZ | null>(null);
  const [mrzVerified, setMrzVerified] = useState(false);

  const [failedAttempts, setFailedAttempts] = useState(0);

  // Dedicated Room / Bed Selector Modal states
  const [showBedModal, setShowBedModal] = useState(false);
  const [modalFloor, setModalFloor] = useState<string | null>(null);
  const [bedSearchQuery, setBedSearchQuery] = useState("");

  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Progressive disclosure threshold: >20 beds shows floors first, then rooms/beds
  const isLargeInventory = units.length > 20;

  const filteredModalUnits = useMemo(() => {
    const q = bedSearchQuery.trim().toLowerCase();
    if (q) {
      return units.filter(u => u.label.toLowerCase().includes(q) || u.floorTitle.toLowerCase().includes(q));
    }
    if (modalFloor) {
      return units.filter(u => u.floorTitle === modalFloor);
    }
    return units;
  }, [units, bedSearchQuery, modalFloor]);

  // Auto-split MRZ text helper
  const handleLine1Change = (t: string) => {
    const up = t.toUpperCase().replace(/\r/g, '');
    if (up.includes('\n')) {
      const parts = up.split('\n').filter(p => p.trim().length > 0);
      const l1 = parts[0]?.trim().slice(0, 44) || '';
      const l2 = parts[1]?.trim().slice(0, 44) || '';
      setMrzL1(l1);
      if (l2) setMrzL2(l2);
      if (l1.length === 44 && l2.length === 44) {
        setMrzParsed(parseTD3(l1, l2));
      }
      return;
    }
    if (up.length === 88) {
      const l1 = up.slice(0, 44);
      const l2 = up.slice(44, 88);
      setMrzL1(l1);
      setMrzL2(l2);
      setMrzParsed(parseTD3(l1, l2));
      return;
    }
    const truncated = up.slice(0, 44);
    setMrzL1(truncated);
    if (truncated.length === 44 && mrzL2.length === 44) {
      setMrzParsed(parseTD3(truncated, mrzL2));
    }
  };

  const handleLine2Change = (t: string) => {
    const up = t.toUpperCase().replace(/\r/g, '');
    if (up.includes('\n')) {
      const parts = up.split('\n').filter(p => p.trim().length > 0);
      const l1 = parts[0]?.trim().slice(0, 44) || '';
      const l2 = parts[1]?.trim().slice(0, 44) || '';
      if (l1 && !mrzL1) setMrzL1(l1);
      setMrzL2(l2 || l1);
      if ((l1 || mrzL1).length === 44 && (l2 || l1).length === 44) {
        setMrzParsed(parseTD3(l1 || mrzL1, l2 || l1));
      }
      return;
    }
    const truncated = up.slice(0, 44);
    setMrzL2(truncated);
    if (mrzL1.length === 44 && truncated.length === 44) {
      setMrzParsed(parseTD3(mrzL1, truncated));
    }
  };

  const pasteFromClipboard = async (targetLine?: 1 | 2) => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (!clip) {
        Alert.alert('Clipboard Empty', 'No text found on clipboard to paste.');
        return;
      }
      const cleaned = clip.replace(/\r/g, '').trim().toUpperCase();
      const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
      if (lines.length >= 2) {
        const l1 = lines[0].trim().slice(0, 44);
        const l2 = lines[1].trim().slice(0, 44);
        setMrzL1(l1);
        setMrzL2(l2);
        if (l1.length === 44 && l2.length === 44) {
          setMrzParsed(parseTD3(l1, l2));
        }
        return;
      }
      if (cleaned.length === 88) {
        const l1 = cleaned.slice(0, 44);
        const l2 = cleaned.slice(44, 88);
        setMrzL1(l1);
        setMrzL2(l2);
        setMrzParsed(parseTD3(l1, l2));
        return;
      }
      if (targetLine === 2) {
        handleLine2Change(cleaned);
      } else {
        handleLine1Change(cleaned);
      }
    } catch {
      Alert.alert('Clipboard Error', 'Unable to access clipboard.');
    }
  };

  const clearMrzInputs = () => {
    setMrzL1('');
    setMrzL2('');
    setMrzParsed(null);
  };

  // Group and sort available beds with Ground Floor (0) first, then upper floors, then basements
  const floorRank = (n: number | null | undefined) => {
    if (n === 0) return 0; // Ground floor first
    if (n !== null && n !== undefined && n > 0) return n; // Upper floors (1, 2, 3...)
    if (n !== null && n !== undefined && n < 0) return 1000 + Math.abs(n); // Basements (-1, -2...)
    return 9999; // No floor set
  };

  const groupedFloorUnits = useMemo(() => {
    const map = new Map<string, { floorNo: number | null; floorTitle: string; units: any[] }>();
    for (const u of units) {
      const key = u.floorTitle || 'No floor set';
      if (!map.has(key)) {
        map.set(key, { floorNo: u.floorNo, floorTitle: key, units: [] });
      }
      map.get(key)!.units.push(u);
    }
    return [...map.values()].sort((a, b) => floorRank(a.floorNo) - floorRank(b.floorNo));
  }, [units]);

  const expectedCheckoutDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(nights) || 1));
    d.setHours(checkoutTime.hours, checkoutTime.minutes, 0, 0);
    return d;
  }, [nights, checkoutTime]);

  // Auto-detect if foreign guest for Form C
  const isForeign = nationality !== "" && nationality !== "India" && nationality !== "Nepal" && nationality !== "Bhutan";

  // Filter Documents based on Nationality
  const getAvailableDocs = () => {
    if (!nationality) return ALL_DOCS;
    if (nationality === 'India') return ALL_DOCS.filter(d => d.tag === 'Domestic' || d.id === 'Passport');
    if (nationality === 'Nepal' || nationality === 'Bhutan') return ALL_DOCS.filter(d => ['Citizenship Card', 'Passport', 'Voter ID'].includes(d.id));
    return ALL_DOCS.filter(d => d.id === 'Passport'); // Foreign
  };

  useEffect(() => {
    fetchAvailableUnits();
  }, []);

  // If foreign, force Passport
  useEffect(() => {
    if (isForeign && idType !== 'Passport') {
      setIdType('Passport');
    }
  }, [isForeign, idType]);

  async function fetchAvailableUnits() {
    try {
      const online = await isOnline();
      if (!online) {
        const roomsData = getRoomsCache();
        const unitsData = getUnitsCache();
        const activeStays = getStaysCache();
        const occupiedUnitIds = (activeStays || []).map((s: any) => s.unit_id);

        const formattedUnits = (unitsData || [])
          .filter((u: any) => !occupiedUnitIds.includes(u.id))
          .map((u: any) => {
            const room = (roomsData || []).find((r: any) => r.id === u.room_id);
            const fNo = resolveFloorNo(room);
            return {
              id: u.id,
              label: `${room?.label || 'Room'} - ${u.label}`,
              floorNo: fNo,
              floorTitle: floorLabel(fNo)
            };
          });

        setUnits(formattedUnits);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;
      await setCachedPropertyId(memberData.property_id);

      const { data: prop } = await supabase
        .from('properties')
        .select('name, wifi_ssid, wifi_password, google_maps_url, house_rules, upi_id, upi_qr_url')
        .eq('id', memberData.property_id)
        .single();
      if (prop) setPropertyData(prop);

      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, label, kind, floor, floor_no')
        .eq('property_id', memberData.property_id)
        .is('archived_at', null);
      if (!roomsData) return;

      const roomIds = roomsData.map((r: any) => r.id);
      const { data: unitsData } = await supabase
        .from('units')
        .select('id, label, room_id')
        .in('room_id', roomIds)
        .is('archived_at', null);
      
      const { data: activeStays } = await supabase
        .from('stays')
        .select('unit_id')
        .eq('property_id', memberData.property_id)
        .eq('status', 'checked_in');

      const occupiedUnitIds = activeStays?.map((s: any) => s.unit_id) || [];

      const formattedUnits = (unitsData || [])
        .filter((u: any) => !occupiedUnitIds.includes(u.id))
        .map((u: any) => {
          const room = roomsData.find((r: any) => r.id === u.room_id);
          const fNo = resolveFloorNo(room);
          return {
            id: u.id,
            label: `${room?.label || 'Room'} - ${u.label}`,
            floorNo: fNo,
            floorTitle: floorLabel(fNo)
          };
        });

      setUnits(formattedUnits);
    } catch (error) {
      console.error("Error fetching units", error);
    } finally {
      setLoading(false);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Camera access is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const originalUri = result.assets[0].uri;
      
      // Compress the image to save bandwidth and prevent crashes
      const manipulated = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 1280 } }], // Shrink to max 1280px wide
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG } // 60% quality
      );
      
      setPhotoUri(manipulated.uri);
    }
  }

  async function completeCheckIn(isFlaggedOverride = false) {
    if (!isFlaggedOverride) {
      const missingFields: string[] = [];
      const cleanDigits = phone.replace(/\D/g, '');
      if (!name.trim()) missingFields.push('Full Name');
      if (!phone.trim() || cleanDigits.length < 7 || cleanDigits.length > 15) missingFields.push('Phone Number (7-15 digits)');
      if (!selectedUnit) missingFields.push('Assigned Room / Bed');
      if (!nationality.trim()) missingFields.push('Nationality');
      if (!idType) missingFields.push('Document Type');
      if (!photoUri) missingFields.push('Guest ID Photo');
      if (!amount || isNaN(parseFloat(amount))) missingFields.push('Stay Amount');

      if (missingFields.length > 0) {
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);

        if (nextFailed >= 3) {
          Alert.alert(
            "Incomplete Profile (3rd Attempt)",
            `Mandatory fields missing: ${missingFields.join(', ')}.\n\nChoose an action:`,
            [
              {
                text: "1. Try Again",
                style: "cancel",
                onPress: () => {}
              },
              {
                text: "2. Assign Room & Flag Tourist",
                style: "destructive",
                onPress: () => {
                  if (!selectedUnit) {
                    Alert.alert("Select Bed First", "Please select a room/bed first to assign the flagged guest.");
                    return;
                  }
                  completeCheckIn(true);
                }
              }
            ]
          );
          return;
        }

        Alert.alert(
          `Missing Required Information (${nextFailed}/3)`,
          `Please fill in all mandatory fields before completing check-in:\n\n• ${missingFields.join('\n• ')}`
        );
        return;
      }
    } else {
      if (!selectedUnit) {
        Alert.alert("Bed Selection Required", "Please select a vacant room/bed to assign the guest.");
        return;
      }
    }

    const checkinName = isFlaggedOverride
      ? (name.trim() ? `${name.trim()} [FLAGGED]` : 'Flagged Guest [INCOMPLETE]')
      : name.trim();
    const checkinPhone = phone.trim() || (isFlaggedOverride ? '0000000000' : '');
    const checkinNationality = nationality.trim() || (isFlaggedOverride ? 'India' : '');
    const checkinIdType = idType || (isFlaggedOverride ? 'Flagged Pending ID' : '');
    const checkinIdLast4 = idLast4 || (isFlaggedOverride ? '0000' : '');
    const checkinPhotoUri = photoUri || (isFlaggedOverride ? 'flagged_pending_photo' : '');

    const parsedAmount = parseFloat(amount);
    const finalAmount = isNaN(parsedAmount) || parsedAmount < 0 ? 0 : parsedAmount;
    if (finalAmount > 200000) {
      Alert.alert("Amount Limit Exceeded", "Maximum allowed stay amount is ₹200,000.");
      return;
    }
    if (finalAmount === 0 && payMode !== 'pay_later' && activeStaff?.role !== 'owner' && !isFlaggedOverride) {
      Alert.alert("Rate Restriction", "Complimentary (₹0) stays require Owner role.");
      return;
    }

    const online = await isOnline();

    // Fetch the unit's gender rule
    let unitGenderRule: string | null = null;
    if (online) {
      const { data: unitData } = await supabase
        .from('units')
        .select('gender_rule')
        .eq('id', selectedUnit)
        .single();
      unitGenderRule = unitData?.gender_rule || null;
    } else {
      const db = await (await import('../lib/offline')).getDb();
      const cachedUnit = await db.getFirstAsync<{ gender_rule: string }>('SELECT gender_rule FROM cache_units WHERE id = ?', [selectedUnit]);
      unitGenderRule = cachedUnit?.gender_rule || null;
    }

    if (unitGenderRule && unitGenderRule !== 'any' && unitGenderRule !== gender && !isFlaggedOverride) {
      if (activeStaff?.role !== 'owner') {
        Alert.alert('Gender Restriction', `This bed is restricted to ${unitGenderRule} guests only.`);
        return;
      } else {
        // Owner override warning
        const proceed = await new Promise((resolve) => {
          Alert.alert('Override Restriction?', `You are assigning a ${gender} guest to a ${unitGenderRule}-only bed. Continue?`, [
            { text: 'Cancel', onPress: () => resolve(false) },
            { text: 'Override', onPress: () => resolve(true) }
          ]);
        });
        if (!proceed) return;
      }
    }

    setLoading(true);

    try {
      let propId: string | null = null;
      if (online) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
        if (memberData?.property_id) {
          propId = memberData.property_id;
          await setCachedPropertyId(propId);
        }
      }

      if (!propId) {
        propId = await getCachedPropertyId();
      }

      if (!propId) throw new Error("Property not found. Please connect to internet once to load property details.");
      const validPropertyId: string = propId;

      if (online) {
        const guestId = Crypto.randomUUID();
        const stayId = Crypto.randomUUID(); // Added for idempotent retries
        let fileName = 'flagged_pending_photo';
        if (checkinPhotoUri && checkinPhotoUri !== 'flagged_pending_photo') {
          fileName = await uploadIdPhoto(validPropertyId, guestId, checkinPhotoUri);
        }
        const rpcPayMode = (payMode === 'pay_later' || isFlaggedOverride) ? null : payMode;

        const { error: rpcError } = await supabase.rpc('check_in_guest', {
          p_stay_id: stayId,
          p_guest_id: guestId,
          p_property_id: validPropertyId,
          p_name: checkinName, p_phone: checkinPhone, p_nationality: checkinNationality, p_gender: gender,
          p_id_type: checkinIdType, p_id_last4: checkinIdLast4, p_id_photo_path: fileName,
          p_unit_id: selectedUnit, p_amount: finalAmount, p_pay_mode: rpcPayMode,
          p_is_foreign: isForeign, p_passport_no: passportNo, p_visa_no: visaNo, p_visa_type: '',
          p_arrived_from: arrivedFrom, p_next_dest: nextDest,
          p_staff_id: activeStaff?.id,
          p_nights: Number(nights) || 1,
          p_expected_checkout: expectedCheckoutDate.toISOString()
        });

        if (rpcError) {
          if (rpcError.message.includes('Cannot accept cash without an open shift')) {
            Alert.alert('Shift Required', 'Please open a cash drawer shift before accepting cash payments.');
          } else {
            Alert.alert('Check-in Failed', rpcError.message);
          }
          return;
        }
        await addStayToCache(stayId, selectedUnit as string, checkinName);
      } else {
        const guestId = Crypto.randomUUID();
        const stayId = Crypto.randomUUID(); // Added for idempotent retries
        const rpcPayMode = (payMode === 'pay_later' || isFlaggedOverride) ? null : payMode;
        const offlinePayload = {
          id: stayId,
          stay_id: stayId, // Saved to outbox for stable retries
          guest_id: guestId,
          name: checkinName, phone: checkinPhone, nationality: checkinNationality, gender, idType: checkinIdType, idLast4: checkinIdLast4,
          photoUri: checkinPhotoUri, selectedUnit, amount: finalAmount.toString(), 
          payMode: rpcPayMode,
          pay_mode: rpcPayMode,
          nights: Number(nights) || 1,
          expected_checkout: expectedCheckoutDate.toISOString(),
          isForeign, passportNo, visaNo, arrivedFrom, nextDest,
          property_id: validPropertyId,
          staff_id: activeStaff?.id
        };
        saveToOutbox('guest_checkin', offlinePayload);
        await addStayToCache(stayId, selectedUnit as string, checkinName);
      }

      setFailedAttempts(0);

      const unitObj = units.find(u => u.id === selectedUnit);
      const unitLabel = unitObj?.label || 'Assigned Room/Bed';

      if (isFlaggedOverride) {
        Alert.alert(
          "Tourist Checked In (Flagged)",
          `${checkinName} has been assigned to ${unitLabel}.\n\n⚠️ Profile is flagged as incomplete. Please collect ID documents and payment details before checkout.`,
          [{ text: "OK", onPress: () => router.replace("/home") }]
        );
        return;
      }

      // Build personalized WhatsApp Welcome Kit & Digital Receipt
      const welcomeKit = buildWelcomeKitMessage({
        guestName: name.trim(),
        propertyName: propertyData?.name || 'LogStay',
        unitLabel,
        checkInDate: new Date().toLocaleDateString('en-GB'),
        amountPaid: finalAmount,
        payMode: payMode === 'pay_later' ? 'PAY LATER' : payMode,
        wifiSsid: propertyData?.wifi_ssid,
        wifiPassword: propertyData?.wifi_password,
        googleMapsUrl: propertyData?.google_maps_url,
        houseRules: propertyData?.house_rules
      });

      if (phone && phone.trim()) {
        Alert.alert(
          "Check-In Successful!",
          `${name.trim()} assigned to ${unitLabel}.\n\nSend welcome kit & Wi-Fi details via WhatsApp?`,
          [
            {
              text: "Skip",
              style: "cancel",
              onPress: () => router.replace("/home")
            },
            {
              text: "Send WhatsApp",
              onPress: async () => {
                await openWhatsApp(phone, welcomeKit);
                router.replace("/home");
              }
            }
          ]
        );
      } else {
        Alert.alert("Success", "Guest checked in successfully!", [
          { text: "Done", onPress: () => router.replace("/home") }
        ]);
      }

    } catch (error: any) {
      Alert.alert("Error", error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  // Filter countries for search
  const filteredCountries = (COUNTRIES || []).filter(c => 
    c.name.toLowerCase().includes(natQuery.toLowerCase()) || 
    c.aliases.some(a => a.includes(natQuery.toLowerCase()))
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScreenHeader title="Guest Check-In" subtitle="Fast Guest Registration" />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: theme.bg }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Section 1: ID Photo & Personal Details */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="camera-outline" size={18} color={theme.accent} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Guest Identity & Photo <Text style={{ color: '#dc2626' }}>*</Text></Text>
            </View>

            <TouchableOpacity 
              style={[styles.photoBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]} 
              onPress={() => { takePhoto(); }} 
              activeOpacity={0.8}
            >
              {photoUri ? (
                <>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <View style={styles.retakeBadge}>
                    <Ionicons name="camera" size={14} color="#ffffff" />
                    <Text style={styles.retakeText}>Retake Photo</Text>
                  </View>
                </>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <View style={[styles.photoIconCircle, { backgroundColor: theme.accentSubtle }]}>
                    <Ionicons name="camera" size={28} color={theme.accent} />
                  </View>
                  <Text style={[styles.photoTitle, { color: theme.text }]}>Take Guest ID Photo *</Text>
                  <Text style={[styles.photoSubtitle, { color: theme.textSecondary }]}>Camera snaps encrypted ID directly to storage</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Ionicons name="person-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Guest Full Name"
                placeholderTextColor={theme.textTertiary}
                value={name}
                onChangeText={setName}
                maxLength={60}
              />
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Phone Number <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Ionicons name="call-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Phone number (e.g. +91 9876543210)"
                placeholderTextColor={theme.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={16}
                textContentType="none"
                autoComplete="off"
              />
            </View>

            {/* GENDER SELECTOR */}
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Gender</Text>
            <View style={[styles.segmentedRow, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
              {["male", "female", "other"].map((g) => (
                <TouchableOpacity 
                  key={g} 
                  style={[styles.segmentBtn, gender === g && [styles.segmentBtnActive, { backgroundColor: theme.surface }]]}
                  onPress={() => setGender(g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, { color: theme.textSecondary }, gender === g && [styles.segmentTextActive, { color: theme.text }]]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Section 2: Nationality & Document Selection */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="card-outline" size={18} color={theme.accent} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Nationality & Document</Text>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nationality <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <TouchableOpacity 
              style={[styles.selectInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]} 
              onPress={() => setShowCountryModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={18} color={theme.accent} style={styles.inputIcon} />
              <Text style={{ color: nationality ? theme.text : theme.textTertiary, fontSize: 14, flex: 1, fontWeight: nationality ? '600' : '400' }}>
                {nationality ? `${natQuery}` : 'Tap to select country...'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Select Document Type <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <View style={styles.docGrid}>
              {getAvailableDocs().map((doc) => (
                <TouchableOpacity 
                  key={doc.id} 
                  style={[
                    styles.docCard, 
                    { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                    idType === doc.id && [styles.docCardActive, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]
                  ]}
                  onPress={() => setIdType(doc.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={doc.icon} 
                    size={22} 
                    color={idType === doc.id ? theme.accent : theme.textSecondary} 
                    style={{ marginBottom: 4 }} 
                  />
                  <Text style={[styles.docTitle, { color: theme.text }, idType === doc.id && { color: theme.accent }]}>{doc.label}</Text>
                  <View style={[styles.docTagBox, { backgroundColor: theme.surface }, idType === doc.id && { backgroundColor: theme.accentSubtle }]}>
                    <Text style={[styles.docTag, { color: theme.textSecondary }, idType === doc.id && { color: theme.accent }]}>{doc.tag}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {idType === 'Passport' && (
              <TouchableOpacity
                style={[styles.mrzTriggerBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.border }]}
                onPress={() => setShowMrzModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={17} color={mrzVerified ? theme.free : theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mrzTriggerTitle, { color: mrzVerified ? theme.free : theme.accent }]}>
                    {mrzVerified ? "Passport MRZ Verified" : "Scan / Parse Passport MRZ"}
                  </Text>
                  <Text style={[styles.mrzTriggerSub, { color: theme.textSecondary }]}>
                    {mrzVerified
                      ? `ICAO Checksum valid • ${mrzParsed?.fullName || ''}`
                      : "Auto-fill name, passport no. & nationality with check digits"}
                  </Text>
                </View>
                <Ionicons 
                  name={mrzVerified ? "checkmark-circle" : "chevron-forward"} 
                  size={18} 
                  color={mrzVerified ? theme.free : theme.textTertiary} 
                />
              </TouchableOpacity>
            )}

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Last 4 Digits of ID</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="e.g. 4321"
                placeholderTextColor={theme.textTertiary}
                value={idLast4}
                onChangeText={setIdLast4}
                maxLength={4}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Section 3: Bed & Unit Selection */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="bed-outline" size={18} color={theme.accent} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Assign Room / Bed <Text style={{ color: '#dc2626' }}>*</Text> ({units.length} available)
              </Text>
            </View>

            {units.length === 0 ? (
              <View style={styles.emptyUnitsBox}>
                <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No vacant beds available. Add rooms first.</Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.selectInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]} 
                onPress={() => {
                  setBedSearchQuery('');
                  setModalFloor(null);
                  setShowBedModal(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="bed-outline" size={18} color={theme.accent} style={styles.inputIcon} />
                <Text style={{ color: selectedUnit ? theme.text : theme.textTertiary, fontSize: 14, flex: 1, fontWeight: selectedUnit ? '600' : '400' }}>
                  {selectedUnit
                    ? (() => {
                        const u = units.find(item => item.id === selectedUnit);
                        return u ? `${u.label} (${u.floorTitle})` : 'Bed Selected';
                      })()
                    : `Tap to select room / bed (${units.length} free)...`}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Section 3.5: Stay Duration & Checkout (Apple HIG Customizable Days & Calendar) */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="calendar-outline" size={18} color={theme.accent} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Stay Duration &amp; Checkout</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>NUMBER OF NIGHTS</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent }}>
                {nights} {nights === 1 ? 'Night' : 'Nights'}
              </Text>
            </View>

            {/* Quick Segmented Presets */}
            <View style={[styles.segmentedRow, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle, marginBottom: 12 }]}>
              {[1, 2, 3, 5, 7, 14, 30].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.segmentBtn, nights === n && [styles.segmentBtnActive, { backgroundColor: theme.surface }]]}
                  onPress={() => setNights(n)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                >
                  <Text style={[styles.segmentText, { color: theme.textSecondary }, nights === n && [styles.segmentTextActive, { color: theme.text }]]}>
                    {n}N
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Interactive Apple Checkout Date & Time Card */}
            <TouchableOpacity
              style={[styles.checkoutPickerCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
              onPress={() => setShowCalendarModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Select checkout date and time on calendar. Currently ${expectedCheckoutDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at ${expectedCheckoutDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
            >
              <View style={[styles.calendarIconCircle, { backgroundColor: theme.accentSubtle }]}>
                <Ionicons name="calendar" size={20} color={theme.accent} />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.checkoutPickerLabel, { color: theme.textSecondary }]}>EXPECTED CHECKOUT (DATE &amp; TIME)</Text>
                <Text style={[styles.checkoutPickerValue, { color: theme.text }]}>
                  {expectedCheckoutDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <Ionicons name="time-outline" size={13} color={theme.accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>
                    {expectedCheckoutDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textTertiary }}>• Tap to open calendar</Text>
                </View>
              </View>

              <View style={[styles.calendarOpenBadge, { backgroundColor: theme.accent }]}>
                <Text style={styles.calendarOpenBadgeText}>Calendar</Text>
                <Ionicons name="chevron-forward" size={13} color="#ffffff" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Section 4: Payment Details */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
              <Ionicons name="wallet-outline" size={18} color={theme.accent} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Payment Details</Text>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Payment Mode</Text>
            <View style={[styles.segmentedRow, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
              {[
                { id: "cash", label: "Cash" },
                { id: "upi", label: "UPI" },
                { id: "pay_later", label: "Pay Later" }
              ].map((p) => (
                <TouchableOpacity 
                  key={p.id} 
                  style={[styles.segmentBtn, payMode === p.id && [styles.segmentBtnActive, { backgroundColor: theme.surface }]]}
                  onPress={() => setPayMode(p.id as any)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, { color: theme.textSecondary }, payMode === p.id && [styles.segmentTextActive, { color: theme.text }]]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Payment Amount (₹) <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>₹</Text>
              <TextInput
                style={[styles.textInput, { color: theme.text }]}
                placeholder="1000"
                placeholderTextColor={theme.textTertiary}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                maxLength={9}
                textContentType="none"
                autoComplete="off"
              />
            </View>

            {/* UPI Barcode & QR Display for Front Desk */}
            {payMode === 'upi' && (
              <View style={[styles.upiPaymentCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <View style={styles.upiCardHeaderRow}>
                  <Ionicons name="qr-code" size={18} color="#f59e0b" />
                  <Text style={[styles.upiCardTitle, { color: theme.text }]}>Direct UPI Barcode</Text>
                  <View style={[styles.upiLiveBadge, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[styles.upiLiveBadgeText, { color: '#b45309' }]}>UNVERIFIED</Text>
                  </View>
                </View>

                <View style={{ marginVertical: 8, padding: 8, borderRadius: 6, backgroundColor: '#fef3c7', borderColor: '#fde68a', borderWidth: 1 }}>
                  <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 16 }}>
                    Recorded as &quot;UPI (Unverified)&quot;. Property Owner will match against bank statement.
                  </Text>
                </View>

                {propertyData?.upi_qr_url ? (
                  <View style={styles.upiQrImageWrapper}>
                    <Image
                      source={{ uri: propertyData.upi_qr_url }}
                      style={styles.upiQrImage}
                      resizeMode="contain"
                    />
                    <Text style={[styles.upiScanInstruction, { color: theme.textSecondary }]}>
                      Guest can scan with Google Pay, PhonePe, Paytm, or BHIM
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.upiMissingBox, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
                    <Ionicons name="information-circle-outline" size={20} color="#b45309" />
                    <Text style={[styles.upiMissingText, { color: '#92400e' }]}>
                      No UPI QR image set by property owner yet. Set it in Settings &gt; UPI Barcode &amp; QR.
                    </Text>
                  </View>
                )}

                {propertyData?.upi_id ? (
                  <View style={[styles.upiIdRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.upiIdLabel, { color: theme.textSecondary }]}>UPI ID / VPA</Text>
                      <Text style={[styles.upiIdValue, { color: theme.text }]} numberOfLines={1}>
                        {propertyData.upi_id}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.copyUpiBtn, { backgroundColor: theme.accent }]}
                      onPress={async () => {
                        await Clipboard.setStringAsync(propertyData.upi_id);
                        Alert.alert('Copied', `UPI ID ${propertyData.upi_id} copied to clipboard.`);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={14} color="#ffffff" />
                      <Text style={styles.copyUpiBtnText}>Copy UPI</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.upiAmountPill}>
                  <Text style={[styles.upiAmountPillLabel, { color: theme.textSecondary }]}>Amount to Collect:</Text>
                  <Text style={[styles.upiAmountPillValue, { color: '#10b981' }]}>
                    ₹{amount && !isNaN(parseFloat(amount)) ? parseFloat(amount).toLocaleString('en-IN') : '0'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Section 5: Foreign Guest Form C (Conditional) */}
          {isForeign && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.cardHeader, { borderBottomColor: theme.borderSubtle }]}>
                <Ionicons name="airplane-outline" size={18} color={theme.accent} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>Form C Details (Foreign National)</Text>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Passport Number</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <TextInput 
                  style={[styles.textInput, { color: theme.text }]} 
                  placeholder="Passport No." 
                  placeholderTextColor={theme.textTertiary} 
                  value={passportNo} 
                  onChangeText={setPassportNo} 
                  maxLength={20}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Visa Number</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <TextInput 
                  style={[styles.textInput, { color: theme.text }]} 
                  placeholder="Visa No." 
                  placeholderTextColor={theme.textTertiary} 
                  value={visaNo} 
                  onChangeText={setVisaNo} 
                  maxLength={20}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Arrived From</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <TextInput 
                  style={[styles.textInput, { color: theme.text }]} 
                  placeholder="e.g. Bangkok / Mumbai" 
                  placeholderTextColor={theme.textTertiary} 
                  value={arrivedFrom} 
                  onChangeText={setArrivedFrom} 
                  maxLength={40}
                />
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Next Destination</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <TextInput 
                  style={[styles.textInput, { color: theme.text }]} 
                  placeholder="e.g. Goa / New Delhi" 
                  placeholderTextColor={theme.textTertiary} 
                  value={nextDest} 
                  onChangeText={setNextDest} 
                  maxLength={40}
                />
              </View>
            </View>
          )}

          {/* Action Submit Button */}
          <TouchableOpacity 
            style={[styles.submitActionBtn, { backgroundColor: theme.free }, loading && styles.submitActionBtnDisabled]} 
            onPress={() => completeCheckIn()} 
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.submitActionText}>Complete Check-In</Text>
              </>
            )}
          </TouchableOpacity>

          {/* ROOM / BED SELECTION MODAL */}
          <Modal visible={showBedModal} animationType="slide" transparent={false}>
            <View style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
              <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Assign Room / Bed</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                    {units.length} free beds available
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowBedModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.closeText, { color: theme.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={[styles.modalSearchBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <Ionicons name="search" size={17} color={theme.textTertiary} style={{ marginRight: 8 }} />
                <TextInput 
                  style={[styles.modalSearchInput, { color: theme.text }]} 
                  placeholder="Search room or bed (e.g. 101, Bed 2)..." 
                  placeholderTextColor={theme.textTertiary}
                  value={bedSearchQuery} 
                  onChangeText={setBedSearchQuery} 
                />
                {bedSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setBedSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {bedSearchQuery.trim().length > 0 ? (
                  // Search Results across all floors
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.modalSectionLabel, { color: theme.textSecondary }]}>
                      SEARCH RESULTS ({filteredModalUnits.length})
                    </Text>
                    {filteredModalUnits.length === 0 ? (
                      <Text style={[styles.modalEmptySearch, { color: theme.textTertiary }]}>
                        No free rooms or beds match &ldquo;{bedSearchQuery}&rdquo;
                      </Text>
                    ) : (
                      filteredModalUnits.map(item => (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.unitItem,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            selectedUnit === item.id && { backgroundColor: theme.accentSubtle, borderColor: theme.accent }
                          ]}
                          onPress={() => {
                            setSelectedUnit(item.id);
                            setShowBedModal(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.unitLeft}>
                            <Ionicons
                              name="bed"
                              size={18}
                              color={selectedUnit === item.id ? theme.accent : theme.textSecondary}
                            />
                            <View>
                              <Text style={[styles.unitText, { color: theme.text }, selectedUnit === item.id && { color: theme.accent }]}>
                                {item.label}
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.textTertiary }}>{item.floorTitle}</Text>
                            </View>
                          </View>
                          {selectedUnit === item.id && (
                            <View style={[styles.selectedCheck, { backgroundColor: theme.accent }]}>
                              <Ionicons name="checkmark" size={14} color="#ffffff" />
                            </View>
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ) : isLargeInventory ? (
                  modalFloor === null ? (
                    // Floor List (> 20 beds)
                    <View style={{ gap: 10 }}>
                      <Text style={[styles.modalSectionLabel, { color: theme.textSecondary }]}>
                        SELECT A FLOOR ({groupedFloorUnits.length} FLOORS)
                      </Text>
                      {groupedFloorUnits.map(fg => (
                        <TouchableOpacity
                          key={fg.floorTitle}
                          style={[styles.floorCardRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => setModalFloor(fg.floorTitle)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.floorIconBox, { backgroundColor: theme.accentSubtle }]}>
                            <Ionicons name="layers-outline" size={20} color={theme.accent} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.floorRowTitle, { color: theme.text }]}>{fg.floorTitle}</Text>
                            <Text style={[styles.floorRowSub, { color: theme.textSecondary }]}>
                              {fg.units.length} free bed{fg.units.length > 1 ? 's' : ''} available
                            </Text>
                          </View>
                          <View style={[styles.floorPill, { backgroundColor: theme.surfaceSubtle }]}>
                            <Text style={[styles.floorPillText, { color: theme.accent }]}>{fg.units.length}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={{ marginLeft: 6 }} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    // Selected Floor's Beds
                    <View style={{ gap: 10 }}>
                      <TouchableOpacity
                        style={[styles.backToFloorsBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                        onPress={() => setModalFloor(null)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-back" size={16} color={theme.accent} />
                        <Text style={[styles.backToFloorsText, { color: theme.accent }]}>All Floors</Text>
                        <Text style={[styles.backFloorActive, { color: theme.textSecondary }]}>• {modalFloor}</Text>
                      </TouchableOpacity>

                      <View style={{ gap: 8 }}>
                        {groupedFloorUnits.find(f => f.floorTitle === modalFloor)?.units.map(item => (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.unitItem,
                              { backgroundColor: theme.surface, borderColor: theme.border },
                              selectedUnit === item.id && { backgroundColor: theme.accentSubtle, borderColor: theme.accent }
                            ]}
                            onPress={() => {
                              setSelectedUnit(item.id);
                              setShowBedModal(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.unitLeft}>
                              <Ionicons
                                name="bed"
                                size={18}
                                color={selectedUnit === item.id ? theme.accent : theme.textSecondary}
                              />
                              <Text style={[styles.unitText, { color: theme.text }, selectedUnit === item.id && { color: theme.accent }]}>
                                {item.label}
                              </Text>
                            </View>
                            {selectedUnit === item.id && (
                              <View style={[styles.selectedCheck, { backgroundColor: theme.accent }]}>
                                <Ionicons name="checkmark" size={14} color="#ffffff" />
                              </View>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )
                ) : (
                  // <= 20 beds: directly show rooms/beds grouped by floor
                  <View style={{ gap: 16 }}>
                    {groupedFloorUnits.map(floorGroup => (
                      <View key={floorGroup.floorTitle} style={styles.checkinFloorSection}>
                        <View style={styles.checkinFloorBadge}>
                          <Ionicons name="layers-outline" size={12} color={theme.textSecondary} />
                          <Text style={[styles.checkinFloorTitle, { color: theme.textSecondary }]}>{floorGroup.floorTitle.toUpperCase()}</Text>
                          <Text style={[styles.checkinFloorCount, { color: theme.textTertiary }]}>({floorGroup.units.length} free)</Text>
                        </View>
                        <View style={{ gap: 6 }}>
                          {floorGroup.units.map(item => (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.unitItem,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                selectedUnit === item.id && { backgroundColor: theme.accentSubtle, borderColor: theme.accent }
                              ]}
                              onPress={() => {
                                setSelectedUnit(item.id);
                                setShowBedModal(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={styles.unitLeft}>
                                <Ionicons
                                  name="bed"
                                  size={18}
                                  color={selectedUnit === item.id ? theme.accent : theme.textSecondary}
                                />
                                <Text style={[styles.unitText, { color: theme.text }, selectedUnit === item.id && { color: theme.accent }]}>
                                  {item.label}
                                </Text>
                              </View>
                              {selectedUnit === item.id && (
                                <View style={[styles.selectedCheck, { backgroundColor: theme.accent }]}>
                                  <Ionicons name="checkmark" size={14} color="#ffffff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </Modal>

          {/* COUNTRY MODAL */}
          <Modal visible={showCountryModal} animationType="slide" transparent={false}>
            <View style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
              <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Nationality</Text>
                <TouchableOpacity onPress={() => setShowCountryModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.closeText, { color: theme.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>
              
              <View style={[styles.modalSearchBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <Ionicons name="search" size={17} color={theme.textTertiary} style={{ marginRight: 8 }} />
                <TextInput 
                  style={[styles.modalSearchInput, { color: theme.text }]} 
                  placeholder="Search country..." 
                  placeholderTextColor={theme.textTertiary}
                  value={natQuery} 
                  onChangeText={(text) => { setNatQuery(text); setNationality(""); }} 
                  autoFocus
                />
                {natQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setNatQuery(''); setNationality(''); }}>
                    <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredCountries}
                keyExtractor={(item: any) => item.name}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: any }) => (
                  <TouchableOpacity 
                    style={[styles.countryItem, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]} 
                    onPress={() => { 
                      setNationality(item.name); 
                      setNatQuery(`${item.flag} ${item.name}`); 
                      setShowCountryModal(false); 
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.countryFlag}>{item.flag}</Text>
                    <Text style={[styles.countryName, { color: theme.text }]}>{item.name}</Text>
                    {!item.formC && <Text style={[styles.badgeModal, { backgroundColor: theme.accentSubtle, color: theme.accent }]}>No Form C</Text>}
                  </TouchableOpacity>
                )}
              />
            </View>
          </Modal>

          {/* PASSPORT MRZ SCANNER MODAL */}
          <Modal visible={showMrzModal} animationType="slide" transparent={false}>
            <View style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
              <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Passport MRZ Scanner</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>ICAO Doc 9303 TD3 Two-Line Verification</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.specimensHeaderBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.border }]}
                    onPress={() => setShowSpecimensHelp(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="help-circle-outline" size={16} color={theme.accent} />
                    <Text style={[styles.specimensHeaderText, { color: theme.accent }]}>Specimens (?)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowMrzModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.closeText, { color: theme.accent }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                showsVerticalScrollIndicator={false}
              >
                <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>
                  Enter or paste the two 44-character machine-readable lines at the bottom of the guest’s passport. Check digits are validated on-device.
                </Text>

                {/* Quick MRZ Action Bar */}
                <View style={styles.mrzActionBar}>
                  <TouchableOpacity
                    style={[styles.mrzActionBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                    onPress={() => pasteFromClipboard()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="clipboard-outline" size={15} color={theme.accent} />
                    <Text style={[styles.mrzActionText, { color: theme.accent }]}>Paste 2-Line MRZ</Text>
                  </TouchableOpacity>

                  {(mrzL1.length > 0 || mrzL2.length > 0) && (
                    <TouchableOpacity
                      style={[styles.mrzActionBtn, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}
                      onPress={clearMrzInputs}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle-outline" size={15} color="#dc2626" />
                      <Text style={[styles.mrzActionText, { color: "#dc2626" }]}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Line 1 Variable Size / Monospace Input */}
                <View style={[styles.mrzFieldCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.mrzFieldHeader}>
                    <Text style={[styles.mrzFieldLabel, { color: theme.textSecondary }]}>LINE 1 (44 CHARACTERS)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[
                        styles.charCountBadge,
                        { backgroundColor: mrzL1.length === 44 ? '#dcfce7' : mrzL1.length > 44 ? '#fee2e2' : theme.surfaceSubtle }
                      ]}>
                        <Text style={[
                          styles.charCountText,
                          { color: mrzL1.length === 44 ? '#15803d' : mrzL1.length > 44 ? '#dc2626' : theme.textSecondary }
                        ]}>
                          {mrzL1.length}/44
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.fieldActionBtn}
                        onPress={() => pasteFromClipboard(1)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="clipboard-outline" size={16} color={theme.accent} />
                      </TouchableOpacity>
                      {mrzL1.length > 0 && (
                        <TouchableOpacity
                          style={styles.fieldActionBtn}
                          onPress={() => {
                            setMrzL1('');
                            setMrzParsed(null);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <TextInput
                    style={[
                      styles.mrzMultilineInput,
                      {
                        backgroundColor: theme.surfaceSubtle,
                        borderColor: mrzL1.length === 44 ? '#86efac' : mrzL1.length > 44 ? '#fca5a5' : theme.border,
                        color: theme.text
                      }
                    ]}
                    placeholder="P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
                    placeholderTextColor={theme.textTertiary}
                    value={mrzL1}
                    onChangeText={handleLine1Change}
                    multiline={true}
                    scrollEnabled={false}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>

                {/* Line 2 Variable Size / Monospace Input */}
                <View style={[styles.mrzFieldCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.mrzFieldHeader}>
                    <Text style={[styles.mrzFieldLabel, { color: theme.textSecondary }]}>LINE 2 (44 CHARACTERS)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[
                        styles.charCountBadge,
                        { backgroundColor: mrzL2.length === 44 ? '#dcfce7' : mrzL2.length > 44 ? '#fee2e2' : theme.surfaceSubtle }
                      ]}>
                        <Text style={[
                          styles.charCountText,
                          { color: mrzL2.length === 44 ? '#15803d' : mrzL2.length > 44 ? '#dc2626' : theme.textSecondary }
                        ]}>
                          {mrzL2.length}/44
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.fieldActionBtn}
                        onPress={() => pasteFromClipboard(2)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="clipboard-outline" size={16} color={theme.accent} />
                      </TouchableOpacity>
                      {mrzL2.length > 0 && (
                        <TouchableOpacity
                          style={styles.fieldActionBtn}
                          onPress={() => {
                            setMrzL2('');
                            setMrzParsed(null);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <TextInput
                    style={[
                      styles.mrzMultilineInput,
                      {
                        backgroundColor: theme.surfaceSubtle,
                        borderColor: mrzL2.length === 44 ? '#86efac' : mrzL2.length > 44 ? '#fca5a5' : theme.border,
                        color: theme.text
                      }
                    ]}
                    placeholder="L898902C<3UTO6908061F9406236ZE184226B<<<<<14"
                    placeholderTextColor={theme.textTertiary}
                    value={mrzL2}
                    onChangeText={handleLine2Change}
                    multiline={true}
                    scrollEnabled={false}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>

                {/* Live Parsed Results Card */}
                {mrzParsed && (
                  <View style={[styles.card, { borderColor: mrzParsed.ok ? '#86efac' : '#fca5a5', backgroundColor: mrzParsed.ok ? '#f0fdf4' : '#fef2f2' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name={mrzParsed.ok ? "checkmark-circle" : "alert-circle"} size={18} color={mrzParsed.ok ? "#16a34a" : "#dc2626"} />
                      <Text style={{ fontWeight: '700', fontSize: 14, color: mrzParsed.ok ? '#15803d' : '#991b1b' }}>
                        {mrzParsed.ok ? "Check Digits Validated (ICAO Doc 9303)" : "Check Digit Mismatch / Check Line Length"}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 13, color: theme.text }}>Name: <Text style={{ fontWeight: '700' }}>{mrzParsed.fullName}</Text></Text>
                    <Text style={{ fontSize: 13, color: theme.text }}>Passport No: <Text style={{ fontWeight: '700' }}>{mrzParsed.passportNo}</Text></Text>
                    <Text style={{ fontSize: 13, color: theme.text }}>Nationality: <Text style={{ fontWeight: '700' }}>{mrzParsed.nationalityName} ({mrzParsed.nationalityCode})</Text></Text>
                    <Text style={{ fontSize: 13, color: theme.text }}>Date of Birth: <Text style={{ fontWeight: '700' }}>{mrzParsed.dobFormatted}</Text></Text>
                    <Text style={{ fontSize: 13, color: theme.text }}>Gender: <Text style={{ fontWeight: '700' }}>{mrzParsed.sex === 'F' ? 'Female' : 'Male'}</Text></Text>

                    <TouchableOpacity
                      style={{
                        backgroundColor: '#16a34a',
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                        marginTop: 12
                      }}
                      onPress={() => {
                        setName(mrzParsed.fullName);
                        setPassportNo(mrzParsed.passportNo);
                        setIdLast4(mrzParsed.passportNo.slice(-4));
                        setNationality(mrzParsed.nationalityName);
                        setNatQuery(`📘 ${mrzParsed.nationalityName}`);
                        setGender(mrzParsed.sex === 'F' ? 'female' : 'male');
                        setMrzVerified(true);
                        setShowMrzModal(false);
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Apply to Check-In Form</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </Modal>

          {/* DEDICATED TEST SPECIMENS HELP MODAL */}
          <Modal visible={showSpecimensHelp} animationType="slide" transparent={false}>
            <View style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
              <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>MRZ Test Specimens</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Standard ICAO Doc 9303 TD3 Samples</Text>
                </View>
                <TouchableOpacity onPress={() => setShowSpecimensHelp(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.closeText, { color: theme.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
                <View style={[styles.specimensExplainerCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <Ionicons name="information-circle-outline" size={20} color={theme.accent} />
                  <Text style={[styles.specimensExplainerText, { color: theme.textSecondary }]}>
                    Passport Machine Readable Zones contain two lines of exactly 44 characters with Modulo-10 checksums. Tap any test specimen below to load it into the scanner.
                  </Text>
                </View>

                {/* UK Specimen */}
                <View style={[styles.specimenCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.specimenCardHeader}>
                    <Text style={styles.specimenFlag}>🇬🇧</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.specimenCountryTitle, { color: theme.text }]}>United Kingdom (GBR)</Text>
                      <Text style={[styles.specimenGuestName, { color: theme.textSecondary }]}>Sarah Stevens • Female</Text>
                    </View>
                  </View>
                  <View style={[styles.specimenCodeBox, { backgroundColor: theme.surfaceSubtle }]}>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>P&lt;GBRSTEVENS&lt;&lt;SARAH&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>9902468307GBR8501019F2501017&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;0</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.loadSpecimenBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      const l1 = 'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = '9902468307GBR8501019F2501017<<<<<<<<<<<<<<<0';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                      setShowSpecimensHelp(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.loadSpecimenBtnText}>Load into Scanner</Text>
                  </TouchableOpacity>
                </View>

                {/* India Specimen */}
                <View style={[styles.specimenCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.specimenCardHeader}>
                    <Text style={styles.specimenFlag}>🇮🇳</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.specimenCountryTitle, { color: theme.text }]}>India (IND)</Text>
                      <Text style={[styles.specimenGuestName, { color: theme.textSecondary }]}>Aditya Sharma • Male</Text>
                    </View>
                  </View>
                  <View style={[styles.specimenCodeBox, { backgroundColor: theme.surfaceSubtle }]}>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>P&lt;INDSHARMA&lt;&lt;ADITYA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>Z123456748IND9805152M3005158&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;4</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.loadSpecimenBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      const l1 = 'P<INDSHARMA<<ADITYA<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = 'Z123456748IND9805152M3005158<<<<<<<<<<<<<<<4';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                      setShowSpecimensHelp(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.loadSpecimenBtnText}>Load into Scanner</Text>
                  </TouchableOpacity>
                </View>

                {/* Germany Specimen */}
                <View style={[styles.specimenCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.specimenCardHeader}>
                    <Text style={styles.specimenFlag}>🇩🇪</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.specimenCountryTitle, { color: theme.text }]}>Germany (DEU)</Text>
                      <Text style={[styles.specimenGuestName, { color: theme.textSecondary }]}>Lukas Mueller • Male</Text>
                    </View>
                  </View>
                  <View style={[styles.specimenCodeBox, { backgroundColor: theme.surfaceSubtle }]}>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>P&lt;DEUMUELLER&lt;&lt;LUKAS&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
                    <Text style={[styles.specimenCodeText, { color: theme.textSecondary }]}>C01X00T478DEU9208064M3108062&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;8</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.loadSpecimenBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      const l1 = 'P<DEUMUELLER<<LUKAS<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = 'C01X00T478DEU9208064M3108062<<<<<<<<<<<<<<<8';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                      setShowSpecimensHelp(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.loadSpecimenBtnText}>Load into Scanner</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </Modal>

          {/* DEDICATED APPLE STAY CALENDAR & CHECKOUT TIME PICKER MODAL */}
          <StayCalendarModal
            visible={showCalendarModal}
            onClose={() => setShowCalendarModal(false)}
            checkinDate={new Date()}
            initialCheckoutDate={expectedCheckoutDate}
            initialNights={nights}
            onApply={(newCheckoutDate, newNights) => {
              setNights(newNights);
              setCheckoutTime({
                hours: newCheckoutDate.getHours(),
                minutes: newCheckoutDate.getMinutes(),
              });
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  keyboardAvoid: {
    flex: 1
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 150
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9"
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  photoBox: {
    height: 150,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    overflow: "hidden"
  },
  photoPlaceholder: {
    alignItems: "center",
    gap: 6
  },
  photoIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4
  },
  photoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  photoSubtitle: {
    fontSize: 12,
    color: "#64748b"
  },
  photoPreview: {
    width: "100%",
    height: "100%"
  },
  retakeBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,23,42,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  retakeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
    marginTop: 4
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 12
  },
  inputIcon: {
    marginRight: 8
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
    marginRight: 6
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: 0
  },
  segmentedRow: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    marginBottom: 12
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2
  },
  segmentText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600"
  },
  segmentTextActive: {
    color: "#0f172a",
    fontWeight: "700"
  },
  checkoutPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 56,
  },
  calendarIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutPickerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  checkoutPickerValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  calendarOpenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  calendarOpenBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 14
  },
  docGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14
  },
  docCard: {
    width: "48%",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    alignItems: "center"
  },
  docCardActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981"
  },
  docIcon: {
    fontSize: 22,
    marginBottom: 4
  },
  docTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b"
  },
  docTitleActive: {
    color: "#065f46"
  },
  docTagBox: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4
  },
  docTagBoxActive: {
    backgroundColor: "#d1fae5"
  },
  docTag: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600"
  },
  docTagActive: {
    color: "#047857"
  },
  unitItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    marginBottom: 6
  },
  unitItemSelected: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb"
  },
  unitLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  unitText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155"
  },
  unitTextSelected: {
    color: "#1d4ed8",
    fontWeight: "700"
  },
  selectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyUnitsBox: {
    padding: 16,
    alignItems: "center"
  },
  emptyText: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 13
  },
  foreignCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a"
  },
  submitActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    height: 50,
    borderRadius: 14,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 4
  },
  submitActionBtnDisabled: {
    opacity: 0.6
  },
  submitActionText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    marginTop: 50
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a"
  },
  closeText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600"
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    margin: 14
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    paddingVertical: 0
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
    marginHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6
  },
  countryFlag: {
    fontSize: 22,
    marginRight: 14
  },
  countryName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    flex: 1
  },
  badgeModal: {
    backgroundColor: "#dbeafe",
    color: "#1e40af",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  checkinFloorSection: {
    gap: 6
  },
  checkinFloorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 2
  },
  checkinFloorTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5
  },
  checkinFloorCount: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500'
  },
  mrzTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  mrzTriggerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  mrzTriggerSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  specimenBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0'
  },
  specimenBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  checkinFloorBar: {
    marginBottom: 8,
    paddingBottom: 4,
  },
  checkinFloorBarScroll: {
    gap: 8,
  },
  checkinFloorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  checkinFloorChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  specimensHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  specimensHeaderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mrzActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  mrzActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  mrzActionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  mrzFieldCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  mrzFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mrzFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  charCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  charCountText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fieldActionBtn: {
    padding: 4,
  },
  mrzMultilineInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    letterSpacing: 1.2,
    lineHeight: 20,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  specimensExplainerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  specimensExplainerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  specimenCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  specimenCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  specimenFlag: {
    fontSize: 28,
  },
  specimenCountryTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  specimenGuestName: {
    fontSize: 12.5,
    marginTop: 2,
  },
  specimenCodeBox: {
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  specimenCodeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  loadSpecimenBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadSpecimenBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── UPI Card Styles in Checkin ────────────────────────────────────
  upiPaymentCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  upiCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upiCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  upiLiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  upiLiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  upiQrImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  upiQrImage: {
    width: 170,
    height: 170,
    borderRadius: 8,
    marginBottom: 8,
  },
  upiScanInstruction: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  upiMissingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  upiMissingText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  upiIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  upiIdValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  copyUpiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyUpiBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  upiAmountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  upiAmountPillLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  upiAmountPillValue: {
    fontSize: 18,
    fontWeight: '800',
  },

  // ── Modal Room & Bed Picker Styles ─────────────────────────────────
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalEmptySearch: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 20,
    textAlign: 'center',
  },
  floorCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  floorIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorRowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  floorRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  floorPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  floorPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  backToFloorsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  backToFloorsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  backFloorActive: {
    fontSize: 13,
    fontWeight: '500',
  },
});