import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet, ActivityIndicator, Modal, TextInput, Image, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/staff-context';
import { isOnline, saveToOutbox } from '@/lib/offline';
import * as Crypto from 'expo-crypto';
import { ScreenHeader } from '@/lib/screen-header';
import { exportGuestRegistrationCardPDF } from '@/lib/pdf-reports';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { openWhatsApp } from '@/lib/whatsapp';

export default function GuestDetailScreen() {
  const theme = useTheme();
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
  const [refunding, setRefunding] = useState(false);

  // Charge form state
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  
  // Payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('cash');

  const fetchDetails = useCallback(async () => {
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
  }, [id, stayId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

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
    setShowRefundModal(true);
  };

  const confirmRefund = async () => {
    if (!refundPaymentId || !refundReason.trim()) {
      return Alert.alert('Error', 'Reason is required');
    }
    setRefunding(true);
    const { error } = await supabase.rpc('refund_payment', {
      p_payment_id: refundPaymentId,
      p_staff_id: activeStaff?.id,
      p_reason: refundReason.trim()
    });
    setRefunding(false);
    if (error) return Alert.alert('Error', error.message);
    setShowRefundModal(false);
    setRefundPaymentId(null);
    setRefundReason('');
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

  const handleSendWhatsAppFolio = async () => {
    if (!guest?.phone) return Alert.alert('Missing Phone', 'Guest does not have a phone number on file.');
    const totalExtra = charges.reduce((sum, c) => sum + Number(c.unit_price) * (c.qty || 1), 0);
    const totalTariff = Number(stay?.amount || 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balanceDue = (totalTariff + totalExtra) - totalPaid;

    const folioMsg = [
      `🏨 *Stay Folio Update — LogStay Hospitality*`,
      `Hello ${guest.name},\n`,
      `🛏️ *Stay Reference:* ${stayId ? stayId.slice(0, 8) : 'Active'}`,
      `💵 *Room Tariff:* ₹${totalTariff.toFixed(2)}`,
      totalExtra > 0 ? `🧺 *Incidentals / Extras:* ₹${totalExtra.toFixed(2)}` : null,
      `💳 *Total Paid so far:* ₹${totalPaid.toFixed(2)}`,
      balanceDue > 0 ? `⚠️ *Current Balance Due:* ₹${balanceDue.toFixed(2)}` : `✅ *Status:* Fully Paid`,
      `\nNeed any assistance? Reply to this message or visit the front desk. Have a great day! ✨`
    ].filter(Boolean).join('\n');

    await openWhatsApp(guest.phone, folioMsg);
  };

  if (loading || !guest) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScreenHeader title="Guest Details" />
        <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title="Guest Details"
        subtitle={guest?.name || 'In-House'}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bg }]}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Guest Profile Hero Card */}
        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
              <Text style={[styles.avatarText, { color: theme.accentText }]}>
                {guest.name ? guest.name.charAt(0).toUpperCase() : 'G'}
              </Text>
            </View>
            <View style={styles.heroNameCol}>
              <Text style={[styles.guestName, { color: theme.text }]}>{guest.name}</Text>
              <View style={styles.badgesRow}>
                <View style={[styles.pillBadge, { backgroundColor: theme.surfaceSubtle }]}>
                  <Ionicons name="call-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.pillText, { color: theme.textSecondary }]}>{guest.phone || 'No phone'}</Text>
                </View>
                {guest.nationality ? (
                  <View style={[styles.pillBadge, { backgroundColor: '#eff6ff' }]}>
                    <Ionicons name="globe-outline" size={12} color="#2563eb" />
                    <Text style={[styles.pillText, { color: '#2563eb' }]}>{guest.nationality}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={[styles.idRow, { borderTopColor: theme.borderSubtle }]}>
            <View style={styles.idBadge}>
              <Ionicons name="card-outline" size={14} color={theme.accentText} />
              <Text style={[styles.idText, { color: theme.textSecondary }]}>
                {guest.id_type || 'ID'} ••••{guest.id_last4 || '----'}
              </Text>
            </View>

            {guest.id_photo_path && !guest.id_deleted_at ? (
              can('view_id_photo') && (
                <TouchableOpacity 
                  style={[styles.viewPhotoBtn, { backgroundColor: theme.accentSubtle, borderColor: theme.border }]} 
                  onPress={handleViewPhoto}
                  disabled={loadingPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={14} color={theme.accentText} />
                  <Text style={[styles.viewPhotoText, { color: theme.accentText }]}>
                    {loadingPhoto ? 'Loading...' : 'View ID Photo'}
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <Text style={[styles.photoStatusText, { color: theme.textTertiary }]}>
                {guest.id_deleted_at ? 'ID purged per retention' : 'No photo uploaded'}
              </Text>
            )}
          </View>

          {guest.id_photo_expires_at && !guest.id_deleted_at && (
            <Text style={[styles.retentionNotice, { color: theme.textTertiary }]}>
              Auto-purges on {new Date(guest.id_photo_expires_at).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Folio Financial Card */}
        <View style={[styles.folioCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.folioHeader, { borderBottomColor: theme.borderSubtle }]}>
            <Ionicons name="receipt-outline" size={19} color={theme.text} />
            <Text style={[styles.folioHeaderTitle, { color: theme.text }]}>Folio Summary</Text>
          </View>

          <View style={styles.folioRow}>
            <Text style={[styles.folioLabel, { color: theme.textSecondary }]}>Stay Room Rate</Text>
            <Text style={[styles.folioValue, { color: theme.text }]}>₹{Number(stay?.amount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.folioRow}>
            <Text style={[styles.folioLabel, { color: theme.textSecondary }]}>Extra Purchases / Services</Text>
            <Text style={[styles.folioValue, { color: theme.text }]}>+ ₹{Number(totalCharges).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.folioRow}>
            <Text style={[styles.folioLabel, { color: theme.textSecondary }]}>Total Amount Paid</Text>
            <Text style={[styles.folioValue, { color: theme.free }]}>- ₹{Number(totalPaid).toLocaleString('en-IN')}</Text>
          </View>

          {/* Balance Due Banner */}
          <View style={[
            styles.balanceBanner, 
            balance > 0 
              ? { backgroundColor: '#fef2f2', borderColor: '#fecaca' } 
              : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
          ]}>
            <View>
              <Text style={[styles.balanceBannerTitle, { color: balance > 0 ? '#dc2626' : '#16a34a' }]}>
                {balance > 0 ? 'Balance Pending' : 'Folio Settled'}
              </Text>
              <Text style={[styles.balanceBannerSub, { color: theme.textSecondary }]}>
                {balance > 0 ? 'Collect balance before checkout' : 'All charges paid in full'}
              </Text>
            </View>
            <Text style={[styles.balanceBannerAmount, { color: balance > 0 ? '#dc2626' : '#16a34a' }]}>
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
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: '#16a34a' }]} onPress={() => setShowPayModal(true)} activeOpacity={0.8}>
            <Ionicons name="cash-outline" size={18} color="#ffffff" />
            <Text style={styles.btnText}>Collect Payment</Text>
          </TouchableOpacity>
        </View>

        {/* GRC PDF Export Action */}
        <TouchableOpacity style={[styles.pdfBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={handleExportGRCPDF} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={17} color={theme.text} />
          <Text style={[styles.pdfBtnText, { color: theme.text }]}>Print / Share Registration Card (PDF)</Text>
        </TouchableOpacity>

        {/* WhatsApp Guest Concierge & Folio Action */}
        {Boolean(guest.phone) && (
          <TouchableOpacity
            style={[styles.pdfBtn, { backgroundColor: '#25D366', borderColor: '#1EBE5D', marginTop: 10 }]}
            onPress={handleSendWhatsAppFolio}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send folio to guest via WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={17} color="#ffffff" />
            <Text style={[styles.pdfBtnText, { color: '#ffffff', fontWeight: '700' }]}>
              Send Folio & Receipt via WhatsApp
            </Text>
          </TouchableOpacity>
        )}

        {/* Charges List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={17} color={theme.textSecondary} />
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Extra Purchases ({charges.length})</Text>
          </View>
          {charges.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.empty, { color: theme.textTertiary }]}>No extra charges added to folio.</Text>
            </View>
          ) : (
            charges.map(charge => (
              <View key={charge.id} style={[styles.chargeItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.chargeInfo}>
                  <Text style={[styles.chargeName, { color: theme.text }]}>{charge.item}</Text>
                  <Text style={[styles.chargeDate, { color: theme.textTertiary }]}>{new Date(charge.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={[styles.chargePrice, { color: theme.text }]}>+ ₹{Number(charge.unit_price).toLocaleString('en-IN')}</Text>
              </View>
            ))
          )}
        </View>

        {/* Payment History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet-outline" size={17} color={theme.textSecondary} />
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Payment Receipts ({payments.length})</Text>
          </View>
          {payments.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.empty, { color: theme.textTertiary }]}>No payments recorded yet.</Text>
            </View>
          ) : (
            payments.map(pay => (
              <View key={pay.id} style={[styles.chargeItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.chargeInfo}>
                  <View style={[styles.payModePill, { backgroundColor: theme.accentSubtle }]}>
                    <Text style={[styles.payModePillText, { color: theme.accent }]}>{pay.pay_mode?.toUpperCase() || 'CASH'}</Text>
                  </View>
                  <Text style={[styles.chargeDate, { color: theme.textTertiary }]}>{new Date(pay.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                  {pay.refunded && <Text style={styles.refundedTag}>REFUNDED</Text>}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[styles.chargePrice, { color: pay.refunded ? theme.textTertiary : theme.free }]}>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalContent, { backgroundColor: theme.surface }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Purchase</Text>
            
            {/* Quick Add Buttons */}
            <View style={styles.quickAddRow}>
              {['Tea (₹20)', 'Water (₹20)', 'Laundry (₹50)'].map(q => {
                const name = q.split(' (')[0];
                const price = q.match(/\₹(\d+)/)?.[1] || '0';
                return (
                  <Pressable 
                    key={q} 
                    style={[styles.quickChip, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]} 
                    onPress={() => { setItem(name); setPrice(price); }}
                  >
                    <Text style={[styles.quickChipText, { color: theme.text }]}>{q}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              placeholder="Item Name"
              placeholderTextColor={theme.textTertiary}
              value={item}
              onChangeText={setItem}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              placeholder="Price"
              placeholderTextColor={theme.textTertiary}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />

            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.cancelBtn, { backgroundColor: theme.surfaceSubtle }]} onPress={() => setShowChargeModal(false)}>
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.submitBtn, { backgroundColor: theme.accent }]} onPress={handleAddCharge}>
                <Text style={styles.submitBtnText}>Add Charge</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal visible={showPayModal} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalContent, { backgroundColor: theme.surface }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Collect Payment</Text>
            <Text style={[styles.balanceText, { color: theme.textSecondary }]}>Current Balance: ₹{balance}</Text>
            
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              placeholder="Amount to Collect"
              placeholderTextColor={theme.textTertiary}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
            />

            <View style={[styles.payModeRow, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Pressable 
                style={[styles.payModeBtn, payMode === 'cash' && [styles.payModeActive, { backgroundColor: theme.surface }]]} 
                onPress={() => setPayMode('cash')}
              >
                <Text style={[styles.payModeText, { color: theme.textSecondary }, payMode === 'cash' && [styles.payModeTextActive, { color: theme.text }]]}>Cash</Text>
              </Pressable>
              <Pressable 
                style={[styles.payModeBtn, payMode === 'upi' && [styles.payModeActive, { backgroundColor: theme.surface }]]} 
                onPress={() => setPayMode('upi')}
              >
                <Text style={[styles.payModeText, { color: theme.textSecondary }, payMode === 'upi' && [styles.payModeTextActive, { color: theme.text }]]}>UPI</Text>
              </Pressable>
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.cancelBtn, { backgroundColor: theme.surfaceSubtle }]} onPress={() => setShowPayModal(false)}>
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.submitBtn, { backgroundColor: theme.free }]} onPress={handleCollectPayment}>
                <Text style={styles.submitBtnText}>Collect</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Refund Modal */}
      <Modal visible={showRefundModal} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={[styles.modalContent, { backgroundColor: theme.surface }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Refund Payment</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
              Enter a reason for this refund (required). If this was a cash payment, it will deduct from the active shift cash drawer.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
              placeholder="Reason for refund (e.g. Overcharged, cancellation)"
              placeholderTextColor={theme.textTertiary}
              value={refundReason}
              onChangeText={setRefundReason}
            />
            <View style={styles.modalBtnRow}>
              <Pressable 
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceSubtle }]} 
                onPress={() => { setShowRefundModal(false); setRefundPaymentId(null); setRefundReason(''); }}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.submitBtn, { backgroundColor: '#dc2626' }]} 
                onPress={confirmRefund}
                disabled={refunding}
              >
                <Text style={styles.submitBtnText}>
                  {refunding ? 'Refunding...' : 'Confirm Refund'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ID Photo Modal */}
      <Modal visible={!!photoUrl} animationType="fade" transparent={true} onRequestClose={() => setPhotoUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', top: 40, right: 20, zIndex: 1 }} onPress={() => setPhotoUrl(null)}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Close ✕</Text>
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
    alignItems: 'center',
    backgroundColor: '#f8fafc'
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfdbfe'
  },
  avatarText: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    fontWeight: '800',
    color: '#2563eb'
  },
  heroNameCol: {
    flex: 1
  },
  guestName: {
    fontFamily: Fonts.serif,
    fontSize: 19,
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
    borderRadius: 6
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    color: '#475569',
    fontVariant: ['tabular-nums']
  },
  viewPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfdbfe'
  },
  viewPhotoText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 12
  },
  photoStatusText: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic'
  },
  retentionNotice: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8
  },
  folioCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  folioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9'
  },
  folioHeaderTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  folioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5
  },
  folioLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500'
  },
  folioValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    fontVariant: ['tabular-nums']
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth
  },
  balanceBannerTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  balanceBannerSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2
  },
  balanceBannerAmount: {
    fontFamily: Fonts.serif,
    fontSize: 21,
    fontWeight: '800',
    fontVariant: ['tabular-nums']
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  chargeBtn: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
  },
  payBtn: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    height: 46,
    borderRadius: 12,
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
    marginBottom: 8,
    paddingLeft: 2
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0'
  },
  empty: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic'
  },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 13,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
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
    color: '#0f172a'
  },
  chargeDate: {
    fontSize: 12,
    color: '#64748b',
    fontVariant: ['tabular-nums']
  },
  chargePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    fontVariant: ['tabular-nums']
  },
  payModePill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5
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
    backgroundColor: 'rgba(0,0,0,0.55)'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34
  },
  modalTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  quickChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0'
  },
  quickChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    marginBottom: 12,
    color: '#0f172a'
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9'
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14
  },
  submitBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  balanceText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 12
  },
  payModeRow: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  payModeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center'
  },
  payModeActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2
  },
  payModeText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13
  },
  payModeTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  }
});