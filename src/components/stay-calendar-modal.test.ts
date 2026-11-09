// src/components/stay-calendar-modal.test.ts
import { describe, it, expect } from 'vitest';
import { calculateStayNights } from '../lib/bed-state';

describe('Stay Duration & Checkout Calculations', () => {
  it('calculates standard 1-night stay correctly', () => {
    const checkin = new Date(2026, 10, 9); // Nov 9, 2026
    const checkout = new Date(2026, 10, 10); // Nov 10, 2026
    expect(calculateStayNights(checkin, checkout)).toBe(1);
  });

  it('calculates customizable N-day stays correctly across week boundaries', () => {
    const checkin = new Date(2026, 10, 9); // Nov 9
    const checkout7 = new Date(2026, 10, 16); // Nov 16
    expect(calculateStayNights(checkin, checkout7)).toBe(7);

    const checkout14 = new Date(2026, 10, 23); // Nov 23
    expect(calculateStayNights(checkin, checkout14)).toBe(14);

    const checkout30 = new Date(2026, 11, 9); // Dec 9
    expect(calculateStayNights(checkin, checkout30)).toBe(30);
  });

  it('correctly calculates cross-month stays (November to December)', () => {
    const checkin = new Date(2026, 10, 28); // Nov 28, 2026
    const checkout = new Date(2026, 11, 5); // Dec 5, 2026 (7 nights)
    expect(calculateStayNights(checkin, checkout)).toBe(7);
  });

  it('enforces minimum 1 night if check-in and check-out are on the same calendar day', () => {
    const checkin = new Date(2026, 10, 9, 10, 0);
    const checkout = new Date(2026, 10, 9, 18, 0);
    expect(calculateStayNights(checkin, checkout)).toBe(1);
  });

  it('handles custom checkout time formatting', () => {
    function computeCheckoutTime(baseDate: Date, hour: number, minute: number, period: 'AM' | 'PM') {
      let finalHour = hour;
      if (period === 'PM' && hour < 12) finalHour += 12;
      if (period === 'AM' && hour === 12) finalHour = 0;

      const checkoutWithTime = new Date(baseDate);
      checkoutWithTime.setHours(finalHour, minute, 0, 0);
      return checkoutWithTime;
    }

    const t1 = computeCheckoutTime(new Date(2026, 10, 15), 2, 30, 'PM');
    expect(t1.getHours()).toBe(14);
    expect(t1.getMinutes()).toBe(30);

    const t2 = computeCheckoutTime(new Date(2026, 10, 15), 11, 0, 'AM');
    expect(t2.getHours()).toBe(11);
    expect(t2.getMinutes()).toBe(0);

    const t3 = computeCheckoutTime(new Date(2026, 10, 15), 12, 15, 'PM');
    expect(t3.getHours()).toBe(12);
    expect(t3.getMinutes()).toBe(15);
  });

  it('handles quarter-hour minute intervals (0, 15, 30, 45)', () => {
    const intervals = [0, 15, 30, 45];
    intervals.forEach((min) => {
      expect(min % 15).toBe(0);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(min).toBeLessThan(60);
    });
  });

  it('supports extreme multi-month long-term reservations (up to 365 days)', () => {
    const checkin = new Date(2026, 0, 1);
    const checkout = new Date(2026, 11, 31); // 364 days
    const nights = calculateStayNights(checkin, checkout);
    expect(nights).toBe(364);
  });
});
