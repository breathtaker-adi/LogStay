// src/lib/crypto-utils.ts
// Pure cryptographic hashing functions for PINs and secrets

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// NIST SP 800-63B compliant PBKDF2 iterations for SHA-256 (remediated from 2048)
export const PBKDF2_ROUNDS = 600_000;

export function hashPinWithSalt(pin: string, salt: string, rounds: number = PBKDF2_ROUNDS): string {
  const derived = pbkdf2(sha256, pin, salt, { c: rounds, dkLen: 32 });
  return `pbkdf2$${rounds}$${bytesToHex(derived)}`;
}

