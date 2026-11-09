// src/components/stay-calendar-modal.tsx
// Apple HIG-compliant Calendar & Checkout Date/Time Picker Modal
// Supports customizable N-day stay durations, interactive calendar grid, and quarter-hour time selection

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { calculateStayNights } from '@/lib/bed-state';

export interface StayCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  checkinDate?: Date;
  initialCheckoutDate?: Date;
  initialNights?: number;
  onApply: (checkoutDate: Date, nights: number) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESET_NIGHTS = [1, 2, 3, 5, 7, 14, 30];
const MINUTES_INTERVALS = [0, 15, 30, 45];
const QUICK_TIMES = [
  { label: '10:00 AM', hours: 10, minutes: 0, period: 'AM' as const, tag: 'Early' },
  { label: '11:00 AM', hours: 11, minutes: 0, period: 'AM' as const, tag: 'Standard' },
  { label: '12:00 PM', hours: 12, minutes: 0, period: 'PM' as const, tag: 'Noon' },
  { label: '02:00 PM', hours: 2, minutes: 0, period: 'PM' as const, tag: 'Late' },
];

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function startOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
}

export function StayCalendarModal({
  visible,
  onClose,
  checkinDate = new Date(),
  initialCheckoutDate,
  initialNights = 1,
  onApply,
}: StayCalendarModalProps) {
  const theme = useTheme();

  // Normalized checkin day (00:00)
  const normalizedCheckin = useMemo(() => startOfDay(checkinDate), [checkinDate]);

  // Selected checkout date (Date object)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialCheckoutDate) return startOfDay(initialCheckoutDate);
    const d = new Date(normalizedCheckin);
    d.setDate(d.getDate() + Math.max(1, initialNights));
    return d;
  });

  // Calendar browsing month
  const [activeMonth, setActiveMonth] = useState<Date>(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  // Time picker state
  const [hour, setHour] = useState<number>(() => {
    if (initialCheckoutDate) {
      const h = initialCheckoutDate.getHours();
      return h === 0 ? 12 : h > 12 ? h - 12 : h;
    }
    return 11;
  });

  const [minute, setMinute] = useState<number>(() => {
    if (initialCheckoutDate) {
      const m = initialCheckoutDate.getMinutes();
      // Round to closest 15
      return Math.round(m / 15) * 15 % 60;
    }
    return 0;
  });

  const [period, setPeriod] = useState<'AM' | 'PM'>(() => {
    if (initialCheckoutDate) {
      return initialCheckoutDate.getHours() >= 12 ? 'PM' : 'AM';
    }
    return 'AM';
  });

  // Nights count derived from selectedDate and checkinDate
  const currentNights = useMemo(() => {
    return calculateStayNights(normalizedCheckin, selectedDate);
  }, [normalizedCheckin, selectedDate]);

  const [customNightsText, setCustomNightsText] = useState<string>(currentNights.toString());

  // Reset/sync when opening modal
  useEffect(() => {
    if (visible) {
      const initDate = initialCheckoutDate
        ? startOfDay(initialCheckoutDate)
        : (() => {
            const d = new Date(normalizedCheckin);
            d.setDate(d.getDate() + Math.max(1, initialNights));
            return d;
          })();
      setSelectedDate(initDate);
      setActiveMonth(new Date(initDate.getFullYear(), initDate.getMonth(), 1));

      const nightsCount = calculateStayNights(normalizedCheckin, initDate);
      setCustomNightsText(nightsCount.toString());

      if (initialCheckoutDate) {
        const rawH = initialCheckoutDate.getHours();
        setHour(rawH === 0 ? 12 : rawH > 12 ? rawH - 12 : rawH);
        setMinute(Math.round(initialCheckoutDate.getMinutes() / 15) * 15 % 60);
        setPeriod(rawH >= 12 ? 'PM' : 'AM');
      }
    }
  }, [visible, initialCheckoutDate, initialNights, normalizedCheckin]);

  // Adjust nights directly (stepper or preset)
  const setNightsDirect = useCallback(
    (n: number) => {
      const validNights = Math.max(1, Math.min(365, n));
      const nextDate = new Date(normalizedCheckin);
      nextDate.setDate(nextDate.getDate() + validNights);
      setSelectedDate(nextDate);
      setActiveMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
      setCustomNightsText(validNights.toString());
    },
    [normalizedCheckin]
  );

  // Month navigation
  const prevMonth = useCallback(() => {
    setActiveMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      // Don't allow navigating before checkin month
      const checkinMonthStart = new Date(normalizedCheckin.getFullYear(), normalizedCheckin.getMonth(), 1);
      if (next < checkinMonthStart) return prev;
      return next;
    });
  }, [normalizedCheckin]);

  const nextMonth = useCallback(() => {
    setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const canGoPrevMonth = useMemo(() => {
    const currentViewStart = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
    const checkinMonthStart = new Date(normalizedCheckin.getFullYear(), normalizedCheckin.getMonth(), 1);
    return currentViewStart > checkinMonthStart;
  }, [activeMonth, normalizedCheckin]);

  // Generate calendar days matrix
  const calendarDays = useMemo(() => {
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: {
      date: Date | null;
      dayNumber: number;
      isPast: boolean;
      isCheckin: boolean;
      isCheckout: boolean;
      isInRange: boolean;
    }[] = [];

    // Leading padding for blank days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({
        date: null,
        dayNumber: 0,
        isPast: false,
        isCheckin: false,
        isCheckout: false,
        isInRange: false,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const cellDate = new Date(year, month, d);
      const isPast = cellDate < normalizedCheckin;
      const isCheckin = isSameDay(cellDate, normalizedCheckin);
      const isCheckout = isSameDay(cellDate, selectedDate);
      const isInRange = cellDate > normalizedCheckin && cellDate < selectedDate;

      days.push({
        date: cellDate,
        dayNumber: d,
        isPast,
        isCheckin,
        isCheckout,
        isInRange,
      });
    }

    return days;
  }, [activeMonth, normalizedCheckin, selectedDate]);

  // Date selection click handler
  const handleDayPress = (cellDate: Date) => {
    if (cellDate <= normalizedCheckin) return; // Checkout must be after check-in
    setSelectedDate(cellDate);
    const n = calculateStayNights(normalizedCheckin, cellDate);
    setCustomNightsText(n.toString());
  };

  // Build final DateTime and apply
  const handleApply = () => {
    let finalHour = hour;
    if (period === 'PM' && hour < 12) finalHour += 12;
    if (period === 'AM' && hour === 12) finalHour = 0;

    const finalCheckout = new Date(selectedDate);
    finalCheckout.setHours(finalHour, minute, 0, 0);

    onApply(finalCheckout, currentNights);
    onClose();
  };

  const monthTitle = activeMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        {/* Apple Modal Header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderSubtle }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.headerCancelText, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Stay &amp; Checkout</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {currentNights} Night{currentNights > 1 ? 's' : ''} Stay
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleApply}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.headerDoneBtn, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Apply checkout date and time"
          >
            <Text style={styles.headerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 1. STAY SUMMARY STRIP (Apple Inset Card) ──────────────── */}
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.summaryCol}>
              <View style={styles.summaryBadgeRow}>
                <Ionicons name="log-in-outline" size={14} color={theme.free} />
                <Text style={[styles.summaryBadgeLabel, { color: theme.free }]}>CHECK-IN</Text>
              </View>
              <Text style={[styles.summaryDatePrimary, { color: theme.text }]}>
                {normalizedCheckin.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={[styles.summaryDateSecondary, { color: theme.textSecondary }]}>
                {normalizedCheckin.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric' })}
              </Text>
            </View>

            <View style={styles.summaryDividerContainer}>
              <View style={[styles.nightsDurationBadge, { backgroundColor: theme.accentSubtle, borderColor: theme.accent }]}>
                <Text style={[styles.nightsDurationText, { color: theme.accent }]}>
                  {currentNights} {currentNights === 1 ? 'Night' : 'Nights'}
                </Text>
              </View>
              <View style={[styles.arrowLine, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.summaryCol}>
              <View style={styles.summaryBadgeRow}>
                <Ionicons name="log-out-outline" size={14} color={theme.accent} />
                <Text style={[styles.summaryBadgeLabel, { color: theme.accent }]}>CHECK-OUT</Text>
              </View>
              <Text style={[styles.summaryDatePrimary, { color: theme.text }]}>
                {selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={[styles.summaryDateSecondary, { color: theme.textSecondary }]}>
                {selectedDate.toLocaleDateString('en-IN', { weekday: 'short' })} · {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')} {period}
              </Text>
            </View>
          </View>

          {/* ── 2. QUICK DURATION PRESETS & STEPPER ─────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CUSTOM STAY DURATION</Text>
              <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>Select or type any days</Text>
            </View>

            {/* Quick Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
              {PRESET_NIGHTS.map((n) => {
                const isActive = currentNights === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.presetPill,
                      {
                        backgroundColor: isActive ? theme.accent : theme.surfaceSubtle,
                        borderColor: isActive ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setNightsDirect(n)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} nights`}
                  >
                    <Text
                      style={[
                        styles.presetPillText,
                        { color: isActive ? '#ffffff' : theme.text },
                        isActive && styles.presetPillTextActive,
                      ]}
                    >
                      {n}N
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Stepper & Direct N-Days Numeric Input */}
            <View style={[styles.stepperWrapper, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setNightsDirect(currentNights - 1)}
                disabled={currentNights <= 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Decrease nights by 1"
              >
                <Ionicons name="remove" size={18} color={currentNights <= 1 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>

              <View style={styles.stepperCenter}>
                <TextInput
                  style={[styles.stepperInput, { color: theme.text }]}
                  value={customNightsText}
                  onChangeText={(val) => {
                    const clean = val.replace(/[^0-9]/g, '');
                    setCustomNightsText(clean);
                    const parsed = parseInt(clean, 10);
                    if (!isNaN(parsed) && parsed >= 1) {
                      const maxVal = Math.min(365, parsed);
                      const nextDate = new Date(normalizedCheckin);
                      nextDate.setDate(nextDate.getDate() + maxVal);
                      setSelectedDate(nextDate);
                      setActiveMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseInt(customNightsText, 10);
                    if (isNaN(parsed) || parsed < 1) {
                      setNightsDirect(1);
                    } else {
                      setNightsDirect(Math.min(365, parsed));
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.stepperUnitLabel, { color: theme.textSecondary }]}>
                  {currentNights === 1 ? 'Night' : 'Nights'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setNightsDirect(currentNights + 1)}
                disabled={currentNights >= 365}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Increase nights by 1"
              >
                <Ionicons name="add" size={18} color={currentNights >= 365 ? theme.textTertiary : theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3. INTERACTIVE CALENDAR VIEW ────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Month & Navigation Header */}
            <View style={styles.calendarNavHeader}>
              <TouchableOpacity
                style={[
                  styles.navChevronBtn,
                  { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                  !canGoPrevMonth && { opacity: 0.3 },
                ]}
                onPress={prevMonth}
                disabled={!canGoPrevMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={18} color={theme.text} />
              </TouchableOpacity>

              <Text style={[styles.calendarMonthTitle, { color: theme.text }]}>{monthTitle}</Text>

              <TouchableOpacity
                style={[styles.navChevronBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                onPress={nextMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Weekdays Row */}
            <View style={styles.weekdaysRow}>
              {WEEKDAYS.map((wd) => (
                <View key={wd} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayText, { color: theme.textTertiary }]}>{wd}</Text>
                </View>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((item, idx) => {
                if (!item.date) {
                  return <View key={`blank_${idx}`} style={styles.dayCell} />;
                }

                const isInteractive = !item.isPast && !item.isCheckin;

                return (
                  <View
                    key={item.date.toISOString()}
                    style={[
                      styles.dayCell,
                      item.isInRange && { backgroundColor: theme.accentSubtle },
                      item.isCheckin && styles.dayCellCheckinRange,
                      item.isCheckout && styles.dayCellCheckoutRange,
                    ]}
                  >
                    <Pressable
                      style={[
                        styles.dayCircle,
                        item.isCheckout && { backgroundColor: theme.accent },
                        item.isCheckin && { borderColor: theme.free, borderWidth: 1.5 },
                      ]}
                      onPress={() => item.date && handleDayPress(item.date)}
                      disabled={!isInteractive}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.dayNumber} ${monthTitle}${item.isCheckout ? ', Selected Checkout' : ''}${item.isCheckin ? ', Check-in Day' : ''}`}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: theme.text },
                          item.isPast && { color: theme.textTertiary, opacity: 0.35 },
                          item.isCheckin && { color: theme.free, fontWeight: '700' },
                          item.isCheckout && { color: '#ffffff', fontWeight: '800' },
                        ]}
                      >
                        {item.dayNumber}
                      </Text>

                      {item.isCheckin && (
                        <View style={[styles.checkinDot, { backgroundColor: theme.free }]} />
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={[styles.calendarLegendRow, { borderTopColor: theme.borderSubtle }]}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { borderColor: theme.free, borderWidth: 1.5 }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Check-In</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Check-Out</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendRangeSample, { backgroundColor: theme.accentSubtle }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Stay Range</Text>
              </View>
            </View>
          </View>

          {/* ── 4. CHECKOUT TIME SELECTOR ───────────────────────────── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={17} color={theme.accent} />
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CHECKOUT TIME</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>
                {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')} {period}
              </Text>
            </View>

            {/* Quick Standard Times */}
            <View style={styles.quickTimesRow}>
              {QUICK_TIMES.map((qt) => {
                const isSelected = hour === qt.hours && minute === qt.minutes && period === qt.period;
                return (
                  <TouchableOpacity
                    key={qt.label}
                    style={[
                      styles.quickTimePill,
                      {
                        backgroundColor: isSelected ? theme.accent : theme.surfaceSubtle,
                        borderColor: isSelected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => {
                      setHour(qt.hours);
                      setMinute(qt.minutes);
                      setPeriod(qt.period);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${qt.label} ${qt.tag}`}
                  >
                    <Text
                      style={[
                        styles.quickTimePillText,
                        { color: isSelected ? '#ffffff' : theme.text },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
                      {qt.label}
                    </Text>
                    <Text
                      style={[
                        styles.quickTimePillSub,
                        { color: isSelected ? '#ffffff' : theme.textTertiary },
                      ]}
                    >
                      {qt.tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Hour / Minute / Period Wheels (Segmented Control) */}
            <View style={[styles.customTimeBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              {/* Hour Selector */}
              <View style={styles.timeComponentGroup}>
                <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>HOUR</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScrollRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
                    const isSelected = hour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[
                          styles.timeNumberBtn,
                          {
                            backgroundColor: isSelected ? theme.accent : theme.surface,
                            borderColor: isSelected ? theme.accent : theme.border,
                          },
                        ]}
                        onPress={() => setHour(h)}
                        hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.timeNumberText,
                            { color: isSelected ? '#ffffff' : theme.text },
                            isSelected && { fontWeight: '700' },
                          ]}
                        >
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Minute & AM/PM Selector */}
              <View style={styles.timeBottomRow}>
                {/* Minute Quarter-Hour Interval */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>MINUTE</Text>
                  <View style={styles.minuteRow}>
                    {MINUTES_INTERVALS.map((m) => {
                      const isSelected = minute === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.minuteBtn,
                            {
                              backgroundColor: isSelected ? theme.accent : theme.surface,
                              borderColor: isSelected ? theme.accent : theme.border,
                            },
                          ]}
                          onPress={() => setMinute(m)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.minuteText,
                              { color: isSelected ? '#ffffff' : theme.text },
                              isSelected && { fontWeight: '700' },
                            ]}
                          >
                            :{m.toString().padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Period AM / PM */}
                <View style={{ width: 110 }}>
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>AM / PM</Text>
                  <View style={[styles.periodSegmented, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {(['AM', 'PM'] as const).map((p) => {
                      const isSelected = period === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.periodBtn,
                            isSelected && { backgroundColor: theme.accent },
                          ]}
                          onPress={() => setPeriod(p)}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.periodText,
                              { color: isSelected ? '#ffffff' : theme.textSecondary },
                              isSelected && { fontWeight: '800' },
                            ]}
                          >
                            {p}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ── 5. CONFIRMATION BOTTOM ACTION ───────────────────────── */}
          <TouchableOpacity
            style={[styles.applyActionBtn, { backgroundColor: theme.accent }]}
            onPress={handleApply}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Confirm ${currentNights} nights stay checkout`}
          >
            <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
            <Text style={styles.applyActionText}>
              Confirm {currentNights} Night{currentNights > 1 ? 's' : ''} ({selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')} {period})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minHeight: 44,
    minWidth: 60,
    justifyContent: 'center',
  },
  headerCancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitleBox: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  headerDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDoneText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },

  // Summary Card
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryCol: {
    flex: 1,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  summaryBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryDatePrimary: {
    fontSize: 17,
    fontWeight: '700',
  },
  summaryDateSecondary: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryDividerContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  nightsDurationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  nightsDurationText: {
    fontSize: 12,
    fontWeight: '800',
  },
  arrowLine: {
    height: 1,
    width: 24,
    marginTop: 6,
  },

  // Card general
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: 11,
  },

  // Presets & Stepper
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  presetPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  stepperWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  stepperInput: {
    fontSize: 22,
    fontWeight: '800',
    minWidth: 48,
    textAlign: 'center',
    padding: 0,
  },
  stepperUnitLabel: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Calendar
  calendarNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navChevronBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
    marginBottom: 6,
  },
  weekdayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellCheckinRange: {
    borderTopLeftRadius: CELL_SIZE / 2,
    borderBottomLeftRadius: CELL_SIZE / 2,
  },
  dayCellCheckoutRange: {
    borderTopRightRadius: CELL_SIZE / 2,
    borderBottomRightRadius: CELL_SIZE / 2,
  },
  dayCircle: {
    width: CELL_SIZE - 6,
    height: CELL_SIZE - 6,
    borderRadius: (CELL_SIZE - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkinDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  calendarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendRangeSample: {
    width: 16,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Time Selector
  quickTimesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickTimePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickTimePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickTimePillSub: {
    fontSize: 10,
    marginTop: 2,
  },
  customTimeBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  timeComponentGroup: {},
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  timeScrollRow: {
    gap: 6,
  },
  timeNumberBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeNumberText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  minuteRow: {
    flexDirection: 'row',
    gap: 6,
  },
  minuteBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteText: {
    fontSize: 13,
    fontWeight: '600',
  },
  periodSegmented: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    padding: 2,
  },
  periodBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom action
  applyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    minHeight: 52,
  },
  applyActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
