// src/app/staff-login.tsx
// Legacy route fallback — Redirects directly to Home as PIN/role switcher has been retired.

import React from 'react';
import { Redirect } from 'expo-router';

export default function StaffLoginScreen() {
  return <Redirect href="/home" />;
}
