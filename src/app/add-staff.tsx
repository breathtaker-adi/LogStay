// src/app/add-staff.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';

export default function AddStaffScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'desk' | 'housekeeping'>('desk');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { activeStaff } = useStaff();

  const handleSave = async () => {
    if (!name || pin.length < 4) {
      Alert.alert('Missing Info', 'Please enter a name and a 4-digit PIN.');
      return;
    }

    setLoading(true);

    try {
      // 1. Get current user's property_id
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      
      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!member) throw new Error('No property found for this user');

      // 2. Call owner_add_staff RPC
      const { error: insertError } = await supabase.rpc('owner_add_staff', {
        p_prop: member.property_id,
        p_actor: activeStaff?.id || null, // null if creating the very first owner
        p_name: name,
        p_phone: phone,
        p_role: role,
        p_pin: pin
      });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Staff member added successfully.');
      router.back();

    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add staff.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Add Team Member</Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Ramesh" />

      <Text style={styles.label}>Phone (Optional)</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />

      <Text style={styles.label}>Role</Text>
      <View style={styles.roleContainer}>
        <Pressable 
          style={[styles.roleBtn, role === 'owner' && styles.roleBtnActive]} 
          onPress={() => setRole('owner')}>
          <Text style={[styles.roleText, role === 'owner' && styles.roleTextActive]}>Owner</Text>
        </Pressable>
        <Pressable 
          style={[styles.roleBtn, role === 'desk' && styles.roleBtnActive]} 
          onPress={() => setRole('desk')}>
          <Text style={[styles.roleText, role === 'desk' && styles.roleTextActive]}>Front Desk</Text>
        </Pressable>
        <Pressable 
          style={[styles.roleBtn, role === 'housekeeping' && styles.roleBtnActive]} 
          onPress={() => setRole('housekeeping')}>
          <Text style={[styles.roleText, role === 'housekeeping' && styles.roleTextActive]}>Housekeeping</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>4-Digit PIN</Text>
      <TextInput 
        style={[styles.input, styles.pinInput]} 
        value={pin} 
        onChangeText={setPin} 
        placeholder="1234" 
        keyboardType="numeric" 
        secureTextEntry 
        maxLength={4} 
      />

      <Pressable style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Staff</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f8fafc' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#64748b', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 16 },
  roleContainer: { flexDirection: 'row', gap: 12 },
  roleBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  roleText: { color: '#64748b', fontWeight: '600' },
  roleTextActive: { color: '#fff' },
  pinInput: { width: 100, textAlign: 'center', fontSize: 20, letterSpacing: 4 },
  saveBtn: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
