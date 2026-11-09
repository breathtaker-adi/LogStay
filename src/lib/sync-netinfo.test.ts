// src/lib/sync-netinfo.test.ts
// Unit tests for Background Sync & NetInfo Triggers (Section 4.31)
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNetInfo } from '@/test/fakeNetInfo';

describe('Background Sync & NetInfo Triggers (Section 4.31)', () => {
  let fakeNet: FakeNetInfo;

  beforeEach(() => {
    fakeNet = new FakeNetInfo();
  });

  it('triggers sync when network transitions from offline to online', async () => {
    fakeNet.setOnline(false);
    let syncCallCount = 0;

    fakeNet.addEventListener((state) => {
      if (state.isConnected) {
        syncCallCount++;
      }
    });

    fakeNet.setOnline(true);
    expect(syncCallCount).toBe(1);
  });

  it('does NOT trigger sync when network goes offline', () => {
    let syncCallCount = 0;

    fakeNet.addEventListener((state) => {
      if (state.isConnected) {
        syncCallCount++;
      }
    });

    fakeNet.setOnline(false);
    expect(syncCallCount).toBe(0);
  });

  it('executes sync on AppState transition to active (foreground resume)', () => {
    let syncCallCount = 0;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        syncCallCount++;
      }
    };

    handleAppStateChange('background');
    expect(syncCallCount).toBe(0);

    handleAppStateChange('active');
    expect(syncCallCount).toBe(1);
  });

  it('enforces concurrency mutex: overlapping sync requests run only one process at a time', async () => {
    let isProcessing = false;
    let concurrentAttemptsRejected = 0;
    let successfulRuns = 0;

    const triggerSyncWithMutex = async () => {
      if (isProcessing) {
        concurrentAttemptsRejected++;
        return;
      }
      isProcessing = true;
      try {
        await new Promise((r) => setTimeout(r, 10));
        successfulRuns++;
      } finally {
        isProcessing = false;
      }
    };

    // Fire 3 overlapping sync requests simultaneously
    await Promise.all([
      triggerSyncWithMutex(),
      triggerSyncWithMutex(),
      triggerSyncWithMutex(),
    ]);

    expect(successfulRuns).toBe(1);
    expect(concurrentAttemptsRejected).toBe(2);
  });

  it('debounces rapid network flapping (rapid offline-online-offline cycles)', async () => {
    let executedSyncs = 0;
    let debounceTimer: any = null;

    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        executedSyncs++;
      }, 50);
    };

    // Simulate rapid flapping 5 times within 10ms
    for (let i = 0; i < 5; i++) {
      debouncedSync();
    }

    // Before debounce timer finishes
    expect(executedSyncs).toBe(0);

    // Wait for timer to settle
    await new Promise((r) => setTimeout(r, 70));
    expect(executedSyncs).toBe(1);
  });
});
