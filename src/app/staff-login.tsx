// src/app/staff-login.tsx
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, getStaffCache, cacheStaff, saveLocalPinHash, verifyLocalPin } from '@/lib/offline';

export default function StaffLoginScreen() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const { setActiveStaff } = useStaff();

  const fetchStaff = async () => {
    setLoading(true);

    // 1. Read from local cache first
    const localStaff = await getStaffCache();
    if (localStaff.length > 0) {
      setStaffList(localStaff);
      setLoading(false);
    }

    // 2. If online, fetch from Supabase and update cache
    if (await isOnline()) {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return router.replace('/login');

      // Find the user's property
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member) return router.replace('/setup-property');

      // Fetch active staff for this property using the secure view
      const { data, error } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', member.property_id)
        .eq('active', true);

      if (error) {
        Alert.alert('Error', 'Could not load staff list');
        console.error(error);
      } else if (data) {
        setStaffList(data);
        await cacheStaff(data); // Save to local cache
      }
    } else {
      if (localStaff.length === 0) {
        Alert.alert('Offline', 'No staff data cached. Please connect to the internet to log in.');
      }
    }
    setLoading(false);
  };

  // Refetch every time this screen gains focus (e.g. after adding staff in Settings)
  useFocusEffect(
    useCallback(() => {
      fetchStaff();
    }, [])
  );

  const handleVerify = async () => {
    if (!selectedStaff || pin.length < 4) return;
    setVerifying(true);

    if (await isOnline()) {
      const { data, error } = await supabase.rpc('staff_login', {
        p_staff: selectedStaff.id,
        p_pin: pin
      });

      setVerifying(false);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (data === true) {
        // SAVE LOCAL PIN HASH FOR OFFLINE USE
        await saveLocalPinHash(selectedStaff.id, pin);

        // 1. Clock in the staff member via secure RPC
        const { data: attId, error: attError } = await supabase.rpc('clock_in_staff', {
          p_staff_id: selectedStaff.id
        });

        let attendanceId = null;
        if (!attError && attId) {
          attendanceId = attId;
        }

        // 2. Set active staff in context with the attendance ID
        await setActiveStaff({ 
          id: selectedStaff.id, 
          name: selectedStaff.name, 
          role: selectedStaff.role,
          attendanceId: attendanceId
        });
        router.replace('/home');
      } else {
        Alert.alert('Invalid PIN', 'The PIN you entered is incorrect.');
        setPin('');
      }
    } else {
      // OFFLINE FALLBACK: Verify locally
      setVerifying(false);
      try {
        const isValid = await verifyLocalPin(selectedStaff.id, pin);
        if (isValid) {
          await setActiveStaff({
            id: selectedStaff.id,
            name: selectedStaff.name,
            role: selectedStaff.role,
            attendanceId: null
          });
          router.replace('/home');
        } else {
          Alert.alert('Invalid PIN', 'The PIN you entered is incorrect.');
          setPin('');
        }
      } catch (e: any) {
        Alert.alert('Locked', e.message);
      }
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{"Who's at the desk?"}</Text>
      
      {!selectedStaff ? (
        staffList.length === 0 ? (
          // Empty State
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={56} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No staff profiles yet</Text>
            <Text style={styles.emptySub}>Add yourself (owner) or a desk staff member with a 4-digit PIN to continue.</Text>
            <Pressable style={styles.loginBtn} onPress={() => router.push('/add-staff')}>
              <Text style={styles.loginBtnText}>+ Add First Staff</Text>
            </Pressable>
            <Pressable onPress={fetchStaff}>
              <Text style={styles.backText}>↻ Refresh</Text>
            </Pressable>
          </View>
        ) : (
          // Staff Selection List
          staffList.map(staff => (
            <Pressable key={staff.id} style={styles.staffCard} onPress={() => setSelectedStaff(staff)}>
              <Text style={styles.staffName}>{staff.name}</Text>
              <Text style={styles.staffRole}>{staff.role}</Text>
            </Pressable>
          ))
        )
      ) : (
        // PIN Entry
        <View style={styles.pinContainer}>
          <Text style={styles.selectedName}>Welcome, {selectedStaff.name}</Text>
          <TextInput
            style={styles.pinInput}
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={setPin}
            autoFocus
          />
          <Pressable style={styles.loginBtn} onPress={handleVerify} disabled={verifying}>
            <Text style={styles.loginBtnText}>{verifying ? 'Checking...' : 'Enter'}</Text>
          </Pressable>
          <Pressable onPress={() => { setSelectedStaff(null); setPin(''); }}>
            <Text style={styles.backText}>← Back to list</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 24, paddingTop: 56, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  staffCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  staffName: { fontSize: 18, fontWeight: '600' },
  staffRole: { color: '#64748b', textTransform: 'capitalize' },
  pinContainer: { marginTop: 40, alignItems: 'center' },
  selectedName: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  pinInput: { width: 120, height: 60, borderWidth: 2, borderColor: '#2563eb', borderRadius: 12, fontSize: 28, textAlign: 'center', marginBottom: 24 },
  loginBtn: { backgroundColor: '#2563eb', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12 },
  loginBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  backText: { color: '#64748b', marginTop: 16 },
  emptyBox: { alignItems: 'center', marginTop: 60, paddingHorizontal: 16, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155' },
  emptySub: { color: '#64748b', textAlign: 'center', marginBottom: 12 }
});