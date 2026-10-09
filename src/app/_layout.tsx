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
        <Stack.Screen name="exports" />
        <Stack.Screen name="form-c" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="add-staff" />
      </Stack>
      </StaffProvider>
    </ErrorBoundary>
  );
}