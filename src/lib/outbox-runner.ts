// src/lib/outbox-runner.ts
// Pure outbox synchronization runner with mutex, idempotency, FIFO order, and crash recovery.

export interface OutboxRecord {
  id: string;
  type: string;
  entity?: string;
  payload: string;
  created_at: number | string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  attempts: number;
  last_error?: string | null;
  seq?: number;
}

export interface OutboxDbInterface {
  getPending(): OutboxRecord[];
  getFailed(): OutboxRecord[];
  markProcessing(id: string): void;
  markDone(id: string): void;
  recordFailure(id: string, error: string, newAttempts: number, isFailed: boolean): void;
  resetProcessingToPending(): void;
  retryFailed(): void;
  discardFailed(): void;
  saveItem(item: OutboxRecord): void;
}

export interface RpcClientInterface {
  callRpc(type: string, payload: any): Promise<{ data?: any; error?: { message: string; code?: string } | null }>;
}

export interface PhotoUploaderInterface {
  uploadPhoto(propertyId: string, guestId: string, photoUri: string): Promise<string>;
}

/**
 * Exponential backoff calculation: min(base * 2^attempt, maxBackoff)
 */
export function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
  if (attempt <= 0) return 0;
  const backoff = baseMs * Math.pow(2, attempt - 1);
  return Math.min(backoff, maxMs);
}

export class OutboxRunner {
  private isProcessing = false;

  get isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Resets all items left in 'processing' status at app boot to 'pending'
   */
  recoverFromCrash(db: OutboxDbInterface): void {
    db.resetProcessingToPending();
  }

  /**
   * Processes the outbox queue strictly in FIFO order.
   * If an item fails, the queue stops to preserve causal consistency.
   */
  async processOutbox(
    db: OutboxDbInterface,
    rpcClient: RpcClientInterface,
    isOnline: boolean,
    photoUploader?: PhotoUploaderInterface
  ): Promise<{ processed: number; stoppedOnError: boolean; skipped: boolean }> {
    if (!isOnline) {
      return { processed: 0, stoppedOnError: false, skipped: true };
    }

    if (this.isProcessing) {
      // Mutex lock: second trigger immediately skips
      return { processed: 0, stoppedOnError: false, skipped: true };
    }

    this.isProcessing = true;
    let processedCount = 0;
    let stoppedOnError = false;

    try {
      const items = db.getPending();

      for (const item of items) {
        let payload: any;
        try {
          payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
        } catch {
          // Malformed JSON: move directly to failed without calling RPC
          db.recordFailure(item.id, 'Malformed JSON payload', (item.attempts || 0) + 1, true);
          continue;
        }

        db.markProcessing(item.id);

        // Photo upload ordering: if photoUri present, upload BEFORE RPC
        if (payload.photoUri && photoUploader) {
          try {
            const photoPath = await photoUploader.uploadPhoto(
              payload.property_id || '',
              payload.guest_id || payload.id || item.id,
              payload.photoUri
            );
            payload.id_photo_path = photoPath;
          } catch (uploadErr: any) {
            // Photo upload failed: stop before calling RPC
            const attempts = (item.attempts || 0) + 1;
            const isFailed = attempts >= 5;
            db.recordFailure(item.id, `Photo upload failed: ${uploadErr.message || uploadErr}`, attempts, isFailed);
            stoppedOnError = true;
            break;
          }
        }

        const actionType = item.entity || item.type;
        const res = await rpcClient.callRpc(actionType, payload);

        let error = res?.error;

        // Idempotency check: duplicate submission handling
        if (error && (error.message?.includes('Bed is already occupied') || error.code === '23505' || error.message?.includes('already_processed'))) {
          error = null; // Treat idempotent replay as success
        }

        if (error) {
          const attempts = (item.attempts || 0) + 1;
          const isFailed = attempts >= 5;
          db.recordFailure(item.id, error.message || 'RPC Error', attempts, isFailed);
          stoppedOnError = true;
          break; // Stop at first failure to keep strict order
        } else {
          db.markDone(item.id);
          processedCount++;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed: processedCount, stoppedOnError, skipped: false };
  }
}

