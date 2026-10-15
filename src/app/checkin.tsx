import * as Crypto from 'expo-crypto';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
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

const ALL_DOCS = [
  { id: 'Passport', label: 'Passport', icon: '📘', tag: 'Form C' },
  { id: 'Aadhaar', label: 'Aadhaar', icon: '🪪', tag: 'Domestic' },
  { id: 'Driving License', label: 'Driving License', icon: '🚗', tag: 'Domestic' },
  { id: 'Voter ID', label: 'Voter ID', icon: '🗳️', tag: 'Domestic' },
  { id: 'Citizenship Card', label: 'Citizenship Card', icon: '📜', tag: 'Nepal/Bhutan' }
];

export default function CheckInScreen() {
  const { activeStaff } = useStaff();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  
  // Payment States
  const [amount, setAmount] = useState("");
  const [payMode, setPayMode] = useState<"cash" | "upi" | "pay_later">("cash");
  
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
  const [mrzL1, setMrzL1] = useState("");
  const [mrzL2, setMrzL2] = useState("");
  const [mrzParsed, setMrzParsed] = useState<ParsedMRZ | null>(null);
  const [mrzVerified, setMrzVerified] = useState(false);

  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [isForeign]);

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

  async function completeCheckIn() {
    if (!name || !photoUri || !selectedUnit || !amount || !nationality || !idType) {
      Alert.alert("Missing Info", "Please fill all fields, take ID photo, and select a bed.");
      return;
    }
    // Validate Phone Number
    if (phone && phone.length !== 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid stay amount.");
      return;
    }
    if (parsedAmount > 200000) {
      Alert.alert("Amount Limit Exceeded", "Maximum allowed stay amount is ₹200,000.");
      return;
    }
    if (parsedAmount === 0 && payMode !== 'pay_later' && activeStaff?.role !== 'owner') {
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

    if (unitGenderRule && unitGenderRule !== 'any' && unitGenderRule !== gender) {
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
        const fileName = await uploadIdPhoto(validPropertyId, guestId, photoUri as string);
        const rpcPayMode = payMode === 'pay_later' ? null : payMode;

        const { error: rpcError } = await supabase.rpc('check_in_guest', {
          p_stay_id: stayId,
          p_guest_id: guestId,
          p_property_id: validPropertyId,
          p_name: name, p_phone: phone, p_nationality: nationality, p_gender: gender,
          p_id_type: idType, p_id_last4: idLast4, p_id_photo_path: fileName,
          p_unit_id: selectedUnit, p_amount: parseFloat(amount), p_pay_mode: rpcPayMode,
          p_is_foreign: isForeign, p_passport_no: passportNo, p_visa_no: visaNo, p_visa_type: '',
          p_arrived_from: arrivedFrom, p_next_dest: nextDest,
          p_staff_id: activeStaff?.id
        });

        if (rpcError) {
          if (rpcError.message.includes('Cannot accept cash without an open shift')) {
            Alert.alert('Shift Required', 'Please open a cash drawer shift before accepting cash payments.');
          } else {
            Alert.alert('Check-in Failed', rpcError.message);
          }
          return;
        }
        await addStayToCache(stayId, selectedUnit, name);
        Alert.alert("Success", "Guest checked in safely!");

      } else {
        const guestId = Crypto.randomUUID();
        const stayId = Crypto.randomUUID(); // Added for idempotent retries
        const rpcPayMode = payMode === 'pay_later' ? null : payMode;
        const offlinePayload = {
          id: stayId,
          stay_id: stayId, // Saved to outbox for stable retries
          guest_id: guestId,
          name, phone, nationality, gender, idType, idLast4,
          photoUri: photoUri, selectedUnit, amount, 
          payMode: rpcPayMode,
          pay_mode: rpcPayMode,
          isForeign, passportNo, visaNo, arrivedFrom, nextDest,
          property_id: validPropertyId,
          staff_id: activeStaff?.id
        };
        saveToOutbox('guest_checkin', offlinePayload);
        await addStayToCache(stayId, selectedUnit, name);
        Alert.alert("Saved Offline", "Guest check-in saved locally. Will sync safely when online.");
      }

      router.replace("/home");

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
    <View style={styles.root}>
      <ScreenHeader title="Guest Check-In" subtitle="Fast Guest Registration" />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Section 1: ID Photo & Personal Details */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="camera-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Guest Identity & Photo</Text>
            </View>

            <TouchableOpacity style={styles.photoBox} onPress={() => { takePhoto(); }} activeOpacity={0.8}>
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
                  <View style={styles.photoIconCircle}>
                    <Ionicons name="camera" size={28} color="#2563eb" />
                  </View>
                  <Text style={styles.photoTitle}>Take Guest ID Photo</Text>
                  <Text style={styles.photoSubtitle}>Camera snaps encrypted ID directly to storage</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Guest Full Name"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />
            </View>

            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94a3b8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                textContentType="none"
                autoComplete="off"
              />
            </View>

            {/* GENDER SELECTOR */}
            <Text style={styles.inputLabel}>Gender</Text>
            <View style={styles.segmentedRow}>
              {["male", "female", "other"].map((g) => (
                <TouchableOpacity 
                  key={g} 
                  style={[styles.segmentBtn, gender === g && styles.segmentBtnActive]}
                  onPress={() => setGender(g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, gender === g && styles.segmentTextActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Section 2: Nationality & Document Selection */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="card-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Nationality & Document</Text>
            </View>

            <Text style={styles.inputLabel}>Nationality</Text>
            <TouchableOpacity 
              style={styles.selectInput} 
              onPress={() => setShowCountryModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={18} color="#2563eb" style={styles.inputIcon} />
              <Text style={{ color: nationality ? '#0f172a' : '#94a3b8', fontSize: 14, flex: 1, fontWeight: nationality ? '600' : '400' }}>
                {nationality ? `${natQuery}` : 'Tap to select country...'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Select Document Type</Text>
            <View style={styles.docGrid}>
              {getAvailableDocs().map((doc) => (
                <TouchableOpacity 
                  key={doc.id} 
                  style={[styles.docCard, idType === doc.id && styles.docCardActive]}
                  onPress={() => setIdType(doc.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.docIcon}>{doc.icon}</Text>
                  <Text style={[styles.docTitle, idType === doc.id && styles.docTitleActive]}>{doc.label}</Text>
                  <View style={[styles.docTagBox, idType === doc.id && styles.docTagBoxActive]}>
                    <Text style={[styles.docTag, idType === doc.id && styles.docTagActive]}>{doc.tag}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {idType === 'Passport' && (
              <TouchableOpacity
                style={styles.mrzTriggerBtn}
                onPress={() => setShowMrzModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={17} color={mrzVerified ? "#15803d" : "#2563eb"} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mrzTriggerTitle, mrzVerified && { color: '#15803d' }]}>
                    {mrzVerified ? "Passport MRZ Verified" : "Scan / Parse Passport MRZ"}
                  </Text>
                  <Text style={styles.mrzTriggerSub}>
                    {mrzVerified
                      ? `ICAO Checksum valid • ${mrzParsed?.fullName || ''}`
                      : "Auto-fill name, passport no. & nationality with check digits"}
                  </Text>
                </View>
                <Ionicons 
                  name={mrzVerified ? "checkmark-circle" : "chevron-forward"} 
                  size={18} 
                  color={mrzVerified ? "#16a34a" : "#94a3b8"} 
                />
              </TouchableOpacity>
            )}

            <Text style={styles.inputLabel}>Last 4 Digits of ID</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 4321"
                placeholderTextColor="#94a3b8"
                value={idLast4}
                onChangeText={setIdLast4}
                maxLength={4}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Section 3: Bed & Unit Selection */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="bed-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Assign Room / Bed ({units.length} available)</Text>
            </View>

            {units.length === 0 ? (
              <View style={styles.emptyUnitsBox}>
                <Text style={styles.emptyText}>No vacant beds available. Add rooms first.</Text>
              </View>
            ) : (
              <View style={{ gap: 12, marginBottom: 4 }}>
                {groupedFloorUnits.map((floorGroup) => (
                  <View key={floorGroup.floorTitle} style={styles.checkinFloorSection}>
                    <View style={styles.checkinFloorBadge}>
                      <Ionicons name="layers-outline" size={12} color="#475569" />
                      <Text style={styles.checkinFloorTitle}>{floorGroup.floorTitle.toUpperCase()}</Text>
                      <Text style={styles.checkinFloorCount}>({floorGroup.units.length} free)</Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      {floorGroup.units.map((item) => (
                        <TouchableOpacity 
                          key={item.id}
                          style={[styles.unitItem, selectedUnit === item.id && styles.unitItemSelected]} 
                          onPress={() => setSelectedUnit(item.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.unitLeft}>
                            <Ionicons 
                              name="bed" 
                              size={18} 
                              color={selectedUnit === item.id ? "#2563eb" : "#64748b"} 
                            />
                            <Text style={[styles.unitText, selectedUnit === item.id && styles.unitTextSelected]}>
                              {item.label}
                            </Text>
                          </View>
                          {selectedUnit === item.id ? (
                            <View style={styles.selectedCheck}>
                              <Ionicons name="checkmark" size={14} color="#ffffff" />
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Section 4: Payment Details */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="wallet-outline" size={18} color="#2563eb" />
              <Text style={styles.cardTitle}>Payment Details</Text>
            </View>

            <Text style={styles.inputLabel}>Payment Mode</Text>
            <View style={styles.segmentedRow}>
              {[
                { id: "cash", label: "Cash" },
                { id: "upi", label: "UPI" },
                { id: "pay_later", label: "Pay Later" }
              ].map((p) => (
                <TouchableOpacity 
                  key={p.id} 
                  style={[styles.segmentBtn, payMode === p.id && styles.segmentBtnActive]}
                  onPress={() => setPayMode(p.id as any)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, payMode === p.id && styles.segmentTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Payment Amount (₹)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.textInput}
                placeholder="1000"
                placeholderTextColor="#94a3b8"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                textContentType="none"
                autoComplete="off"
              />
            </View>
          </View>

          {/* Section 5: Foreign Guest Form C (Conditional) */}
          {isForeign && (
            <View style={[styles.card, styles.foreignCard]}>
              <View style={styles.cardHeader}>
                <Ionicons name="airplane-outline" size={18} color="#92400e" />
                <Text style={[styles.cardTitle, { color: '#92400e' }]}>Form C Details (Foreign National)</Text>
              </View>

              <Text style={styles.inputLabel}>Passport Number</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.textInput} placeholder="Passport No." placeholderTextColor="#94a3b8" value={passportNo} onChangeText={setPassportNo} />
              </View>

              <Text style={styles.inputLabel}>Visa Number</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.textInput} placeholder="Visa No." placeholderTextColor="#94a3b8" value={visaNo} onChangeText={setVisaNo} />
              </View>

              <Text style={styles.inputLabel}>Arrived From</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.textInput} placeholder="e.g. Bangkok / Mumbai" placeholderTextColor="#94a3b8" value={arrivedFrom} onChangeText={setArrivedFrom} />
              </View>

              <Text style={styles.inputLabel}>Next Destination</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.textInput} placeholder="e.g. Goa / New Delhi" placeholderTextColor="#94a3b8" value={nextDest} onChangeText={setNextDest} />
              </View>
            </View>
          )}

          {/* Action Submit Button */}
          <TouchableOpacity 
            style={[styles.submitActionBtn, loading && styles.submitActionBtnDisabled]} 
            onPress={completeCheckIn} 
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

          {/* COUNTRY MODAL */}
          <Modal visible={showCountryModal} animationType="slide" transparent={false}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Nationality</Text>
                <TouchableOpacity onPress={() => setShowCountryModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.closeText}>✕ Close</Text>
                </TouchableOpacity>
              </View>
              
              <TextInput 
                style={styles.modalSearchInput} 
                placeholder="Search country..." 
                placeholderTextColor="#94a3b8"
                value={natQuery} 
                onChangeText={(text) => { setNatQuery(text); setNationality(""); }} 
                autoFocus
              />

              <FlatList
                data={filteredCountries}
                keyExtractor={(item: any) => item.name}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: any }) => (
                  <TouchableOpacity 
                    style={styles.countryItem} 
                    onPress={() => { 
                      setNationality(item.name); 
                      setNatQuery(`${item.flag} ${item.name}`); 
                      setShowCountryModal(false); 
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.countryFlag}>{item.flag}</Text>
                    <Text style={styles.countryName}>{item.name}</Text>
                    {!item.formC && <Text style={styles.badgeModal}>No Form C</Text>}
                  </TouchableOpacity>
                )}
              />
            </View>
          </Modal>

          {/* PASSPORT MRZ SCANNER MODAL */}
          <Modal visible={showMrzModal} animationType="slide" transparent={false}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Passport MRZ Scanner</Text>
                  <Text style={{ fontSize: 13, color: '#64748b' }}>ICAO Doc 9303 TD3 Two-Line Verification</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMrzModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.closeText}>✕ Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
                <Text style={{ fontSize: 13.5, color: '#475569', lineHeight: 20 }}>
                  Enter or paste the two 44-character machine-readable lines at the bottom of the guest’s passport. Modulo-10 check digits are validated on-device.
                </Text>

                {/* Specimen Buttons for Demos & Testing */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5 }}>TEST SPECIMENS (OFFLINE DEMO)</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={styles.specimenBtn}
                    onPress={() => {
                      const l1 = 'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = '9902468307GBR8501019F2501017<<<<<<<<<<<<<<<0';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                    }}
                  >
                    <Text style={styles.specimenBtnText}>🇬🇧 UK Specimen</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.specimenBtn}
                    onPress={() => {
                      const l1 = 'P<INDSHARMA<<ADITYA<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = 'Z123456748IND9805152M3005158<<<<<<<<<<<<<<<4';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                    }}
                  >
                    <Text style={styles.specimenBtnText}>🇮🇳 India Specimen</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.specimenBtn}
                    onPress={() => {
                      const l1 = 'P<DEUMUELLER<<LUKAS<<<<<<<<<<<<<<<<<<<<<<<<<';
                      const l2 = 'C01X00T478DEU9208064M3108062<<<<<<<<<<<<<<<8';
                      setMrzL1(l1);
                      setMrzL2(l2);
                      setMrzParsed(parseTD3(l1, l2));
                    }}
                  >
                    <Text style={styles.specimenBtnText}>🇩🇪 German Specimen</Text>
                  </TouchableOpacity>
                </View>

                {/* Line 1 Input */}
                <Text style={styles.inputLabel}>LINE 1 (44 CHARACTERS)</Text>
                <TextInput
                  style={[styles.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13 }]}
                  placeholder="P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
                  placeholderTextColor="#94a3b8"
                  value={mrzL1}
                  onChangeText={(t) => {
                    const up = t.toUpperCase();
                    setMrzL1(up);
                    if (up.length === 44 && mrzL2.length === 44) {
                      setMrzParsed(parseTD3(up, mrzL2));
                    }
                  }}
                  maxLength={44}
                  autoCapitalize="characters"
                />

                {/* Line 2 Input */}
                <Text style={styles.inputLabel}>LINE 2 (44 CHARACTERS)</Text>
                <TextInput
                  style={[styles.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13 }]}
                  placeholder="L898902C<3UTO6908061F9406236ZE184226B<<<<<14"
                  placeholderTextColor="#94a3b8"
                  value={mrzL2}
                  onChangeText={(t) => {
                    const up = t.toUpperCase();
                    setMrzL2(up);
                    if (mrzL1.length === 44 && up.length === 44) {
                      setMrzParsed(parseTD3(mrzL1, up));
                    }
                  }}
                  maxLength={44}
                  autoCapitalize="characters"
                />

                {/* Live Parsed Results Card */}
                {mrzParsed && (
                  <View style={[styles.card, { borderColor: mrzParsed.ok ? '#86efac' : '#fca5a5', backgroundColor: mrzParsed.ok ? '#f0fdf4' : '#fef2f2' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name={mrzParsed.ok ? "checkmark-circle" : "alert-circle"} size={18} color={mrzParsed.ok ? "#16a34a" : "#dc2626"} />
                      <Text style={{ fontWeight: '700', fontSize: 14, color: mrzParsed.ok ? '#15803d' : '#991b1b' }}>
                        {mrzParsed.ok ? "Check Digits Validated (ICAO Doc 9303)" : "Check Digit Mismatch / Check Line Length"}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 13, color: '#334155' }}>Name: <Text style={{ fontWeight: '700' }}>{mrzParsed.fullName}</Text></Text>
                    <Text style={{ fontSize: 13, color: '#334155' }}>Passport No: <Text style={{ fontWeight: '700' }}>{mrzParsed.passportNo}</Text></Text>
                    <Text style={{ fontSize: 13, color: '#334155' }}>Nationality: <Text style={{ fontWeight: '700' }}>{mrzParsed.nationalityName} ({mrzParsed.nationalityCode})</Text></Text>
                    <Text style={{ fontSize: 13, color: '#334155' }}>Date of Birth: <Text style={{ fontWeight: '700' }}>{mrzParsed.dobFormatted}</Text></Text>
                    <Text style={{ fontSize: 13, color: '#334155' }}>Gender: <Text style={{ fontWeight: '700' }}>{mrzParsed.sex === 'F' ? 'Female' : 'Male'}</Text></Text>

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
    padding: 16,
    paddingBottom: 150
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a"
  },
  photoBox: {
    height: 160,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
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
    width: 52,
    height: 52,
    borderRadius: 26,
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
    bottom: 12,
    right: 12,
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
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
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
    gap: 8,
    marginBottom: 12
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center"
  },
  segmentBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  segmentText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600"
  },
  segmentTextActive: {
    color: "#ffffff",
    fontWeight: "700"
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
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
    borderWidth: 1.5,
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
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    marginBottom: 8
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
    width: 22,
    height: 22,
    borderRadius: 11,
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
    height: 52,
    borderRadius: 14,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
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
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a"
  },
  closeText: {
    color: "#dc2626",
    fontSize: 15,
    fontWeight: "700"
  },
  modalSearchInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 13,
    margin: 16,
    fontSize: 15,
    color: "#0f172a"
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    marginHorizontal: 16,
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
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  specimenBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  }
});