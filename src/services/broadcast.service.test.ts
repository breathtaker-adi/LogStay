// src/services/broadcast.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BroadcastRecipient,
  BroadcastService,
  buildBulkSmsUri,
  extractValidPhones,
  formatBroadcastMessage,
  requiresBroadcastApproval,
} from './broadcast.service';

const canOpenURLMock = vi.fn(async (_url: string) => true);
const openURLMock = vi.fn(async (_url: string) => {});
const rpcMock = vi.fn();

vi.mock('react-native', () => ({
  Linking: {
    canOpenURL: (url: string) => canOpenURLMock(url),
    openURL: (url: string) => openURLMock(url),
  },
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: vi.fn(),
  },
}));

describe('src/services/broadcast.service.ts (Guest Broadcast Pipeline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces approval only for desk staff while owner/co_admin send directly', () => {
    expect(requiresBroadcastApproval('owner')).toBe(false);
    expect(requiresBroadcastApproval('co_admin')).toBe(false);
    expect(requiresBroadcastApproval('desk')).toBe(true);
    expect(requiresBroadcastApproval(null)).toBe(false);
  });

  it('extracts and deduplicates valid E.164 phone numbers for bulk dispatch', () => {
    const recipients: BroadcastRecipient[] = [
      { stay_id: 's1', guest_id: 'g1', name: 'Aarav', phone: '9876543210', unit_label: '101' },
      { stay_id: 's2', guest_id: 'g2', name: 'Aarav Dup', phone: '+91 98765-43210', unit_label: '102' },
      { stay_id: 's3', guest_id: 'g3', name: 'Clara', phone: '+49 170 5550142', unit_label: 'Dorm A' },
      { stay_id: 's4', guest_id: 'g4', name: 'No Phone', phone: null, unit_label: 'Dorm B' },
      { stay_id: 's5', guest_id: 'g5', name: 'Invalid', phone: '123', unit_label: '103' },
    ];

    expect(extractValidPhones(recipients)).toEqual(['+919876543210', '+491705550142']);
  });

  it('builds platform-specific bulk SMS URIs and handles empty lists', () => {
    expect(buildBulkSmsUri([], 'Hello', 'ios')).toBeNull();
    expect(buildBulkSmsUri(['+919876543210', '+491705550142'], 'Water shutoff 2PM', 'ios')).toBe(
      'sms:/open?addresses=+919876543210,+491705550142&body=Water%20shutoff%202PM'
    );
    expect(buildBulkSmsUri(['+919876543210', '+491705550142'], 'Water shutoff 2PM', 'android')).toBe(
      'sms:+919876543210,+491705550142?body=Water%20shutoff%202PM'
    );
  });

  it('formats broadcast message with property header and category badge', () => {
    expect(formatBroadcastMessage('emergency', 'Power Cut Notice', 'Backup generator active.', 'Hilltop Inn')).toBe(
      '[Hilltop Inn · URGENT NOTICE]\nPower Cut Notice\n\nBackup generator active.'
    );
  });

  it('calls submit_guest_broadcast RPC cleanly and returns result', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        broadcast_id: 'b-1',
        approval_request_id: null,
        status: 'approved',
        requires_approval: false,
        recipient_count: 3,
        recipients: [],
      },
      error: null,
    });

    const res = await BroadcastService.submitBroadcast(
      'prop-1',
      'update',
      '  Breakfast Timing  ',
      '  Served 8 AM to 10 AM  '
    );

    expect(rpcMock).toHaveBeenCalledWith('submit_guest_broadcast', {
      p_prop_id: 'prop-1',
      p_category: 'update',
      p_title: 'Breakfast Timing',
      p_message: 'Served 8 AM to 10 AM',
    });
    expect(res.status).toBe('approved');
    expect(res.recipient_count).toBe(3);
  });
});
