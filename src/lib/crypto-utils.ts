// src/lib/crypto-utils.ts
// Pure cryptographic hashing functions for PINs and secrets

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const PBKDF2_ROUNDS = 2048;

export function hashPinWithSalt(pin: string, salt: string, rounds: number = PBKDF2_ROUNDS): string {
  const derived = pbkdf2(sha256, pin, salt, { c: rounds, dkLen: 32 });
  return `pbkdf2$${rounds}$${bytesToHex(derived)}`;
}

