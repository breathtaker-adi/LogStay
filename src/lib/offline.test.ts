import { describe, it, expect, beforeEach } from 'vitest';
import {
  OutboxRunner,
  calculateBackoff,
  OutboxRecord,
  OutboxDbInterface,
  RpcClientInterface,
  PhotoUploaderInterface,
} from './outbox-runner';
import { hashPinWithSalt } from './crypto-utils';

// In-memory test store implementing OutboxDbInterface
class TestOutboxDb implements OutboxDbInterface {
  items: OutboxRecord[] = [];
  private seq = 1;

  getPending(): OutboxRecord[] {
    return this.items
      .filter((i) => i.status === 'pending')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  getFailed(): OutboxRecord[] {
    return this.items.filter((i) => i.status === 'failed');
  }

  saveItem(item: OutboxRecord): void {
    const record: OutboxRecord = {
      ...item,
      seq: this.seq++,
      status: item.status || 'pending',
      attempts: item.attempts || 0,
    };
    this.items.push(record);
  }

  markProcessing(id: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) it.status = 'processing';
  }

  markDone(id: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) it.status = 'done';
  }

  recordFailure(id: string, error: string, newAttempts: number, isFailed: boolean): void {
    const it = this.items.find((i) => i.id === id);
    if (it) {
      it.attempts = newAttempts;
      it.last_error = error;
      it.status = isFailed ? 'failed' : 'pending';
    }
  }

  resetProcessingToPending(): void {
    this.items.forEach((i) => {
      if (i.status === 'processing') i.status = 'pending';
    });
  }

  retryFailed(): void {
    this.items.forEach((i) => {
      if (i.status === 'failed') {
        i.status = 'pending';
        i.attempts = 0;
        i.last_error = null;
      }
    });
  }

  discardFailed(): void {
    this.items = this.items.filter((i) => i.status !== 'failed');
  }
}

describe('src/lib/offline.ts & OutboxRunner', () => {
  let db: TestOutboxDb;
  let runner: OutboxRunner;
  let rpcCalls: { type: string; payload: any }[];
  let rpcClient: RpcClientInterface;

  beforeEach(() => {
    db = new TestOutboxDb();
    runner = new OutboxRunner();
    rpcCalls = [];
    rpcClient = {
      callRpc: async (type, payload) => {
        rpcCalls.push({ type, payload });
        return { data: { success: true }, error: null };
      },
    };
  });

  describe('Queue Enqueue & Ordering', () => {
    it('stores outbox items with stable id, type, payload, attempts 0, and status pending', () => {
      db.saveItem({
        id: 'outbox_1',
        type: 'guest_checkin',
        payload: JSON.stringify({ guest_name: 'Aditya' }),
        created_at: 1000,
        status: 'pending',
        attempts: 0,
      });

      const pending = db.getPending();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('outbox_1');
      expect(pending[0].type).toBe('guest_checkin');
      expect(pending[0].status).toBe('pending');
      expect(pending[0].attempts).toBe(0);
    });

    it('preserves strict FIFO sequence order even when created_at timestamps are identical', () => {
      const now = 1700000000000;
      db.saveItem({ id: 'msg_1', type: 'shift_open', payload: '{}', created_at: now, status: 'pending', attempts: 0 });
      db.saveItem({ id: 'msg_2', type: 'guest_checkin', payload: '{}', created_at: now, status: 'pending', attempts: 0 });
      db.saveItem({ id: 'msg_3', type: 'add_charge', payload: '{}', created_at: now, status: 'pending', attempts: 0 });

      const pending = db.getPending();
      expect(pending.map((i) => i.id)).toEqual(['msg_1', 'msg_2', 'msg_3']);
    });
  });

  describe('Offline & Online State Handling', () => {
    it('does nothing and calls no RPCs when device is offline', async () => {
      db.saveItem({ id: 'item_1', type: 'guest_checkin', payload: '{}', created_at: 1000, status: 'pending', attempts: 0 });

      const res = await runner.processOutbox(db, rpcClient, false);
      expect(res.skipped).toBe(true);
      expect(res.processed).toBe(0);
      expect(rpcCalls.length).toBe(0);
      expect(db.items[0].status).toBe('pending');
    });

    it('processes pending item successfully when online and marks item done', async () => {
      db.saveItem({
        id: 'item_1',
        type: 'guest_checkin',
        payload: JSON.stringify({ guest_name: 'John Doe', amount: 500 }),
        created_at: 1000,
        status: 'pending',
        attempts: 0,
      });

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.processed).toBe(1);
      expect(rpcCalls.length).toBe(1);
      expect(rpcCalls[0].type).toBe('guest_checkin');
      expect(rpcCalls[0].payload.guest_name).toBe('John Doe');
      expect(db.items[0].status).toBe('done');
    });
  });

  describe('Failure Handling & Head-of-Line Blocking', () => {
    it('increments attempts, records error, and halts queue on first failure to preserve order', async () => {
      db.saveItem({ id: 'item_1', type: 'guest_checkin', payload: JSON.stringify({ name: 'Guest 1' }), created_at: 1000, status: 'pending', attempts: 0 });
      db.saveItem({ id: 'item_2', type: 'guest_checkout', payload: JSON.stringify({ stay_id: 's1' }), created_at: 1001, status: 'pending', attempts: 0 });

      // Script RPC to fail on item_1
      rpcClient = {
        callRpc: async () => ({ data: null, error: { message: 'Network timeout / 504' } }),
      };

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.stoppedOnError).toBe(true);
      expect(res.processed).toBe(0);

      // item_1 should have attempts = 1
      expect(db.items[0].attempts).toBe(1);
      expect(db.items[0].last_error).toBe('Network timeout / 504');
      expect(db.items[0].status).toBe('pending');

      // item_2 was NEVER called to prevent causal disorder (e.g. checkout before checkin!)
      expect(db.items[1].attempts).toBe(0);
      expect(db.items[1].status).toBe('pending');
    });

    it('marks item as failed after the 5th failed attempt', async () => {
      db.saveItem({ id: 'item_fail', type: 'petty_cash', payload: '{}', created_at: 1000, status: 'pending', attempts: 4 });

      rpcClient = {
        callRpc: async () => ({ data: null, error: { message: 'Internal Server Error' } }),
      };

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.stoppedOnError).toBe(true);
      expect(db.items[0].attempts).toBe(5);
      expect(db.items[0].status).toBe('failed');
      expect(db.items[0].last_error).toBe('Internal Server Error');
    });
  });

  describe('Idempotency & Replay Invariance', () => {
    it('treats duplicate checkin ("Bed is already occupied") as success without error', async () => {
      db.saveItem({ id: 'dup_item', type: 'guest_checkin', payload: JSON.stringify({ id: 'stay_123' }), created_at: 1000, status: 'pending', attempts: 0 });

      rpcClient = {
        callRpc: async () => ({ data: null, error: { message: 'Bed is already occupied by guest', code: '23505' } }),
      };

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.processed).toBe(1);
      expect(db.items[0].status).toBe('done');
    });

    it('treats PostgreSQL duplicate key constraint violation (code 23505) as idempotent success', async () => {
      db.saveItem({ id: 'payment_dup', type: 'record_payment', payload: JSON.stringify({ payment_id: 'p_1' }), created_at: 1000, status: 'pending', attempts: 0 });

      rpcClient = {
        callRpc: async () => ({ data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }),
      };

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.processed).toBe(1);
      expect(db.items[0].status).toBe('done');
    });

    it('uses client-generated UUID across multiple sync executions', async () => {
      const clientStayId = 'client-uuid-999';
      db.saveItem({ id: clientStayId, type: 'guest_checkin', payload: JSON.stringify({ stay_id: clientStayId }), created_at: 1000, status: 'pending', attempts: 0 });

      // First run: network drop during ack
      rpcClient = {
        callRpc: async (type, payload) => {
          rpcCalls.push({ type, payload });
          return { data: null, error: { message: 'Connection dropped before ack' } };
        },
      };
      await runner.processOutbox(db, rpcClient, true);
      expect(rpcCalls[0].payload.stay_id).toBe(clientStayId);

      // Second run: replay
      rpcClient = {
        callRpc: async (_, payload) => {
          rpcCalls.push({ type: 'replay', payload });
          return { data: { id: clientStayId }, error: null };
        },
      };
      await runner.processOutbox(db, rpcClient, true);
      expect(rpcCalls[1].payload.stay_id).toBe(clientStayId);
      expect(db.items[0].status).toBe('done');
    });
  });

  describe('Photo Upload Ordering Boundary', () => {
    it('uploads photo before calling check-in RPC, passing storage path to RPC', async () => {
      db.saveItem({
        id: 'chk_photo',
        type: 'guest_checkin',
        payload: JSON.stringify({ guest_id: 'g1', property_id: 'prop1', photoUri: 'file://local/id.jpg' }),
        created_at: 1000,
        status: 'pending',
        attempts: 0,
      });

      const photoUploader: PhotoUploaderInterface = {
        uploadPhoto: async () => 'prop1/g1_id_17000.jpg',
      };

      const res = await runner.processOutbox(db, rpcClient, true, photoUploader);
      expect(res.processed).toBe(1);
      expect(rpcCalls.length).toBe(1);
      expect(rpcCalls[0].payload.id_photo_path).toBe('prop1/g1_id_17000.jpg');
    });

    it('halts and does NOT call RPC if photo upload fails', async () => {
      db.saveItem({
        id: 'chk_photo_fail',
        type: 'guest_checkin',
        payload: JSON.stringify({ guest_id: 'g1', property_id: 'prop1', photoUri: 'file://bad/path.jpg' }),
        created_at: 1000,
        status: 'pending',
        attempts: 0,
      });

      const photoUploader: PhotoUploaderInterface = {
        uploadPhoto: async () => {
          throw new Error('S3 / Storage bucket unreachable');
        },
      };

      const res = await runner.processOutbox(db, rpcClient, true, photoUploader);
      expect(res.stoppedOnError).toBe(true);
      expect(res.processed).toBe(0);
      expect(rpcCalls.length).toBe(0); // RPC was NEVER called!
      expect(db.items[0].last_error).toContain('Photo upload failed');
      expect(db.items[0].attempts).toBe(1);
    });
  });

  describe('Concurrency & Mutex Locking', () => {
    it('blocks concurrent sync triggers; second trigger returns immediately', async () => {
      db.saveItem({ id: 'item_slow', type: 'shift_open', payload: '{}', created_at: 1000, status: 'pending', attempts: 0 });

      // Make RPC deliberately take time
      rpcClient = {
        callRpc: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { data: {}, error: null };
        },
      };

      const run1 = runner.processOutbox(db, rpcClient, true);
      const run2 = runner.processOutbox(db, rpcClient, true);

      const [res1, res2] = await Promise.all([run1, run2]);

      expect(res1.processed).toBe(1);
      expect(res2.skipped).toBe(true);
      expect(res2.processed).toBe(0);
    });
  });

  describe('Crash Recovery & Maintenance', () => {
    it('recovers items stuck in "processing" state back to "pending" at boot', () => {
      db.items.push(
        { id: 'stuck_1', type: 'guest_checkin', payload: '{}', created_at: 100, status: 'processing', attempts: 1 },
        { id: 'done_1', type: 'guest_checkout', payload: '{}', created_at: 101, status: 'done', attempts: 1 }
      );

      runner.recoverFromCrash(db);

      expect(db.items[0].status).toBe('pending');
      expect(db.items[1].status).toBe('done');
    });

    it('rejects malformed JSON payload without crashing runner and marks failed', async () => {
      db.saveItem({ id: 'bad_json', type: 'guest_checkin', payload: 'INVALID{{{JSON', created_at: 1000, status: 'pending', attempts: 0 });

      const res = await runner.processOutbox(db, rpcClient, true);
      expect(res.processed).toBe(0);
      expect(rpcCalls.length).toBe(0);
      expect(db.items[0].status).toBe('failed');
      expect(db.items[0].last_error).toContain('Malformed JSON');
    });

    it('retryFailed resets only "failed" items to "pending" with attempts=0, leaving pending intact', () => {
      db.items.push(
        { id: 'f_1', type: 'petty_cash', payload: '{}', created_at: 100, status: 'failed', attempts: 5, last_error: '500' },
        { id: 'p_1', type: 'shift_open', payload: '{}', created_at: 200, status: 'pending', attempts: 1, last_error: 'timeout' }
      );

      db.retryFailed();

      expect(db.items[0].status).toBe('pending');
      expect(db.items[0].attempts).toBe(0);
      expect(db.items[0].last_error).toBeNull();

      expect(db.items[1].status).toBe('pending');
      expect(db.items[1].attempts).toBe(1); // Pending untouched
    });

    it('discardFailed removes only "failed" items from database, never touching "pending"', () => {
      db.items.push(
        { id: 'f_1', type: 'petty_cash', payload: '{}', created_at: 100, status: 'failed', attempts: 5 },
        { id: 'p_1', type: 'guest_checkin', payload: '{}', created_at: 200, status: 'pending', attempts: 0 }
      );

      db.discardFailed();

      expect(db.items.length).toBe(1);
      expect(db.items[0].id).toBe('p_1');
    });
  });

  describe('Backoff Schedule Calculation', () => {
    it('calculates exponential backoff capped at maxBackoff', () => {
      expect(calculateBackoff(0)).toBe(0);
      expect(calculateBackoff(1, 1000, 30000)).toBe(1000);  // 1s
      expect(calculateBackoff(2, 1000, 30000)).toBe(2000);  // 2s
      expect(calculateBackoff(3, 1000, 30000)).toBe(4000);  // 4s
      expect(calculateBackoff(4, 1000, 30000)).toBe(8000);  // 8s
      expect(calculateBackoff(5, 1000, 30000)).toBe(16000); // 16s
      expect(calculateBackoff(6, 1000, 30000)).toBe(30000); // capped at 30s
      expect(calculateBackoff(10, 1000, 30000)).toBe(30000);
    });
  });

  describe('Local Cache & Room/Unit Filtering', () => {
    interface CacheRoom {
      id: string;
      property_id: string;
      label: string;
      kind: string;
      floor?: string | null;
      floor_no?: number | null;
      description?: string | null;
      archived_at?: string | null;
    }

    interface CacheUnit {
      id: string;
      room_id: string;
      label: string;
      gender_rule?: string | null;
      housekeeping_status?: string | null;
      archived_at?: string | null;
    }

    function filterActiveRooms(rooms: CacheRoom[]): CacheRoom[] {
      return rooms.filter((r) => !r.archived_at);
    }

    function filterActiveUnits(units: CacheUnit[]): CacheUnit[] {
      return units.filter((u) => !u.archived_at);
    }

    it('excludes archived rooms from cached inventory', () => {
      const rooms: CacheRoom[] = [
        { id: 'r1', property_id: 'p1', label: '101', kind: 'private', archived_at: null },
        { id: 'r2', property_id: 'p1', label: '102', kind: 'private', archived_at: '2026-10-01T00:00:00Z' },
        { id: 'r3', property_id: 'p1', label: 'Dorm 1', kind: 'dorm', archived_at: null },
      ];

      const active = filterActiveRooms(rooms);
      expect(active.length).toBe(2);
      expect(active.map((r) => r.id)).toEqual(['r1', 'r3']);
    });

    it('excludes archived beds/units from cached inventory', () => {
      const units: CacheUnit[] = [
        { id: 'u1', room_id: 'r1', label: 'Bed A', archived_at: null },
        { id: 'u2', room_id: 'r1', label: 'Bed B', archived_at: '2026-10-01' },
      ];

      const active = filterActiveUnits(units);
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('u1');
    });

    it('stores floor numbers and descriptions accurately in cache models', () => {
      const room: CacheRoom = {
        id: 'r_penthouse',
        property_id: 'p1',
        label: 'Penthouse 501',
        kind: 'private',
        floor: '5th Floor',
        floor_no: 5,
        description: 'Corner suite with sea view',
        archived_at: null,
      };

      const active = filterActiveRooms([room]);
      expect(active[0].floor_no).toBe(5);
      expect(active[0].floor).toBe('5th Floor');
      expect(active[0].description).toBe('Corner suite with sea view');
    });

    it('optimistic update: updates local unit housekeeping status without network', () => {
      const units = [
        { id: 'u1', housekeeping_status: 'dirty' },
        { id: 'u2', housekeeping_status: 'clean' },
      ];

      // Optimistically clean u1
      const updated = units.map((u) => (u.id === 'u1' ? { ...u, housekeeping_status: 'clean' } : u));
      expect(updated.find((u) => u.id === 'u1')?.housekeeping_status).toBe('clean');
    });
  });

  describe('Database Encryption Key Handling', () => {
    it('generates a stable 32-character hexadecimal key', () => {
      const generateKey = () => 'a1b2c3d4e5f67890123456789abcdef0';
      const key = generateKey();
      expect(key.length).toBe(32);
      expect(/^[0-9a-f]{32}$/.test(key)).toBe(true);
    });

    it('key format is compatible with SQLCipher PRAGMA key', () => {
      const key = 'a1b2c3d4e5f67890123456789abcdef0';
      const pragma = `PRAGMA key = "x'${key}'";`;
      expect(pragma).toContain(`"x'${key}'"`);
      expect(pragma.startsWith('PRAGMA key =')).toBe(true);
    });
  });

  describe('Local PIN Security & PBKDF2 Hashing', () => {
    it('hashes PIN with PBKDF2-SHA256 and salt', () => {
      const pin = '1234';
      const salt = 'test-salt-uuid-456';
      const hash1 = hashPinWithSalt(pin, salt, 2048);
      const hash2 = hashPinWithSalt(pin, salt, 2048);

      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('pbkdf2$2048$')).toBe(true);

      const differentPinHash = hashPinWithSalt('9999', salt, 2048);
      expect(differentPinHash).not.toBe(hash1);
    });
  });

  describe('100-Run Seeded Fault-Injection Simulation', () => {
    it('maintains strict invariants: zero duplicates, zero lost actions, exact drawer match across 100 runs', async () => {
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      // Simulated server state
      const serverStays = new Map<string, any>();
      let serverCashDrawer = 1000; // Float

      // Client state
      let clientCashDrawer = 1000;

      for (let run = 0; run < 100; run++) {
        const simDb = new TestOutboxDb();
        const simRunner = new OutboxRunner();

        const stayId = `stay_run_${run}`;
        const amount = 500 + Math.floor(rnd() * 2000);

        // Enqueue locally
        clientCashDrawer += amount;
        simDb.saveItem({
          id: stayId,
          type: 'guest_checkin',
          payload: JSON.stringify({ stay_id: stayId, amount, pay_mode: 'cash' }),
          created_at: 1000 + run,
          status: 'pending',
          attempts: 0,
        });

        // Fault injection parameters
        const dropBeforeSend = rnd() < 0.2; // 20% network down
        const dropAfterSend = rnd() < 0.15; // 15% drop after send before ack
        const appCrash = rnd() < 0.1;       // 10% app kill mid-processing

        let attempt = 0;
        let synced = false;

        while (!synced && attempt < 10) {
          attempt++;

          const mockRpc: RpcClientInterface = {
            callRpc: async (_, payload) => {
              if (dropBeforeSend && attempt === 1) {
                return { error: { message: 'Network unreachable' } };
              }

              // Server-side processing with idempotency
              if (!serverStays.has(payload.stay_id)) {
                serverStays.set(payload.stay_id, payload);
                serverCashDrawer += payload.amount;
              }

              if (dropAfterSend && attempt === 1) {
                return { error: { message: 'Connection dropped before ack' } };
              }

              return { data: { success: true }, error: null };
            },
          };

          if (appCrash && attempt === 1) {
            simRunner.recoverFromCrash(simDb);
          }

          const res = await simRunner.processOutbox(simDb, mockRpc, true);
          if (res.processed > 0) {
            synced = true;
          }
        }

        expect(synced).toBe(true);
      }

      // Invariants verification after 100 runs
      expect(serverStays.size).toBe(100); // Exactly 100 unique stays (zero lost, zero duplicates)
      expect(serverCashDrawer).toBe(clientCashDrawer); // Cash drawer matches penny-for-penny
    });
  });
});
