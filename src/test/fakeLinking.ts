// src/test/fakeLinking.ts
// Test helper: Scriptable deep-linking queue for Expo Linking tests

export class FakeLinking {
  private urlQueue: string[] = [];
  private listeners: ((event: { url: string }) => void)[] = [];

  constructor(initialUrls: string[] = []) {
    this.urlQueue = [...initialUrls];
  }

  enqueueUrl(url: string) {
    this.urlQueue.push(url);
    this.notify({ url });
  }

  async getInitialURL(): Promise<string | null> {
    return this.urlQueue.shift() ?? null;
  }

  addEventListener(type: string, handler: (event: { url: string }) => void) {
    if (type === 'url') {
      this.listeners.push(handler);
    }
    return {
      remove: () => {
        this.listeners = this.listeners.filter((l) => l !== handler);
      },
    };
  }

  private notify(event: { url: string }) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear() {
    this.urlQueue = [];
    this.listeners = [];
  }
}

