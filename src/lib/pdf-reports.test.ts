import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeHtml,
  buildGRCHtml,
  buildShiftReportHtml,
  buildDailyRegisterHtml,
  exportGuestRegistrationCardPDF,
  exportShiftReportPDF,
  exportDailyRegisterPDF,
  GRCData,
  ShiftReportData,
  DailyRegisterData,
} from './pdf-reports';

const printToFileAsyncMock = vi.fn(async ({ html }: { html: string }) => ({
  uri: 'file://mock/print/output.pdf',
  numberOfPages: 1,
}));

const isAvailableAsyncMock = vi.fn(async () => true);
const shareAsyncMock = vi.fn(async (_uri: string, _opts?: any) => {});

vi.mock('expo-print', () => ({
  printToFileAsync: (args: any) => printToFileAsyncMock(args),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsyncMock(),
  shareAsync: (uri: string, opts: any) => shareAsyncMock(uri, opts),
}));

describe('src/lib/pdf-reports.ts (Offline PDF Generation & Statutory Registers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HTML Escaping & Sanitization (XSS Prevention)', () => {
    it('escapes &, <, >, ", and single quotes', () => {
      expect(escapeHtml('Salt & Pepper')).toBe('Salt &amp; Pepper');
      expect(escapeHtml('<script>alert("hack")</script>')).toBe(
        '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml("O'Connor")).toBe('O&#039;Connor');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('Guest Registration Card (GRC) Template', () => {
    const sampleGRC: GRCData = {
      propertyName: 'Sunset Palms Goa',
      propertyAddress: 'Anjuna Beach Road, Goa',
      guestName: 'Aditya Sharma',
      phone: '+91 98765 43210',
      nationality: 'India',
      idType: 'Aadhaar Card',
      idLast4: '5678',
      roomBed: 'Room 101',
      checkInDate: '2026-10-15 14:00',
      checkOutDate: '2026-10-18 11:00',
      amount: 4500,
      payMode: 'cash',
    };

    it('renders guest name, property, masked ID, dates, and signature lines', () => {
      const html = buildGRCHtml(sampleGRC);

      expect(html).toContain('Sunset Palms Goa');
      expect(html).toContain('Aditya Sharma');
      expect(html).toContain('+91 98765 43210');
      expect(html).toContain('XXXX-XXXX-5678');
      expect(html).toContain('Room 101');
      expect(html).toContain('₹4,500');
      expect(html).toContain('GUEST REGISTRATION CARD (GRC)');
      expect(html).toContain('Guest Signature');
      expect(html).toContain('Authorized Front Desk / Duty Manager');
    });

    it('sanitizes malicious script injections in guest name', () => {
      const maliciousGRC: GRCData = {
        ...sampleGRC,
        guestName: '<script>alert("xss")</script>',
        propertyName: '<img src=x onerror=alert(1)>',
      };

      const html = buildGRCHtml(maliciousGRC);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('includes Foreign National Form C section only for non-Indian guests with passport info', () => {
      const foreignGRC: GRCData = {
        ...sampleGRC,
        guestName: 'John Doe',
        nationality: 'United States',
        passportNo: 'P12345678',
        visaNo: 'V887766',
        arrivedFrom: 'New York',
        nextDest: 'Jaipur',
      };

      const html = buildGRCHtml(foreignGRC);
      expect(html).toContain('Foreign National Particulars (Form C)');
      expect(html).toContain('P12345678');
      expect(html).toContain('V887766');
      expect(html).toContain('New York');
      expect(html).toContain('Jaipur');
    });

    it('excludes Form C section for domestic Indian guests', () => {
      const html = buildGRCHtml(sampleGRC);
      expect(html).not.toContain('Foreign National Particulars (Form C)');
    });
  });

  describe('Shift Cash Report Template', () => {
    const balancedShift: ShiftReportData = {
      propertyName: 'Sunset Palms Goa',
      shiftId: 'shift_abc123xyz',
      staffName: 'Rahul Desk',
      openedAt: '2026-10-15T08:00:00+05:30',
      closedAt: '2026-10-15T16:00:00+05:30',
      openingCash: 2000,
      cashCollected: 5000,
      upiCollected: 3000,
      pettyExpenses: 500,
      expectedDrawer: 6500,
      countedCash: 6500,
      variance: 0,
      notes: 'All drawers reconciled with zero discrepancy.',
    };

    it('renders exact cash totals, opening float, and balanced indicator', () => {
      const html = buildShiftReportHtml(balancedShift);

      expect(html).toContain('FRONT DESK SHIFT CASH &amp; TURNOVER REPORT');
      expect(html).toContain('Rahul Desk');
      expect(html).toContain('₹2000.00'); // Opening
      expect(html).toContain('+ ₹5000.00'); // Cash collected
      expect(html).toContain('(₹3000.00)'); // UPI
      expect(html).toContain('- ₹5000.00'.replace('5000', '500')); // Petty cash
      expect(html).toContain('₹6500.00'); // Expected
      expect(html).toContain('BALANCED');
    });

    it('flags cash shortage correctly', () => {
      const shortageShift: ShiftReportData = {
        ...balancedShift,
        countedCash: 6300,
        variance: -200,
      };

      const html = buildShiftReportHtml(shortageShift);
      expect(html).toContain('SHORTAGE');
      expect(html).toContain('badge-bad');
      expect(html).toContain('-₹200.00');
    });

    it('flags cash surplus correctly', () => {
      const surplusShift: ShiftReportData = {
        ...balancedShift,
        countedCash: 6700,
        variance: 200,
      };

      const html = buildShiftReportHtml(surplusShift);
      expect(html).toContain('SURPLUS');
      expect(html).toContain('badge-bad');
      expect(html).toContain('+₹200.00');
    });

    it('renders operational anomaly flags section only when flags are present', () => {
      const shiftWithAnomalies: ShiftReportData = {
        ...balancedShift,
        anomalies: [
          'Cash drawer shortage ₹200 exceeds acceptable tolerance',
          'Petty cash spike of ₹1,500 detected on single voucher',
        ],
      };

      const html = buildShiftReportHtml(shiftWithAnomalies);
      expect(html).toContain('Operational Anomaly Flags:');
      expect(html).toContain('Cash drawer shortage ₹200 exceeds acceptable tolerance');
      expect(html).toContain('Petty cash spike of ₹1,500 detected on single voucher');

      const htmlNoAnomalies = buildShiftReportHtml(balancedShift);
      expect(htmlNoAnomalies).not.toContain('Operational Anomaly Flags:');
    });
  });

  describe('Daily Statutory Police Register Template', () => {
    const registerData: DailyRegisterData = {
      propertyName: 'Sunset Palms Goa',
      reportDate: '15-Oct-2026',
      totalGuests: 2,
      domesticCount: 1,
      foreignCount: 1,
      rows: [
        {
          sNo: 1,
          roomBed: '101',
          guestName: 'Amit Shah',
          nationality: 'India',
          phone: '+91 9876543210',
          idType: 'Driving Licence',
          idLast4: '4321',
          checkInTime: '10:30 AM',
          status: 'Checked In',
        },
        {
          sNo: 2,
          roomBed: 'Dorm 201-A',
          guestName: 'Emma Watson',
          nationality: 'United Kingdom',
          phone: '+44 7123456789',
          idType: 'Passport',
          idLast4: '9988',
          checkInTime: '01:15 PM',
          status: 'Checked In',
        },
      ],
    };

    it('renders sequential rows, masked ID numbers, and summary counts', () => {
      const html = buildDailyRegisterHtml(registerData);

      expect(html).toContain('DAILY GUEST REGISTER (STATUTORY INSPECTION RECORD)');
      expect(html).toContain('Total In-House Guests:</b> 2');
      expect(html).toContain('Domestic Guests:</b> 1');
      expect(html).toContain('Foreign Nationals (Form C):</b> 1');
      expect(html).toContain('Amit Shah');
      expect(html).toContain('...4321');
      expect(html).toContain('Emma Watson');
      expect(html).toContain('...9988');
    });

    it('renders empty message when no stays exist for the day', () => {
      const emptyData: DailyRegisterData = {
        propertyName: 'Sunset Palms Goa',
        reportDate: '15-Oct-2026',
        totalGuests: 0,
        domesticCount: 0,
        foreignCount: 0,
        rows: [],
      };

      const html = buildDailyRegisterHtml(emptyData);
      expect(html).toContain('No registered stays recorded for this period.');
    });

    it('never contains photo URLs, passwords, or full ID numbers in any register table', () => {
      const html = buildDailyRegisterHtml(registerData);
      expect(html).not.toContain('.jpg');
      expect(html).not.toContain('.png');
      expect(html).not.toContain('password');
      expect(html).not.toContain('secret');
    });
  });

  describe('Integration with Print and Sharing Drivers', () => {
    it('exportGuestRegistrationCardPDF generates HTML and invokes Print & Sharing', async () => {
      await exportGuestRegistrationCardPDF({
        propertyName: 'Test Hotel',
        guestName: 'Test Guest',
        nationality: 'India',
        idType: 'Passport',
        roomBed: '101',
        checkInDate: '2026-10-15',
        amount: 1000,
        payMode: 'cash',
      });

      expect(printToFileAsyncMock).toHaveBeenCalledTimes(1);
      expect(shareAsyncMock).toHaveBeenCalledWith('file://mock/print/output.pdf', expect.anything());
    });

    it('exportShiftReportPDF generates HTML and invokes Print & Sharing', async () => {
      await exportShiftReportPDF({
        propertyName: 'Test Hotel',
        shiftId: 's1',
        staffName: 'Staff 1',
        openedAt: '2026-10-15T08:00:00Z',
        openingCash: 1000,
        cashCollected: 1000,
        upiCollected: 0,
        pettyExpenses: 0,
        expectedDrawer: 2000,
        countedCash: 2000,
        variance: 0,
      });

      expect(printToFileAsyncMock).toHaveBeenCalledTimes(1);
      expect(shareAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('exportDailyRegisterPDF generates HTML and invokes Print & Sharing', async () => {
      await exportDailyRegisterPDF({
        propertyName: 'Test Hotel',
        reportDate: '2026-10-15',
        totalGuests: 0,
        domesticCount: 0,
        foreignCount: 0,
        rows: [],
      });

      expect(printToFileAsyncMock).toHaveBeenCalledTimes(1);
      expect(shareAsyncMock).toHaveBeenCalledTimes(1);
    });
  });
});
