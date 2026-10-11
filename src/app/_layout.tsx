import { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import ErrorBoundary from './ErrorBoundary';
import { StaffProvider } from '@/lib/staff-context';
import { supabase } from '@/lib/supabase';
import PaywallScreen from './paywall';

import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const [paid, setPaid] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) {
          setPaid(true); // Let unauthenticated users access login screen
          return;
        }

        const { data: member, error: memberErr } = await supabase
          .from('members')
          .select('property_id')
          .eq('user_id', sessionData.session.user.id)
          .single();

        if (memberErr) throw memberErr;

        if (member) {
          const { data: prop, error: propErr } = await supabase
            .from('properties')
            .select('paid_until')
            .eq('id', member.property_id)
            .single();

          if (propErr) throw propErr;
            
          if (prop?.paid_until) {
            const isValid = new Date(prop.paid_until) > new Date();
            setPaid(isValid);
            if (isValid) {
              await AsyncStorage.setItem('sub_last_online_check', Date.now().toString());
              await AsyncStorage.setItem('sub_cached_paid_until', prop.paid_until);
            }
          } else {
            setPaid(false); // Block if no date set
          }
        } else {
          setPaid(true); // Let new user setup property
        }
      } catch {
        // OWASP A04: Offline grace limit (maximum 7 days allowed without online check)
        // Edge case: null cachedPaidUntil or null lastCheckStr = never verified online -> block immediately
        try {
          const lastCheckStr = await AsyncStorage.getItem('sub_last_online_check');
          const cachedPaidUntil = await AsyncStorage.getItem('sub_cached_paid_until');
          const MAX_OFFLINE_DAYS = 7;

          if (!cachedPaidUntil || !lastCheckStr) {
            setPaid(false); // Fresh install in airplane mode / never verified online -> block immediately
          } else if (new Date(cachedPaidUntil) <= new Date()) {
            setPaid(false); // Subscription expired
          } else {
            const daysOffline = (Date.now() - parseInt(lastCheckStr, 10)) / (1000 * 60 * 60 * 24);
            setPaid(daysOffline <= MAX_OFFLINE_DAYS);
          }
        } catch {
          setPaid(false);
        }
      }
    };
    checkSubscription();
  }, []);

  if (paid === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!paid) {
    return <PaywallScreen />;
  }

  return (
    <ErrorBoundary>
      <StaffProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="staff-login" />
        <Stack.Screen name="home" />
        <Stack.Screen name="setup-property" />
        <Stack.Screen name="add-room" />
        <Stack.Screen name="checkin" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="shift" />
        <Stack.Screen name="exports" />
        <Stack.Screen name="form-c" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="add-staff" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="outbox" />
        <Stack.Screen name="audit-log" />
        <Stack.Screen name="digest" />
      </Stack>
      </StaffProvider>
    </ErrorBoundary>
  );
}