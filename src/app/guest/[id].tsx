import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, ActivityIndicator, Modal, TextInput, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, saveToOutbox } from '@/lib/offline';
import * as Crypto from 'expo-crypto';

export default function GuestDetailScreen() {
  const { id, stayId } = useLocalSearchParams<{ id: string; stayId: string }>();
  const { activeStaff } = useStaff();
  
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<any>(null);
  const [stay, setStay] = useState<any>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  
  // Charge form state
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  
  // Payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('cash');

  const fetchDetails = async () => {
    setLoading(true);
    
    // Fetch Guest
    const { data: guestData } = await supabase.from('guests').select('*').eq('id', id).single();
    setGuest(guestData);

    // Fetch Stay
    const { data: stayData } = await supabase.from('stays').select('*').eq('id', stayId).single();
    setStay(stayData);

    // Fetch Charges
    const { data: chargesData } = await supabase
      .from('charges')
      .select('*')
      .eq('stay_id', stayId)
      .order('created_at', { ascending: false });
    setCharges(chargesData || []);

    setLoading(false);
  };

  useEffect(() => {
    fetchDetails();
  }, [id, stayId]);

  const handleViewPhoto = async () => {
    if (!guest?.id_photo_path) return;
    
    setLoadingPhoto(true);
    
    try {
      // 1. Generate a 60-second signed URL
      const { data, error } = await supabase.storage
        .from('id_photos')
        .createSignedUrl(guest.id_photo_path, 60);

      if (error) throw error;
      setPhotoUrl(data.signedUrl);

      // 2. Write to Audit Log
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_log').insert({
        property_id: guest.property_id,
        user_id: userData.user?.id,
        action: 'view_id_photo',
        record_id: guest.id
      });
    } catch (e: any) {
      Alert.alert('Error', 'Could not load ID photo.');
    } finally {
      setLoadingPhoto(false);
    }
  };

  const totalCharges = charges.reduce((sum, c) => sum + Number(c.unit_price) * c.qty, 0);
  const totalPaid = stay?.paid_amount || 0;
  const balance = (Number(stay?.amount || 0) + totalCharges) - totalPaid;

  const handleAddCharge = async () => {
    if (!item || !price || !activeStaff) return;
    const chargeId = Crypto.randomUUID();
    const numPrice = parseFloat(price);

    if (await isOnline()) {
      const { error } = await supabase.from('charges').insert({
        id: chargeId,
        property_id: guest.property_id,
        stay_id: stayId,
        item,
        qty: 1,
        unit_price: numPrice,
        paid: false,
        staff_id: activeStaff.id
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('add_charge', {
        charge_id: chargeId,
        property_id: guest.property_id,
        stay_id: stayId,
        item,
        qty: 1,
        unit_price: numPrice,
        paid: false,
        staff_id: activeStaff.id
      });
      // Optimistic UI
      setCharges([...charges, { id: chargeId, item, qty: 1, unit_price: numPrice, created_at: new Date().toISOString() }]);
    }

    setShowChargeModal(false);
    setItem('');
    setPrice('');
    Alert.alert('Success', 'Charge added to folio.');
    fetchDetails();
  };

  const handleCollectPayment = async () => {
    if (!payAmount || !activeStaff) return;
    const numAmount = parseFloat(payAmount);

    if (await isOnline()) {
      const { error } = await supabase.rpc('record_payment', {
        p_stay_id: stayId,
        p_amount: numAmount,
        p_pay_mode: payMode,
        p_staff_id: activeStaff.id
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('record_payment', {
        stay_id: stayId,
        amount: numAmount,
        pay_mode: payMode,
        staff_id: activeStaff.id
      });
    }

    setShowPayModal(false);
    setPayAmount('');
    Alert.alert('Success', 'Payment recorded.');
    fetchDetails();
  };

  if (loading || !guest) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.guestName}>{guest.name}</Text>
          <Text style={styles.guestInfo}>{guest.phone || 'No phone'} • {guest.nationality}</Text>
          <Text style={styles.guestInfo}>ID: {guest.id_type} ****{guest.id_last4}</Text>
          {guest.id_photo_path && (
            <Pressable 
              style={{ backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, alignSelf: 'flex-start', marginTop: 12 }} 
              onPress={handleViewPhoto}
              disabled={loadingPhoto}
            >
              <Text style={{ color: '#2563eb', fontWeight: 'bold', fontSize: 14 }}>
                {loadingPhoto ? 'Loading...' : 'View ID Photo'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Folio Summary */}
      <View style={styles.folioCard}>
        <View style={styles.folioRow}>
          <Text style={styles.folioLabel}>Stay Amount</Text>
          <Text style={styles.folioValue}>₹{stay?.amount || 0}</Text>
        </View>
        <View style={styles.folioRow}>
          <Text style={styles.folioLabel}>Extra Charges</Text>
          <Text style={styles.folioValue}>₹{totalCharges}</Text>
        </View>
        <View style={styles.folioRow}>
          <Text style={styles.folioLabel}>Paid</Text>
          <Text style={[styles.folioValue, { color: '#10b981' }]}>- ₹{totalPaid}</Text>
        </View>
        <View style={[styles.folioRow, styles.folioTotal]}>
          <Text style={styles.folioTotalLabel}>Balance Due</Text>
          <Text style={styles.folioTotalValue}>₹{balance}</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.btnRow}>
        <Pressable style={styles.chargeBtn} onPress={() => setShowChargeModal(true)}>
          <Text style={styles.btnText}>+ Add Purchase</Text>
        </Pressable>
        <Pressable style={styles.payBtn} onPress={() => setShowPayModal(true)}>
          <Text style={styles.btnText}>Collect Payment</Text>
        </Pressable>
      </View>

      {/* Charges List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Folio History</Text>
        {charges.length === 0 ? (
          <Text style={styles.empty}>No extra charges yet.</Text>
        ) : (
          charges.map(charge => (
            <View key={charge.id} style={styles.chargeItem}>
              <Text style={styles.chargeName}>{charge.item}</Text>
              <Text style={styles.chargePrice}>₹{charge.unit_price}</Text>
            </View>
          ))
        )}
      </View>

      {/* Add Charge Modal */}
      <Modal visible={showChargeModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Purchase</Text>
            
            {/* Quick Add Buttons */}
            <View style={styles.quickAddRow}>
              {['Tea (₹20)', 'Water (₹20)', 'Laundry (₹50)'].map(q => {
                const name = q.split(' (')[0];
                const price = q.match(/\₹(\d+)/)?.[1] || '0';
                return (
                  <Pressable 
                    key={q} 
                    style={styles.quickChip} 
                    onPress={() => { setItem(name); setPrice(price); }}
                  >
                    <Text style={styles.quickChipText}>{q}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Item Name"
              value={item}
              onChangeText={setItem}
            />
            <TextInput
              style={styles.input}
              placeholder="Price"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />

            <View style={styles.modalBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowChargeModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={handleAddCharge}>
                <Text style={styles.submitBtnText}>Add Charge</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal visible={showPayModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Collect Payment</Text>
            <Text style={styles.balanceText}>Current Balance: ₹{balance}</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Amount to Collect"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
            />

            <View style={styles.payModeRow}>
              <Pressable 
                style={[styles.payModeBtn, payMode === 'cash' && styles.payModeActive]} 
                onPress={() => setPayMode('cash')}
              >
                <Text style={[styles.payModeText, payMode === 'cash' && styles.payModeTextActive]}>Cash</Text>
              </Pressable>
              <Pressable 
                style={[styles.payModeBtn, payMode === 'upi' && styles.payModeActive]} 
                onPress={() => setPayMode('upi')}
              >
                <Text style={[styles.payModeText, payMode === 'upi' && styles.payModeTextActive]}>UPI</Text>
              </Pressable>
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPayModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitBtn} onPress={handleCollectPayment}>
                <Text style={styles.submitBtnText}>Collect</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ID Photo Modal */}
      <Modal visible={!!photoUrl} animationType="fade" transparent={true} onRequestClose={() => setPhotoUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', top: 40, right: 20, zIndex: 1 }} onPress={() => setPhotoUrl(null)}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Close ✕</Text>
          </Pressable>
          {photoUrl && (
            <Image 
              source={{ uri: photoUrl }} 
              style={{ width: '100%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  guestName: { fontSize: 24, fontWeight: 'bold' },
  guestInfo: { color: '#64748b', marginTop: 4 },
  folioCard: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 12 },
  folioRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  folioLabel: { color: '#64748b' },
  folioValue: { fontWeight: '600' },
  folioTotal: { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 16 },
  folioTotalLabel: { fontWeight: 'bold', fontSize: 16 },
  folioTotalValue: { fontWeight: 'bold', fontSize: 18, color: '#2563eb' },
  btnRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  chargeBtn: { flex: 1, backgroundColor: '#f59e0b', padding: 16, borderRadius: 8, alignItems: 'center' },
  payBtn: { flex: 1, backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  empty: { color: '#94a3b8', fontStyle: 'italic' },
  chargeItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 8 },
  chargeName: { fontSize: 16 },
  chargePrice: { fontWeight: 'bold' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  quickAddRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  quickChipText: { fontSize: 12, color: '#64748b' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#64748b', fontWeight: 'bold' },
  submitBtn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#2563eb' },
  submitBtnText: { color: '#fff', fontWeight: 'bold' },
  balanceText: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  payModeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  payModeBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  payModeActive: { backgroundColor: '#2563eb' },
  payModeText: { color: '#64748b', fontWeight: '600' },
  payModeTextActive: { color: '#fff' }
});