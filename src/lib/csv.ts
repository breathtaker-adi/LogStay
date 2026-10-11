/**
 * CSV Formula Sanitizer (OWASP M4 / A03 CSV Injection Defense)
 * Neutralizes active cell prefixes (=, +, -, @, tab, CR) by prepending a single quote,
 * while allowing legitimate international phone numbers with leading '+' to remain readable.
 */
export const csvCell = (v: unknown, isPhone = false): string => {
  let s = String(v ?? '');
  const safePhone = isPhone && /^\+?[0-9 ()-]+$/.test(s);
  if (!safePhone && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralize =,+,-,@,tab
  return '"' + s.replace(/"/g, '""') + '"';
};
