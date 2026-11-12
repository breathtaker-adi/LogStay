// src/services/broadcast.service.ts
// Guest Broadcast Messaging Service
// Owner & Co-Admin send immediately; Front Desk submits for managerial approval first.

import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { normalizeWhatsAppPhone, openWhatsApp } from '@/lib/whatsapp';
import { Role } from '@/lib/permissions';

export type BroadcastCategory =
  | 'emergency'
  | 'update'
  | 'housekeeping'
  | 'checkout_reminder';

export type BroadcastStatus =
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'declined';

export interface BroadcastRecipient {
  stay_id: string;
  guest_id: string;
  name: string;
  phone: string | null;
  unit_label: string;
}

export interface GuestBroadcastRecord {
  id: string;
  property_id: string;
  category: BroadcastCategory;
  title: string;
  message: string;
  status: BroadcastStatus;
  recipient_count: number;
  recipients: BroadcastRecipient[];
  approval_request_id: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface SubmitBroadcastResult {
  broadcast_id: string;
  approval_request_id: string | null;
  status: BroadcastStatus;
  requires_approval: boolean;
  recipient_count: number;
  recipients: BroadcastRecipient[];
}

export const BROADCAST_CATEGORIES: {
  id: BroadcastCategory;
  label: string;
  icon: string;
  templateTitle: string;
  templateBody: string;
}[] = [
  {
    id: 'update',
    label: 'Property Update',
    icon: 'megaphone-outline',
    templateTitle: 'Property Notice',
    templateBody: 'Dear guest, quick update from our front desk: ',
  },
  {
    id: 'emergency',
    label: 'Emergency Alert',
    icon: 'warning-outline',
    templateTitle: 'Important Safety Notice',
    templateBody: 'Urgent notice from property management: ',
  },
  {
    id: 'housekeeping',
    label: 'Housekeeping',
    icon: 'sparkles-outline',
    templateTitle: 'Housekeeping Schedule',
    templateBody: 'Room service and linen refresh will take place between ',
  },
  {
    id: 'checkout_reminder',
    label: 'Check-Out',
    icon: 'time-outline',
    templateTitle: 'Check-Out Reminder',
    templateBody: 'Friendly reminder: standard check-out time is 11:00 AM. Let reception know if you need an extension.',
  },
];

/**
 * Pure policy check: Owner & Co-Admin dispatch immediately; Front Desk requires approval.
 */
export function requiresBroadcastApproval(role?: Role | string | null): boolean {
  return role === 'desk';
}

export function formatBroadcastMessage(
  category: BroadcastCategory,
  title: string,
  message: string,
  propertyName?: string | null
): string {
  const catLabel =
    category === 'emergency'
      ? 'URGENT NOTICE'
      : category === 'housekeeping'
        ? 'HOUSEKEEPING UPDATE'
        : category === 'checkout_reminder'
          ? 'CHECK-OUT REMINDER'
          : 'PROPERTY UPDATE';

  const header = propertyName ? `${propertyName} · ${catLabel}` : catLabel;
  return `[${header}]\n${title.trim()}\n\n${message.trim()}`;
}

export function extractValidPhones(recipients: BroadcastRecipient[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of recipients) {
    const clean = normalizeWhatsAppPhone(r.phone);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(`+${clean}`);
    }
  }
  return out;
}

/**
 * Builds platform-appropriate group SMS URI with encoded body.
 */
export function buildBulkSmsUri(
  phones: string[],
  body: string,
  platformOs: string = Platform.OS
): string | null {
  if (!phones || phones.length === 0) return null;
  const cleaned = phones.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  const encoded = encodeURIComponent(body);
  if (platformOs === 'ios') {
    return `sms:/open?addresses=${cleaned.join(',')}&body=${encoded}`;
  }
  return `sms:${cleaned.join(',')}?body=${encoded}`;
}

export class BroadcastService {
  static async getCheckedInRecipients(propertyId: string): Promise<BroadcastRecipient[]> {
    const { data, error } = await supabase.rpc('get_checked_in_broadcast_recipients', {
      p_prop_id: propertyId,
    });
    if (error) throw error;
    return Array.isArray(data) ? (data as BroadcastRecipient[]) : [];
  }

  static async submitBroadcast(
    propertyId: string,
    category: BroadcastCategory,
    title: string,
    message: string
  ): Promise<SubmitBroadcastResult> {
    const { data, error } = await supabase.rpc('submit_guest_broadcast', {
      p_prop_id: propertyId,
      p_category: category,
      p_title: title.trim(),
      p_message: message.trim(),
    });
    if (error) throw error;
    if (!data) throw new Error('No response from broadcast RPC.');
    return data as SubmitBroadcastResult;
  }

  static async markBroadcastSent(broadcastId: string): Promise<GuestBroadcastRecord | null> {
    const { data, error } = await supabase.rpc('mark_guest_broadcast_sent', {
      p_broadcast_id: broadcastId,
    });
    if (error) throw error;
    return (data as GuestBroadcastRecord) || null;
  }

  static async getBroadcasts(propertyId: string): Promise<GuestBroadcastRecord[]> {
    const { data, error } = await supabase
      .from('guest_broadcasts')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) throw error;
    return ((data as any[]) || []).map((row) => ({
      ...row,
      recipients: Array.isArray(row.recipients) ? row.recipients : [],
    }));
  }

  static async openBulkSms(recipients: BroadcastRecipient[], body: string): Promise<boolean> {
    const phones = extractValidPhones(recipients);
    const uri = buildBulkSmsUri(phones, body);
    if (!uri) return false;
    const supported = await Linking.canOpenURL(uri);
    if (supported) {
      await Linking.openURL(uri);
      return true;
    }
    // Fallback to universal separator syntax
    const fallback = `sms:${phones.join(',')}?body=${encodeURIComponent(body)}`;
    await Linking.openURL(fallback);
    return true;
  }

  static async sendSingleWhatsApp(recipient: BroadcastRecipient, body: string): Promise<boolean> {
    if (!recipient.phone) return false;
    const personalized = `Hi ${recipient.name},\n\n${body}`;
    return openWhatsApp(recipient.phone, personalized);
  }
}

