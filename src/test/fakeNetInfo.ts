// src/test/fakeNetInfo.ts
// Test helper: Scriptable NetInfo event emitter for network state tests

export interface NetState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}

export class FakeNetInfo {
  private currentState: NetState = {
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  };
  private listeners: ((state: NetState) => void)[] = [];

  constructor(initialOnline = true) {
    this.currentState = {
      isConnected: initialOnline,
      isInternetReachable: initialOnline,
      type: initialOnline ? 'wifi' : 'none',
    };
  }

  setOnline(online: boolean) {
    this.currentState = {
      isConnected: online,
      isInternetReachable: online,
      type: online ? 'wifi' : 'none',
    };
    for (const l of this.listeners) {
      l(this.currentState);
    }
  }

  async fetch(): Promise<NetState> {
    return { ...this.currentState };
  }

  addEventListener(listener: (state: NetState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  clear() {
    this.listeners = [];
  }
}

