/**
 * Utility to convert raw database and network errors into clean, friendly, 
 * safe messages for end-users, preventing internal technical leakages.
 */

export function formatFriendlyError(
  err: any,
  fallbackMessage: string = 'Unable to complete this action. Please try again.'
): string {
  if (!err) return fallbackMessage;

  const raw = typeof err === 'string' 
    ? err 
    : (err?.message || err?.error_description || err?.details || String(err));
  const lower = raw.toLowerCase();

  // Missing or out-of-sync RPC / Schema cache in Supabase
  if (
    lower.includes('schema cache') ||
    lower.includes('function public.') ||
    lower.includes('pgrst202') ||
    lower.includes('could not find the function')
  ) {
    return 'Database setup is required. The update script for this action has not been run in Supabase SQL editor yet.';
  }

  // Auth / Credentials
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_grant') ||
    lower.includes('invalid password') ||
    lower.includes('wrong password') ||
    lower.includes('credentials')
  ) {
    return 'The account password you entered is incorrect. Please try again.';
  }

  // Network / Connection
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('connection refused')
  ) {
    return 'Network connection issue. Please check your internet connection.';
  }

  // Lockout / Rate limit
  if (lower.includes('locked') || lower.includes('locked_until')) {
    return 'This profile is temporarily locked due to repeated incorrect attempts. Please wait a few minutes.';
  }

  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a few moments before trying again.';
  }

  // PIN validation
  if (lower.includes('pin must be at least 4') || lower.includes('invalid pin')) {
    return 'PIN must be at least 4 digits.';
  }

  if (lower.includes('incorrect current pin') || lower.includes('incorrect pin') || lower.includes('verify_owner_pin')) {
    return 'The PIN you entered is incorrect.';
  }

  // Permissions / Access
  if (
    lower.includes('only the verified property owner') ||
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('require_role')
  ) {
    return 'Permission denied. Only the property owner is authorized for this action.';
  }

  // Invite & Join Code
  if (lower.includes('invalid or expired invite code') || lower.includes('invite code') || lower.includes('invalid code')) {
    return 'The invite code entered is invalid or has expired. Please ask your property manager for a new code.';
  }

  // Hierarchy & Removal Rules
  if (lower.includes('owner is supreme') || lower.includes('cannot be removed')) {
    return 'The Property Owner has supreme authority and cannot be removed.';
  }

  if (lower.includes('only be removed by the property owner') || lower.includes('co-admin can only be removed')) {
    return 'Co-Admins can only be removed by the property Owner.';
  }

  if (lower.includes('cannot remove yourself')) {
    return 'You cannot remove yourself from the active team.';
  }

  // Foreign keys
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Cannot complete this action because other records are linked to this item.';
  }

  // Safe user-friendly message passthrough if short and devoid of tech jargon
  if (
    typeof err?.message === 'string' &&
    err.message.length > 0 &&
    err.message.length < 80 &&
    !lower.includes('public.') &&
    !lower.includes('uuid') &&
    !lower.includes('sql') &&
    !lower.includes('postgres') &&
    !lower.includes('pgrst') &&
    !lower.includes('column') &&
    !lower.includes('relation')
  ) {
    return err.message;
  }

  return fallbackMessage;
}
