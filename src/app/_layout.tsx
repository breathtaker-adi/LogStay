import React from "react";
import { Stack } from "expo-router";
import ErrorBoundary from './ErrorBoundary';
import { StaffProvider } from '@/lib/staff-context';

export default function RootLayout() {
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
          <Stack.Screen name="guests" />
          <Stack.Screen name="guest/[id]" />
          <Stack.Screen name="room/[id]" />
          <Stack.Screen name="dorm/[roomId]" />
          <Stack.Screen name="rooms" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="exports" />
          <Stack.Screen name="form-c" />
          <Stack.Screen name="digest" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="audit-log" />
          <Stack.Screen name="outbox" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="add-staff" />
        </Stack>
      </StaffProvider>
    </ErrorBoundary>
  );
}