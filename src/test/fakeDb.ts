// src/test/fakeDb.ts
// Test helper: In-memory table store standing in for SQLite in offline queue tests

export interface OutboxItem {
  id: string;
  type: string;
  payload: string;
  attempts: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  last_error?: string | null;
  created_at: string;
  seq: number;
}

export class FakeDatabase {
  outbox: OutboxItem[] = [];
  rooms: any[] = [];
  units: any[] = [];
  stays: any[] = [];
  private sequence = 1;

  insertOutbox(type: string, payload: any): OutboxItem {
    const item: OutboxItem = {
      id: payload.id || `outbox-${this.sequence}`,
      type,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      attempts: 0,
      status: 'pending',
      created_at: new Date().toISOString(),
      seq: this.sequence++,
    };
    this.outbox.push(item);
    return item;
  }

  getPendingOutbox(): OutboxItem[] {
    return this.outbox
      .filter((i) => i.status === 'pending')
      .sort((a, b) => a.seq - b.seq);
  }

  markProcessing(id: string) {
    const it = this.outbox.find((i) => i.id === id);
    if (it) it.status = 'processing';
  }

  markDone(id: string) {
    const it = this.outbox.find((i) => i.id === id);
    if (it) it.status = 'done';
  }

  markFailed(id: string, error: string) {
    const it = this.outbox.find((i) => i.id === id);
    if (it) {
      it.attempts += 1;
      it.last_error = error;
      it.status = it.attempts >= 5 ? 'failed' : 'pending';
    }
  }

  resetProcessingToPending() {
    this.outbox.forEach((i) => {
      if (i.status === 'processing') i.status = 'pending';
    });
  }

  clear() {
    this.outbox = [];
    this.rooms = [];
    this.units = [];
    this.stays = [];
    this.sequence = 1;
  }
}

