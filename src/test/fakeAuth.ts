// src/test/fakeAuth.ts
// Test helper: Scriptable mock authentication client

export interface FakeUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}

export interface FakeSession {
  access_token: string;
  refresh_token: string;
  user: FakeUser;
  expires_at?: number;
}

export class FakeAuth {
  private currentSession: FakeSession | null = null;
  private listeners: ((event: string, session: FakeSession | null) => void)[] = [];
  public calls: { fn: string; args: any }[] = [];

  constructor(initialSession: FakeSession | null = null) {
    this.currentSession = initialSession;
  }

  setSession(session: FakeSession | null, event: string = 'SIGNED_IN') {
    this.currentSession = session;
    this.notify(event, session);
  }

  private notify(event: string, session: FakeSession | null) {
    for (const listener of this.listeners) {
      listener(event, session);
    }
  }

  async getSession() {
    this.calls.push({ fn: 'getSession', args: {} });
    return { data: { session: this.currentSession }, error: null };
  }

  async getUser() {
    this.calls.push({ fn: 'getUser', args: {} });
    return { data: { user: this.currentSession?.user ?? null }, error: null };
  }

  async signInWithPassword(args: { email?: string; password?: string }) {
    this.calls.push({ fn: 'signInWithPassword', args });
    if (!args.email || !args.password) {
      return { data: { user: null, session: null }, error: { message: 'Invalid credentials', code: 'invalid_credentials' } };
    }
    const session: FakeSession = {
      access_token: 'fake_jwt_token',
      refresh_token: 'fake_refresh_token',
      user: { id: 'u_fake_id', email: args.email.toLowerCase().trim() },
    };
    this.setSession(session, 'SIGNED_IN');
    return { data: { user: session.user, session }, error: null };
  }

  async signOut() {
    this.calls.push({ fn: 'signOut', args: {} });
    this.setSession(null, 'SIGNED_OUT');
    return { error: null };
  }

  onAuthStateChange(callback: (event: string, session: FakeSession | null) => void) {
    this.listeners.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter((l) => l !== callback);
          },
        },
      },
    };
  }
}

