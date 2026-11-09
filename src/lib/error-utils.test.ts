// src/lib/error-utils.test.ts
// Unit tests for Error Handling & User-Facing Message Normalization (Section 4.37)
import { describe, it, expect } from 'vitest';
import { formatFriendlyError } from './error-utils';

describe('Error Handling & Friendly Message Normalization (Section 4.37)', () => {
  it('maps PostgREST 22P02 (invalid UUID) to a safe user message', () => {
    const err = { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' };
    const msg = formatFriendlyError(err);
    expect(msg).toBe('Invalid ID or format provided.');
    expect(msg).not.toContain('22P02');
    expect(msg).not.toContain('uuid');
  });

  it('maps PostgREST 23505 (unique violation / duplicate key)', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const msg = formatFriendlyError(err);
    expect(msg).toBe('This record already exists in the system.');
  });

  it('maps PostgREST 23503 (foreign key violation)', () => {
    const err = { code: '23503', message: 'update or delete on table "units" violates foreign key constraint' };
    const msg = formatFriendlyError(err);
    expect(msg).toBe('Cannot complete this action because other records are linked to this item.');
  });

  it('maps network timeout and connection refused errors', () => {
    expect(formatFriendlyError(new Error('Network request failed'))).toBe(
      'Network connection issue. Please check your internet connection.'
    );
    expect(formatFriendlyError(new Error('Connection timeout after 10000ms'))).toBe(
      'Network connection issue. Please check your internet connection.'
    );
  });

  it('maps rate limit and lockout errors', () => {
    expect(formatFriendlyError({ message: 'too many requests' })).toBe(
      'Too many attempts. Please wait a few moments before trying again.'
    );
    expect(formatFriendlyError({ message: 'profile locked_until 2026-10-15' })).toBe(
      'This profile is temporarily locked due to repeated incorrect attempts. Please wait a few minutes.'
    );
  });

  it('maps permission and role denial errors', () => {
    expect(formatFriendlyError({ message: 'permission denied for table shifts' })).toBe(
      'Permission denied. Only the property owner is authorized for this action.'
    );
  });

  it('maps invalid or expired invite code errors', () => {
    expect(formatFriendlyError({ message: 'invalid or expired invite code' })).toBe(
      'The invite code entered is invalid or has expired. Please ask your property manager for a new code.'
    );
  });

  it('suppresses internal SQL / Postgres stack traces from being exposed to the user', () => {
    const technicalErr = {
      message: 'SELECT * FROM public.stays WHERE id = 123 relation does not exist column error',
      stack: 'Error: at Query.run (/postgres/driver.js:42:10)',
    };

    const msg = formatFriendlyError(technicalErr);
    expect(msg).not.toContain('public.stays');
    expect(msg).not.toContain('postgres');
    expect(msg).not.toContain('driver.js');
    expect(msg).toBe('Unable to complete this action. Please try again.');
  });

  it('passes through short safe user-friendly messages', () => {
    const friendlyErr = { message: 'Bed is currently occupied by another guest.' };
    expect(formatFriendlyError(friendlyErr)).toBe('Bed is currently occupied by another guest.');
  });

  it('returns fallback message for empty or null error inputs', () => {
    expect(formatFriendlyError(null)).toBe('Unable to complete this action. Please try again.');
    expect(formatFriendlyError(undefined)).toBe('Unable to complete this action. Please try again.');
  });
});

