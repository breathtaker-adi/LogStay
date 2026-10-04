import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="home" />
      <Stack.Screen name="setup-property" />
      <Stack.Screen name="add-room" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="shift" />
      <Stack.Screen name="exports" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}