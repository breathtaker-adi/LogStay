import * as Crypto from 'expo-crypto';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { 
  ActivityIndicator, 
  Alert, 
  Button, 
  FlatList, 
  Image, 
  Modal, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View 
} from "react-native";
import { isOnline, saveToOutbox } from '../lib/offline';
import { supabase } from "../lib/supabase";
import { COUNTRIES } from '../lib/countries';
import { useStaff } from '../lib/staff-context';

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
  const [payMode, setPayMode] = useState<"cash" | "upi">("cash");
  
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

  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) return;

      const { data: roomsData } = await supabase.from('rooms').select('id, label, kind').eq('property_id', memberData.property_id);
      if (!roomsData) return;

      const roomIds = roomsData.map((r: any) => r.id);
      const { data: unitsData } = await supabase.from('units').select('id, label, room_id').in('room_id', roomIds);
      
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
          return { id: u.id, label: `${room?.label || 'Room'} - ${u.label}` };
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

    setLoading(true);
    const online = await isOnline();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberData } = await supabase.from('members').select('property_id').eq('user_id', user?.id).single();
      if (!memberData) throw new Error("No property found for user.");

      if (online) {
        const response = await fetch(photoUri as string);
        const blob = await response.blob();
        const fileName = `${memberData.property_id}/id_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('id_photos').upload(fileName, blob);
        if (uploadError) throw uploadError;

        const guestId = Crypto.randomUUID();
        const stayId = Crypto.randomUUID(); // Added for idempotent retries

        const { error: rpcError } = await supabase.rpc('check_in_guest', {
          p_stay_id: stayId,
          p_guest_id: guestId,
          p_property_id: memberData.property_id,
          p_name: name, p_phone: phone, p_nationality: nationality, p_gender: gender,
          p_id_type: idType, p_id_last4: idLast4, p_id_photo_path: fileName,
          p_unit_id: selectedUnit, p_amount: parseFloat(amount), p_pay_mode: payMode,
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
        Alert.alert("Success", "Guest checked in safely!");

      } else {
        const guestId = Crypto.randomUUID();
        const stayId = Crypto.randomUUID(); // Added for idempotent retries
        const offlinePayload = {
          id: stayId,
          stay_id: stayId, // Saved to outbox for stable retries
          guest_id: guestId,
          name, phone, nationality, gender, idType, idLast4,
          photoUri: photoUri, selectedUnit, amount, payMode,
          isForeign, passportNo, visaNo, arrivedFrom, nextDest,
          property_id: memberData.property_id,
          staff_id: activeStaff?.id
        };
        saveToOutbox('guest_checkin', offlinePayload);
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
      <Text style={styles.title}>Guest Check-In</Text>

      <TouchableOpacity style={styles.photoBox} onPress={() => { takePhoto(); }}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoText}>📷 Take ID Photo</Text>
        )}
      </TouchableOpacity>

      <TextInput style={styles.input} placeholder="Guest Name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Phone (10 digits)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} textContentType="none" autoComplete="off" />

      {/* GENDER TOGGLE */}
      <Text style={styles.label}>Gender</Text>
      <View style={styles.toggleGroup}>
        {["male", "female", "other"].map((g) => (
          <TouchableOpacity 
            key={g} 
            style={[styles.toggleBtn, gender === g && styles.toggleActive]}
            onPress={() => setGender(g)}
          >
            <Text style={gender === g ? styles.toggleTextActive : styles.toggleText}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* NATIONALITY SEARCH */}
      <Text style={styles.label}>🌐 Nationality</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShowCountryModal(true)}>
        <Text style={{ color: nationality ? '#1f2937' : '#9ca3af', fontSize: 16 }}>
          {nationality ? `${natQuery}` : 'Tap to select nationality...'}
        </Text>
      </TouchableOpacity>

      {/* DOCUMENT GRID */}
      <Text style={styles.label}>Select Document</Text>
      <View style={styles.docGrid}>
        {getAvailableDocs().map((doc) => (
          <TouchableOpacity 
            key={doc.id} 
            style={[styles.docCard, idType === doc.id && styles.docCardActive]}
            onPress={() => setIdType(doc.id)}
          >
            <Text style={styles.docIcon}>{doc.icon}</Text>
            <Text style={styles.docTitle}>{doc.label}</Text>
            <Text style={styles.docTag}>{doc.tag}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput style={styles.input} placeholder="Last 4 Digits of ID" value={idLast4} onChangeText={setIdLast4} maxLength={4} keyboardType="numeric" />

      {/* Payment Section */}
      <Text style={styles.label}>Payment Details</Text>
      <View style={styles.toggleGroup}>
        <TouchableOpacity style={[styles.toggleBtn, payMode === "cash" && styles.toggleActive]} onPress={() => setPayMode("cash")}>
          <Text style={payMode === "cash" ? styles.toggleTextActive : styles.toggleText}>Cash</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, payMode === "upi" && styles.toggleActive]} onPress={() => setPayMode("upi")}>
          <Text style={payMode === "upi" ? styles.toggleTextActive : styles.toggleText}>UPI</Text>
        </TouchableOpacity>
      </View>
      <TextInput style={styles.input} placeholder="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" textContentType="none" autoComplete="off" />

      {/* Foreign Guest Form C Section */}
      {isForeign && (
        <View style={styles.foreignBox}>
          <Text style={styles.foreignTitle}>Form C Details (Foreign Guest)</Text>
          <TextInput style={styles.input} placeholder="Passport No." value={passportNo} onChangeText={setPassportNo} />
          <TextInput style={styles.input} placeholder="Visa No." value={visaNo} onChangeText={setVisaNo} />
          <TextInput style={styles.input} placeholder="Arrived From" value={arrivedFrom} onChangeText={setArrivedFrom} />
          <TextInput style={styles.input} placeholder="Next Destination" value={nextDest} onChangeText={setNextDest} />
        </View>
      )}

      <Text style={styles.label}>Assign Bed/Unit</Text>
      <FlatList
        data={units}
        keyExtractor={(item) => item.id}
        style={{ maxHeight: 150, marginBottom: 10 }}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.unitItem, selectedUnit === item.id && styles.unitItemSelected]} onPress={() => setSelectedUnit(item.id)}>
            <Text>{item.label}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No beds available. Add rooms first.</Text>}
      />

      <Button title="Complete Check-In" onPress={completeCheckIn} color="#059669" disabled={loading} />

      {/* COUNTRY MODAL */}
      <Modal visible={showCountryModal} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Nationality</Text>
            <TouchableOpacity onPress={() => setShowCountryModal(false)}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
          
          <TextInput 
            style={styles.modalSearchInput} 
            placeholder="Search country..." 
            value={natQuery} 
            onChangeText={(text) => { setNatQuery(text); setNationality(""); }} 
            autoFocus
          />

          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.countryItem} 
                onPress={() => { 
                  setNationality(item.name); 
                  setNatQuery(`${item.flag} ${item.name}`); 
                  setShowCountryModal(false); 
                }}
              >
                <Text style={styles.countryFlag}>{item.flag}</Text>
                <Text style={styles.countryName}>{item.name}</Text>
                {!item.formC && <Text style={styles.badgeModal}>No Form C</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f3f4f6" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center", color: "#1f2937" },
  photoBox: { height: 150, backgroundColor: "white", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", justifyContent: "center", alignItems: "center", marginBottom: 15, overflow: "hidden" },
  photoPreview: { width: "100%", height: "100%" },
  photoText: { color: "#6b7280", fontSize: 16 },
  input: { backgroundColor: "white", padding: 15, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: "#374151" },
  
  // Toggles
  toggleGroup: { flexDirection: "row", marginBottom: 15, justifyContent: "space-between" },
  toggleBtn: { flex: 1, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "white", alignItems: "center", marginHorizontal: 5 },
  toggleActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  toggleText: { color: "#6b7280", fontWeight: "600" },
  toggleTextActive: { color: "white", fontWeight: "bold" },

  // Doc Grid
  docGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 15 },
  docCard: { width: "48%", backgroundColor: "white", padding: 15, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", marginBottom: 10 },
  docCardActive: { backgroundColor: "#ecfdf5", borderColor: "#10b981", borderWidth: 2 },
  docIcon: { fontSize: 24, marginBottom: 5 },
  docTitle: { fontWeight: "bold", color: "#1f2937" },
  docTag: { fontSize: 10, color: "#6b7280", marginTop: 4 },

  // Foreign Box
  foreignBox: { backgroundColor: "#fef3c7", padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: "#fde68a" },
  foreignTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 10, color: "#92400e" },
  
  // Units
  unitItem: { padding: 12, backgroundColor: "white", borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 5 },
  unitItemSelected: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  emptyText: { textAlign: "center", color: "#9ca3af", marginTop: 10 },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: "#f3f4f6", marginTop: 60 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1f2937" },
  closeText: { color: "#ef4444", fontSize: 16, fontWeight: "bold" },
  modalSearchInput: { backgroundColor: "white", padding: 15, borderRadius: 8, margin: 20, borderWidth: 1, borderColor: "#e5e7eb" },
  countryItem: { flexDirection: "row", alignItems: "center", padding: 15, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", marginHorizontal: 20, borderRadius: 8, marginBottom: 5 },
  countryFlag: { fontSize: 24, marginRight: 15 },
  countryName: { fontSize: 16, fontWeight: "600", color: "#1f2937", flex: 1 },
  badgeModal: { backgroundColor: "#dbeafe", color: "#1e40af", fontSize: 10, fontWeight: "bold", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
});