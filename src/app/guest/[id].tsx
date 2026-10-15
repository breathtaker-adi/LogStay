import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, ActivityIndicator, Modal, TextInput, Image, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, saveToOutbox } from '@/lib/offline';
import * as Crypto from 'expo-crypto';
import { ScreenHeader } from '@/lib/screen-header';
import { exportGuestRegistrationCardPDF } from '@/lib/pdf-reports';

export default function GuestDetailScreen() {
  const { id, stayId } = useLocalSearchParams<{ id: string; stayId: string }>();
  const { activeStaff, can } = useStaff();

  // RBAC Guard: Housekeeper cannot access guest folio and personal details
  useEffect(() => {
    if (activeStaff && !can('guests')) {
      Alert.alert(
        "Access Restricted",
        "Guest folios and identity records are restricted to Front Desk and Owners."
      );
      router.replace('/home');
    }
  }, [activeStaff, can]);
  
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<any>(null);
  const [stay, setStay] = useState<any>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  
  // Refund form state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [refunding, setRefunding] = useState(false);

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

    // Fetch Payments
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .eq('stay_id', stayId)
      .order('created_at', { ascending: false });
    setPayments(paymentsData || []);

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

      // 2. Write to Audit Log via secure RPC
      await supabase.rpc('log_photo_view', { p_guest_id: guest.id });
    } catch {
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
      const { error } = await supabase.rpc('add_stay_charge', {
        p_charge_id: chargeId,
        p_stay_id: stayId,
        p_item: item.trim(),
        p_qty: 1,
        p_unit_price: numPrice,
        p_paid: false,
        p_pay_mode: null,
        p_staff_id: activeStaff.id
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('add_charge', {
        id: chargeId,
        charge_id: chargeId,
        property_id: guest.property_id,
        stay_id: stayId,
        item: item.trim(),
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
    const paymentId = Crypto.randomUUID();

    if (await isOnline()) {
      const { error } = await supabase.rpc('record_payment', {
        p_payment_id: paymentId,
        p_stay_id: stayId,
        p_amount: numAmount,
        p_pay_mode: payMode,
        p_staff_id: activeStaff.id
      });
      if (error) return Alert.alert('Error', error.message);
    } else {
      await saveToOutbox('record_payment', {
        payment_id: paymentId,
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

  const handleRefund = (paymentId: string) => {
    setRefundPaymentId(paymentId);
    setRefundReason('');
    setOwnerPin('');
    setShowRefundModal(true);
  };

  const confirmRefund = async () => {
    if (!refundPaymentId || !refundReason.trim()) {
      return Alert.alert('Error', 'Reason is required');
    }
    if (!ownerPin.trim()) {
      return Alert.alert('Security', 'Owner PIN is required to authorize refunds.');
    }
    setRefunding(true);
    const { error } = await supabase.rpc('refund_payment', {
      p_payment_id: refundPaymentId,
      p_staff_id: activeStaff?.id,
      p_reason: refundReason.trim(),
      p_owner_pin: ownerPin.trim()
    });
    setRefunding(false);
    if (error) return Alert.alert('Error', error.message);
    setShowRefundModal(false);
    setRefundPaymentId(null);
    setRefundReason('');
    setOwnerPin('');
    Alert.alert('Success', 'Payment refunded.');
    fetchDetails();
  };

  const handleExportGRCPDF = async () => {
    if (!guest) return;
    try {
      await exportGuestRegistrationCardPDF({
        propertyName: 'LogStay Hospitality',
        guestName: guest.name,
        phone: guest.phone,
        nationality: guest.nationality || 'Indian',
        idType: guest.id_type || 'ID Card',
        idLast4: guest.id_last4,
        roomBed: 'Assigned Unit',
        checkInDate: stay?.check_in ? new Date(stay.check_in).toLocaleString('en-IN') : new Date().toLocaleString('en-IN'),
        amount: stay?.amount || 0,
        payMode: stay?.pay_mode || 'Cash',
      });
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Could not generate GRC PDF');
    }
  };

  if (loading || !guest) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <ScreenHeader title="Guest Details" />
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScreenHeader
        title="Guest Details"
        subtitle={guest?.name || 'In-House'}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Guest Profile Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {guest.name ? guest.name.charAt(0).toUpperCase() : 'G'}
              </Text>
            </View>
            <View style={styles.heroNameCol}>
              <Text style={styles.guestName}>{guest.name}</Text>
              <View style={styles.badgesRow}>
                <View style={styles.pillBadge}>
                  <Ionicons name="call-outline" size={12} color="#64748b" />
                  <Text style={styles.pillText}>{guest.phone || 'No phone'}</Text>
                </View>
                {guest.nationality ? (
                  <View style={[styles.pillBadge, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[styles.pillText, { color: '#92400e' }]}>🌐 {guest.nationality}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.idRow}>
            <View style={styles.idBadge}>
              <Ionicons name="card-outline" size={14} color="#2563eb" />
              <Text style={styles.idText}>
                {guest.id_type || 'ID'} ••••{guest.id_last4 || '----'}
              </Text>
            </View>

            {guest.id_photo_path && !guest.id_deleted_at ? (
              can('view_id_photo') && (
                <TouchableOpacity 
                  style={styles.viewPhotoBtn} 
                  onPress={handleViewPhoto}
                  disabled={loadingPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={14} color="#2563eb" />
                  <Text style={styles.viewPhotoText}>
                    {loadingPhoto ? 'Loading...' : 'View ID Photo'}
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <Text style={styles.photoStatusText}>
                {guest.id_deleted_at ? 'ID purged per retention' : 'No photo uploaded'}
              </Text>
            )}
          </View>

          {guest.id_photo_expires_at && !guest.id_deleted_at && (
            <Text style={styles.retentionNotice}>
              Auto-purges on {new Date(guest.id_photo_expires_at).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Folio Financial Card */}
        <View style={styles.folioCard}>
          <View style={styles.folioHeader}>
            <Ionicons name="receipt-outline" size={20} color="#0f172a" />
            <Text style={styles.folioHeaderTitle}>Folio Summary</Text>
          </View>

          <View style={styles.folioRow}>
            <Text style={styles.folioLabel}>Stay Room Rate</Text>
            <Text style={styles.folioValue}>₹{Number(stay?.amount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.folioRow}>
            <Text style={styles.folioLabel}>Extra Purchases / Services</Text>
            <Text style={styles.folioValue}>+ ₹{Number(totalCharges).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.folioRow}>
            <Text style={styles.folioLabel}>Total Amount Paid</Text>
            <Text style={[styles.folioValue, { color: '#16a34a' }]}>- ₹{Number(totalPaid).toLocaleString('en-IN')}</Text>
          </View>

          {/* Balance Due Banner */}
          <View style={[styles.balanceBanner, balance > 0 ? styles.balanceBannerDue : styles.balanceBannerSettled]}>
            <View>
              <Text style={[styles.balanceBannerTitle, balance > 0 ? styles.balanceTitleDue : styles.balanceTitleSettled]}>
                {balance > 0 ? 'Balance Pending' : 'Folio Settled'}
              </Text>
              <Text style={styles.balanceBannerSub}>
                {balance > 0 ? 'Collect balance before checkout' : 'All charges paid in full'}
              </Text>
            </View>
            <Text style={[styles.balanceBannerAmount, balance > 0 ? styles.balanceAmountDue : styles.balanceAmountSettled]}>
              ₹{Number(balance).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.chargeBtn} onPress={() => setShowChargeModal(true)} activeOpacity={0.8}>
            <Ionicons name="cart-outline" size={18} color="#ffffff" />
            <Text style={styles.btnText}>+ Add Purchase</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.payBtn} onPress={() => setShowPayModal(true)} activeOpacity={0.8}>
            <Ionicons name="cash-outline" size={18} color="#ffffff" />
            <Text style={styles.btnText}>Collect Payment</Text>
          </TouchableOpacity>
        </View>

        {/* GRC PDF Export Action */}
        <TouchableOpacity style={styles.pdfBtn} onPress={handleExportGRCPDF} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={17} color="#0f172a" />
          <Text style={styles.pdfBtnText}>Print / Share Registration Card (PDF)</Text>
        </TouchableOpacity>

        {/* Charges List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={18} color="#475569" />
            <Text style={styles.sectionTitle}>Extra Purchases ({charges.length})</Text>
          </View>
          {charges.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.empty}>No extra charges added to folio.</Text>
            </View>
          ) : (
            charges.map(charge => (
              <View key={charge.id} style={styles.chargeItem}>
                <View style={styles.chargeInfo}>
                  <Text style={styles.chargeName}>{charge.item}</Text>
                  <Text style={styles.chargeDate}>{new Date(charge.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={styles.chargePrice}>+ ₹{Number(charge.unit_price).toLocaleString('en-IN')}</Text>
              </View>
            ))
          )}
        </View>

        {/* Payment History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet-outline" size={18} color="#475569" />
            <Text style={styles.sectionTitle}>Payment Receipts ({payments.length})</Text>
          </View>
          {payments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.empty}>No payments recorded yet.</Text>
            </View>
          ) : (
            payments.map(pay => (
              <View key={pay.id} style={styles.chargeItem}>
                <View style={styles.chargeInfo}>
                  <View style={styles.payModePill}>
                    <Text style={styles.payModePillText}>{pay.pay_mode?.toUpperCase() || 'CASH'}</Text>
                  </View>
                  <Text style={styles.chargeDate}>{new Date(pay.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                  {pay.refunded && <Text style={styles.refundedTag}>REFUNDED</Text>}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[styles.chargePrice, { color: pay.refunded ? '#94a3b8' : '#16a34a' }]}>
                    - ₹{Number(pay.amount).toLocaleString('en-IN')}
                  </Text>
                  {!pay.refunded && can('refund_payment') && (
                    <TouchableOpacity 
                      style={styles.refundBtn} 
                      onPress={() => handleRefund(pay.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.refundBtnText}>Refund</Text>
                    </TouchableOpacity>
                  )}
                </View>
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

      {/* Refund Modal */}
      <Modal visible={showRefundModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Refund Payment</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>
              Enter a reason for this refund (required). If this was a cash payment, it will deduct from the active shift cash drawer.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Reason for refund (e.g. Overcharged, cancellation)"
              value={refundReason}
              onChangeText={setRefundReason}
            />
            <TextInput
              style={styles.input}
              placeholder="Owner PIN (Required to authorize)"
              value={ownerPin}
              onChangeText={setOwnerPin}
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
            />
            <View style={styles.modalBtnRow}>
              <Pressable 
                style={styles.cancelBtn} 
                onPress={() => { setShowRefundModal(false); setRefundPaymentId(null); setRefundReason(''); setOwnerPin(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.submitBtn, { backgroundColor: '#ef4444' }]} 
                onPress={confirmRefund}
                disabled={refunding}
              >
                <Text style={styles.submitBtnText}>
                  {refunding ? 'Refunding...' : 'Confirm Refund'}
                </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1.5,
    borderColor: '#bfdbfe'
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2563eb'
  },
  heroNameCol: {
    flex: 1
  },
  guestName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap'
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  pillText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  idText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  viewPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe'
  },
  viewPhotoText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 12
  },
  photoStatusText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic'
  },
  retentionNotice: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 8
  },
  folioCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  folioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  folioHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  folioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6
  },
  folioLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500'
  },
  folioValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 14,
    borderRadius: 14
  },
  balanceBannerDue: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  balanceBannerSettled: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  balanceBannerTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  balanceTitleDue: {
    color: '#991b1b'
  },
  balanceTitleSettled: {
    color: '#166534'
  },
  balanceBannerSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  balanceBannerAmount: {
    fontSize: 20,
    fontWeight: '800'
  },
  balanceAmountDue: {
    color: '#dc2626'
  },
  balanceAmountSettled: {
    color: '#16a34a'
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  chargeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#d97706',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 16
  },
  pdfBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13.5
  },
  section: {
    marginBottom: 16
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingLeft: 4
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155'
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  empty: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic'
  },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  },
  chargeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  chargeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b'
  },
  chargeDate: {
    fontSize: 12,
    color: '#94a3b8'
  },
  chargePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  payModePill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  payModePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb'
  },
  refundedTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  refundBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  refundBtnText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.5)'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 16
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  quickChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  quickChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    marginBottom: 12,
    color: '#0f172a'
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  balanceText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 14
  },
  payModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  payModeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  payModeActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  payModeText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 13
  },
  payModeTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  }
});