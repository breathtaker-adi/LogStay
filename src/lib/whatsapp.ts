// src/lib/whatsapp.ts
// LogStay One-Tap WhatsApp Smart Concierge & Digital Receipts
// Zero-cost native URI deep linking (no paid SMS or Meta API gateways)

import { Linking, Alert } from 'react-native';

/**
 * Normalizes any domestic or international phone number for WhatsApp deep-linking.
 * - Strips whitespace, dashes, parens, and leading '+'
 * - Auto-prepends Indian country code (+91) for standard 10-digit mobile numbers
 * - Handles leading '0' prefix (e.g. 09822123456 -> 919822123456)
 */
export function normalizeWhatsAppPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    // Standard 10-digit Indian mobile number
    cleaned = `91${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    // Leading 0 domestic number
    cleaned = `91${cleaned.slice(1)}`;
  }
  // Sanity check: must be digits only and at least 8 digits
  if (/^\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

export interface WelcomeKitParams {
  guestName: string;
  propertyName: string;
  unitLabel: string;
  checkInDate?: string;
  checkOutDate?: string;
  amountPaid: number;
  payMode?: string | null;
  wifiSsid?: string | null;
  wifiPassword?: string | null;
  googleMapsUrl?: string | null;
  houseRules?: string | null;
}

/**
 * Builds the instant Welcome Kit & Digital Receipt message sent upon check-in.
 */
export function buildWelcomeKitMessage(p: WelcomeKitParams): string {
  const lines: string[] = [
    `🏨 *Welcome to ${p.propertyName}!*`,
    `Hello ${p.guestName || 'Guest'}, we are thrilled to host you! Here are your booking details:\n`,
    `🛏️ *Room / Bed:* ${p.unitLabel}`,
  ];

  if (p.checkInDate) {
    lines.push(`📅 *Check-In:* ${p.checkInDate}`);
  }
  if (p.checkOutDate) {
    lines.push(`📅 *Check-Out:* ${p.checkOutDate}`);
  }

  const payModeLabel = p.payMode ? p.payMode.toUpperCase() : 'SETTLED';
  lines.push(`💰 *Payment Received:* ₹${Number(p.amountPaid || 0).toFixed(2)} (${payModeLabel})`);

  if (p.wifiSsid || p.wifiPassword) {
    lines.push(`\n📶 *Guest Wi-Fi Details:*`);
    if (p.wifiSsid) lines.push(`• Network: *${p.wifiSsid}*`);
    if (p.wifiPassword) lines.push(`• Password: *${p.wifiPassword}*`);
  }

  if (p.googleMapsUrl) {
    lines.push(`\n📍 *Property Location:* ${p.googleMapsUrl}`);
  }

  if (p.houseRules) {
    lines.push(`\n📋 *House Rules & Timings:*\n${p.houseRules}`);
  }

  lines.push(`\nNeed anything during your stay? Just reply here or visit the front desk. Have a wonderful stay! ✨`);

  return lines.join('\n');
}

export interface CheckoutReceiptParams {
  guestName: string;
  propertyName: string;
  unitLabel: string;
  checkInDate?: string;
  checkOutDate?: string;
  tariffAmount: number;
  incidentalsAmount?: number;
  totalPaid: number;
  googleReviewUrl?: string | null;
}

/**
 * Builds the official Checkout Receipt & 5-Star Review Booster message sent upon checkout.
 */
export function buildCheckoutReceiptMessage(p: CheckoutReceiptParams): string {
  const lines: string[] = [
    `🧾 *Official Checkout Receipt — ${p.propertyName}*`,
    `Dear ${p.guestName || 'Guest'}, thank you for staying with us! Here is your finalized bill summary:\n`,
    `🛏️ *Room / Bed:* ${p.unitLabel}`,
  ];

  if (p.checkInDate && p.checkOutDate) {
    lines.push(`📅 *Stay Duration:* ${p.checkInDate} to ${p.checkOutDate}`);
  } else if (p.checkOutDate) {
    lines.push(`📅 *Departure:* ${p.checkOutDate}`);
  }

  lines.push(`💵 *Room Tariff:* ₹${Number(p.tariffAmount || 0).toFixed(2)}`);

  if (p.incidentalsAmount && p.incidentalsAmount > 0) {
    lines.push(`🧺 *Extras / Incidentals:* ₹${Number(p.incidentalsAmount).toFixed(2)}`);
  }

  lines.push(`💳 *Total Amount Settled:* ₹${Number(p.totalPaid || 0).toFixed(2)} (PAID IN FULL)`);

  if (p.googleReviewUrl) {
    lines.push(
      `\n⭐ *Loved your stay with us?*`,
      `Please take 30 seconds to drop us a quick 5-star Google review — it means the world to our team:`,
      `${p.googleReviewUrl}`
    );
  }

  lines.push(`\nSafe travels onward, and we look forward to welcoming you back again soon! 🌟`);

  return lines.join('\n');
}

/**
 * Dispatches the message via native WhatsApp URL scheme with web fallback.
 */
export async function openWhatsApp(phone: string, message: string): Promise<boolean> {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) {
    Alert.alert(
      'Invalid Phone Number',
      'The guest phone number is missing or invalid. Please check the guest record.'
    );
    return false;
  }

  const encoded = encodeURIComponent(message);
  const deepLink = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
  const webLink = `https://wa.me/${cleanPhone}?text=${encoded}`;

  try {
    const supported = await Linking.canOpenURL(deepLink);
    if (supported) {
      await Linking.openURL(deepLink);
      return true;
    } else {
      await Linking.openURL(webLink);
      return true;
    }
  } catch {
    try {
      await Linking.openURL(webLink);
      return true;
    } catch (e: any) {
      Alert.alert('Cannot Open WhatsApp', e.message || 'Could not launch WhatsApp.');
      return false;
    }
  }
}

