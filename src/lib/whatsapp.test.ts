import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeWhatsAppPhone,
  buildWelcomeKitMessage,
  buildCheckoutReceiptMessage,
  openWhatsApp,
} from './whatsapp';

const canOpenURLMock = vi.fn(async (_url: string) => true);
const openURLMock = vi.fn(async (_url: string) => {});
const alertMock = vi.fn((_title: string, _msg?: string) => {});

vi.mock('react-native', () => ({
  Linking: {
    canOpenURL: (url: string) => canOpenURLMock(url),
    openURL: (url: string) => openURLMock(url),
  },
  Alert: {
    alert: (title: string, msg?: string) => alertMock(title, msg),
  },
  Platform: { OS: 'ios' },
}));

describe('src/lib/whatsapp.ts (One-Tap WhatsApp Concierge & Digital Receipts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Phone Normalization', () => {
    it('normalizes standard 10-digit Indian numbers with +91 prefix', () => {
      expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
      expect(normalizeWhatsAppPhone(' 98765 43210 ')).toBe('919876543210');
      expect(normalizeWhatsAppPhone('98765-43210')).toBe('919876543210');
    });

    it('normalizes Indian numbers with leading 0', () => {
      expect(normalizeWhatsAppPhone('09876543210')).toBe('919876543210');
      expect(normalizeWhatsAppPhone('0 98765 43210')).toBe('919876543210');
    });

    it('normalizes Indian numbers with existing +91 prefix and symbols', () => {
      expect(normalizeWhatsAppPhone('+91 98765-43210')).toBe('919876543210');
      expect(normalizeWhatsAppPhone('+91 (987) 654-3210')).toBe('919876543210');
    });

    it('preserves international country codes correctly', () => {
      expect(normalizeWhatsAppPhone('+44 7123 456789')).toBe('447123456789'); // UK
      expect(normalizeWhatsAppPhone('+49 170 5550142')).toBe('491705550142'); // Germany
      expect(normalizeWhatsAppPhone('+1 (415) 555-2671')).toBe('14155552671'); // US
      expect(normalizeWhatsAppPhone('+977 9841234567')).toBe('9779841234567'); // Nepal
    });

    it('rejects invalid, short, non-numeric, or empty inputs by returning empty string', () => {
      expect(normalizeWhatsAppPhone('')).toBe('');
      expect(normalizeWhatsAppPhone(null)).toBe('');
      expect(normalizeWhatsAppPhone(undefined)).toBe('');
      expect(normalizeWhatsAppPhone('12345')).toBe(''); // Too short (< 8 digits)
      expect(normalizeWhatsAppPhone('abcdefghij')).toBe('');
      expect(normalizeWhatsAppPhone('123abc456')).toBe('');
    });
  });

  describe('Welcome Kit Message Generation', () => {
    it('builds full welcome kit with Wi-Fi, rules, and payment details', () => {
      const msg = buildWelcomeKitMessage({
        guestName: 'Aditya',
        propertyName: 'Sunset Palms Goa',
        unitLabel: 'Room 101',
        checkInDate: '2026-10-15',
        checkOutDate: '2026-10-18',
        amountPaid: 4500,
        payMode: 'upi',
        wifiSsid: 'SunsetPalms_Guest',
        wifiPassword: 'WelcomeToGoa2026',
        googleMapsUrl: 'https://maps.app.goo.gl/sunset',
        houseRules: 'Quiet hours 11 PM to 7 AM.',
      });

      expect(msg).toContain('Sunset Palms Goa');
      expect(msg).toContain('Aditya');
      expect(msg).toContain('Room 101');
      expect(msg).toContain('₹4500.00 (UPI)');
      expect(msg).toContain('SunsetPalms_Guest');
      expect(msg).toContain('WelcomeToGoa2026');
      expect(msg).toContain('https://maps.app.goo.gl/sunset');
      expect(msg).toContain('Quiet hours 11 PM to 7 AM.');
    });

    it('omits Wi-Fi, Google Maps, and house rules if not configured, never printing "null" or "undefined"', () => {
      const msg = buildWelcomeKitMessage({
        guestName: 'Alex',
        propertyName: 'Beach Hostel',
        unitLabel: 'Dorm Bed 4',
        amountPaid: 600,
        payMode: 'cash',
        wifiSsid: null,
        wifiPassword: null,
        googleMapsUrl: null,
        houseRules: null,
      });

      expect(msg).toContain('Beach Hostel');
      expect(msg).toContain('Alex');
      expect(msg).not.toContain('Guest Wi-Fi Details');
      expect(msg).not.toContain('Property Location');
      expect(msg).not.toContain('House Rules');
      expect(msg).not.toContain('undefined');
      expect(msg).not.toContain('null');
    });

    it('survives URL encoding without loss of Devanagari, symbols, or emojis', () => {
      const msg = buildWelcomeKitMessage({
        guestName: 'आदित्य',
        propertyName: 'गोवा विला 🌴',
        unitLabel: 'कमरा १०१',
        amountPaid: 1500,
        payMode: 'cash',
      });

      const encoded = encodeURIComponent(msg);
      expect(encoded).toContain('%0A'); // Newlines encoded
      const decoded = decodeURIComponent(encoded);
      expect(decoded).toBe(msg);
      expect(decoded).toContain('गोवा विला 🌴');
    });
  });

  describe('Checkout Receipt Message Generation', () => {
    it('builds official checkout receipt with duration, tariff, incidentals, and total settled', () => {
      const msg = buildCheckoutReceiptMessage({
        guestName: 'Sarah Jenkins',
        propertyName: 'Sunset Palms Goa',
        unitLabel: 'Private Suite 201',
        checkInDate: '2026-10-10',
        checkOutDate: '2026-10-15',
        tariffAmount: 12000,
        incidentalsAmount: 1500,
        totalPaid: 13500,
        googleReviewUrl: 'https://g.page/r/sunset/review',
      });

      expect(msg).toContain('Official Checkout Receipt — Sunset Palms Goa');
      expect(msg).toContain('Sarah Jenkins');
      expect(msg).toContain('Private Suite 201');
      expect(msg).toContain('2026-10-10 to 2026-10-15');
      expect(msg).toContain('₹12000.00');
      expect(msg).toContain('₹1500.00');
      expect(msg).toContain('₹13500.00 (PAID IN FULL)');
      expect(msg).toContain('https://g.page/r/sunset/review');
    });

    it('omits incidentals and review booster when not applicable', () => {
      const msg = buildCheckoutReceiptMessage({
        guestName: 'Mark',
        propertyName: 'Hostel',
        unitLabel: 'Bed 1',
        tariffAmount: 500,
        totalPaid: 500,
        incidentalsAmount: 0,
        googleReviewUrl: null,
      });

      expect(msg).not.toContain('Extras / Incidentals');
      expect(msg).not.toContain('5-star Google review');
      expect(msg).not.toContain('undefined');
      expect(msg).not.toContain('null');
    });
  });

  describe('Privacy & Security Boundary', () => {
    it('strictly guarantees NO guest ID, passport number, or photo path is ever in messages', () => {
      const welcome = buildWelcomeKitMessage({
        guestName: 'Guest',
        propertyName: 'Property',
        unitLabel: 'Room 1',
        amountPaid: 1000,
      });

      expect(welcome).not.toMatch(/passport/i);
      expect(welcome).not.toMatch(/aadhaar/i);
      expect(welcome).not.toMatch(/\.jpg|\.png/i);

      const receipt = buildCheckoutReceiptMessage({
        guestName: 'Guest',
        propertyName: 'Property',
        unitLabel: 'Room 1',
        tariffAmount: 1000,
        totalPaid: 1000,
      });

      expect(receipt).not.toMatch(/passport/i);
      expect(receipt).not.toMatch(/aadhaar/i);
      expect(receipt).not.toMatch(/\.jpg|\.png/i);
    });
  });

  describe('openWhatsApp Linking Dispatcher', () => {
    it('dispatches deep link when WhatsApp app is installed (canOpenURL is true)', async () => {
      canOpenURLMock.mockResolvedValueOnce(true);

      const res = await openWhatsApp('+91 98765 43210', 'Hello from LogStay!');

      expect(res).toBe(true);
      expect(canOpenURLMock).toHaveBeenCalledWith(expect.stringContaining('whatsapp://send?phone=919876543210'));
      expect(openURLMock).toHaveBeenCalledWith(expect.stringContaining('whatsapp://send?phone=919876543210'));
    });

    it('falls back to web link (wa.me) when native WhatsApp is not installed', async () => {
      canOpenURLMock.mockResolvedValueOnce(false);

      const res = await openWhatsApp('+91 98765 43210', 'Hello Web Fallback!');

      expect(res).toBe(true);
      expect(openURLMock).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/919876543210?text='));
    });

    it('alerts user and aborts if phone number is invalid', async () => {
      const res = await openWhatsApp('invalid-phone', 'Hello');

      expect(res).toBe(false);
      expect(alertMock).toHaveBeenCalledWith('Invalid Phone Number', expect.any(String));
      expect(openURLMock).not.toHaveBeenCalled();
    });

    it('catches thrown errors and shows alert if opening fails completely', async () => {
      canOpenURLMock.mockResolvedValueOnce(false);
      openURLMock.mockRejectedValue(new Error('Device has no browser or WhatsApp'));

      const res = await openWhatsApp('+91 98765 43210', 'Test error');

      expect(res).toBe(false);
      expect(alertMock).toHaveBeenCalledWith('Cannot Open WhatsApp', expect.stringContaining('Device has no browser'));
    });
  });
});
