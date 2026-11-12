// src/lib/id-ocr.ts
// Pure ID & Passport OCR text post-processing, MRZ recovery, and field extraction.
// Designed to stay offline-only with zero native dependencies for deterministic unit testing.

import { COUNTRIES } from './countries';
import {
  extractAndParseMRZ,
  parseTD3,
  ParsedMRZ,
  resolveCountryFromICAO,
} from './mrz';

export type OcrDocSource =
  | 'mrz'
  | 'visual_passport'
  | 'aadhaar'
  | 'driving_license'
  | 'voter_id'
  | 'generic'
  | 'none';

export type DetectedIdType =
  | 'Passport'
  | 'Aadhaar'
  | 'Driving License'
  | 'Voter ID'
  | 'Citizenship Card';

export interface MatchedCountry {
  name: string;
  flag: string;
  formC: boolean;
}

export interface IdOcrResult {
  detected: boolean;
  source: OcrDocSource;
  verifiedMrz: boolean;
  fullName?: string;
  idType?: DetectedIdType;
  idLast4?: string;
  passportNo?: string;
  gender?: 'male' | 'female';
  nationality?: string;
  nationalityFlag?: string;
  mrzL1?: string;
  mrzL2?: string;
  mrzParsed?: ParsedMRZ;
  rawTextPreview: string;
  extractedFieldsSummary: string[];
}

const NOISE_HEADER_RE =
  /^(government|govt|republic|unique identification|uidai|authority|india|bharat|aadhaar|mera|election|commission|income tax|department|permanent account|driving licen|transport|passport|nationality|surname|given name|date of|issue|expiry|sex|male|female|address|father|husband|wife|son of|daughter of|dob|yob|year of birth|vid\b|pin\b)/i;

/**
 * Matches an ICAO 3-letter code and/or country name against LogStay's COUNTRIES table.
 */
export function matchCountryOption(
  code?: string | null,
  nameHint?: string | null
): MatchedCountry | null {
  const cleanCode = (code || '').trim().toLowerCase();
  const cleanName = (nameHint || '').trim().toLowerCase();

  if (cleanCode) {
    const byAlias = COUNTRIES.find((c) =>
      c.aliases.some((a) => a.toLowerCase() === cleanCode)
    );
    if (byAlias) {
      return { name: byAlias.name, flag: byAlias.flag, formC: byAlias.formC };
    }
  }

  const resolved = code ? resolveCountryFromICAO(code) : '';
  const targets = [cleanName, resolved.toLowerCase()].filter(Boolean);

  for (const target of targets) {
    const exact = COUNTRIES.find((c) => c.name.toLowerCase() === target);
    if (exact) {
      return { name: exact.name, flag: exact.flag, formC: exact.formC };
    }
    const partial = COUNTRIES.find(
      (c) =>
        c.name.toLowerCase().includes(target) ||
        target.includes(c.name.toLowerCase()) ||
        c.aliases.some((a) => a.toLowerCase() === target)
    );
    if (partial) {
      return { name: partial.name, flag: partial.flag, formC: partial.formC };
    }
  }

  if (resolved && !resolved.startsWith('Unknown')) {
    return {
      name: resolved,
      flag: '📘',
      formC: resolved !== 'India' && resolved !== 'Nepal' && resolved !== 'Bhutan',
    };
  }
  return null;
}

/** Normalize OCR text blocks into trimmed single lines. */
export function expandOcrLines(rawLines: string[]): string[] {
  const out: string[] = [];
  for (const block of rawLines) {
    if (!block) continue;
    const parts = block.split(/\r?\n/);
    for (const part of parts) {
      const trimmed = part.replace(/\s+/g, ' ').trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function normalizeMrzChars(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹＜《〈]/g, '<')
    .replace(/[»›＞》〉]/g, '<')
    .replace(/\s+/g, '');
}

const OCR_DIGIT_MAP: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

const OCR_ALPHA_MAP: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '5': 'S',
  '6': 'G',
  '8': 'B',
};

/**
 * Repairs OCR homoglyphs at strictly numeric/alphabetic fixed TD3 positions on Line 2.
 * Always followed by full Modulo-10 verification so repairs are mathematically validated.
 */
function repairTd3Line2(
  line2Raw: string,
  passportMode: 'none' | 'o_zero' | 'all_digits' = 'none'
): string {
  const chars = line2Raw.slice(0, 44).padEnd(44, '<').split('');
  const numericIndices = [
    9,
    13, 14, 15, 16, 17, 18, 19,
    21, 22, 23, 24, 25, 26, 27,
    43,
  ];
  for (const idx of numericIndices) {
    const ch = chars[idx];
    if (ch && OCR_DIGIT_MAP[ch]) {
      chars[idx] = OCR_DIGIT_MAP[ch];
    }
  }
  if (passportMode === 'o_zero') {
    for (let idx = 0; idx <= 8; idx++) {
      if (chars[idx] === 'O' || chars[idx] === 'Q') chars[idx] = '0';
    }
  } else if (passportMode === 'all_digits') {
    for (let idx = 0; idx <= 8; idx++) {
      const ch = chars[idx];
      if (ch && OCR_DIGIT_MAP[ch]) chars[idx] = OCR_DIGIT_MAP[ch];
    }
  }
  for (const idx of [10, 11, 12]) {
    const ch = chars[idx];
    if (ch && OCR_ALPHA_MAP[ch]) {
      chars[idx] = OCR_ALPHA_MAP[ch];
    }
  }
  return chars.join('');
}

function padTd3Line(raw: string): string {
  const clean = normalizeMrzChars(raw);
  if (clean.length === 44) return clean;
  if (clean.length > 44) return clean.slice(0, 44);
  return clean.padEnd(44, '<');
}

export interface RecoveredMrz {
  line1: string;
  line2: string;
  parsed: ParsedMRZ;
}

/**
 * Attempts to recover and verify a 2-line TD3 Passport MRZ from noisy camera OCR blocks.
 * Prioritizes pairs where Modulo-10 ICAO checksums pass completely (`ok === true`).
 */
export function extractPassportMrzWithRecovery(rawLines: string[]): RecoveredMrz | null {
  const flatLines = expandOcrLines(rawLines);
  if (flatLines.length === 0) return null;

  // 1. Direct normalized candidate pool (including adjacent block concatenation for wrapped lines)
  const pool: string[] = [];
  for (let i = 0; i < flatLines.length; i++) {
    const norm = normalizeMrzChars(flatLines[i]);
    if (norm.length >= 10) pool.push(norm);
    if (i + 1 < flatLines.length) {
      const nextNorm = normalizeMrzChars(flatLines[i + 1]);
      if (norm.length < 44 && nextNorm.length < 44 && norm.length + nextNorm.length <= 52) {
        pool.push(norm + nextNorm);
      }
    }
  }

  // Filter likely MRZ candidates: allow short P<...<<... lines (cropped trailing '<') or >=24-char line 2s
  const candidates = pool.filter(
    (s) =>
      /^[A-Z0-9<]+$/.test(s) &&
      ((/^P[A-Z<][A-Z<]{3}/.test(s) && s.includes('<<') && s.length >= 10) ||
        (s.length >= 24 && (s.includes('<') || /\d{6}/.test(s))))
  );

  // Fast path: check existing extractor on normalized pool
  const direct = extractAndParseMRZ(candidates);
  const line1Starts = candidates.filter((c) => /^P[A-Z<][A-Z<]{3}/.test(c) && c.includes('<<'));
  const line2Likes = candidates.filter((c) => !/^P[A-Z<]/.test(c) && /\d{6}/.test(c));

  let bestUnverified: RecoveredMrz | null = null;

  // Try ordered pairs: line1 (P<...) followed by line2-like candidate
  for (const l1Raw of line1Starts) {
    const l1 = padTd3Line(l1Raw);
    for (const l2Raw of line2Likes) {
      if (l1Raw === l2Raw) continue;
      const l2 = padTd3Line(l2Raw);

      const exact = parseTD3(l1, l2);
      if (exact?.ok) {
        return { line1: l1, line2: l2, parsed: exact };
      }

      const repairedL2 = repairTd3Line2(l2, 'none');
      const repaired = parseTD3(l1, repairedL2);
      if (repaired?.ok) {
        return { line1: l1, line2: repairedL2, parsed: repaired };
      }

      // Secondary passes: repair O->0 (preserves leading B/S/G/Z letters) then full digit homoglyphs
      for (const mode of ['o_zero', 'all_digits'] as const) {
        const repairedWithNumL2 = repairTd3Line2(l2, mode);
        const repairedWithNum = parseTD3(l1, repairedWithNumL2);
        if (repairedWithNum?.ok) {
          return { line1: l1, line2: repairedWithNumL2, parsed: repairedWithNum };
        }
      }

      if (!bestUnverified && (repaired || exact)) {
        const chosenL2 = repaired || exact;
        if (chosenL2) {
          bestUnverified = {
            line1: l1,
            line2: repaired ? repairedL2 : l2,
            parsed: chosenL2,
          };
        }
      }
    }
  }

  // Fallback to adjacent `<` candidates if line1 prefix didn't strictly match
  if (direct?.ok) {
    const chevrons = candidates.filter((c) => c.includes('<') && c.length >= 30);
    if (chevrons.length >= 2) {
      return {
        line1: padTd3Line(chevrons[0]),
        line2: padTd3Line(chevrons[1]),
        parsed: direct,
      };
    }
  }

  return bestUnverified;
}

function detectGenderFromText(text: string): 'male' | 'female' | undefined {
  // Check FEMALE before MALE so substring overlap cannot happen
  if (/\bfemale\b|\bsex\s*[:/-]?\s*f\b/i.test(text)) return 'female';
  if (/\bmale\b|\bsex\s*[:/-]?\s*m\b/i.test(text)) return 'male';
  return undefined;
}

function extractLabeledValue(lines: string[], labelRe: RegExp): string | undefined {
  // Strip trailing '$' anchor from whole-line label regex so inline `Label: Value` matches cleanly
  const prefixSource = labelRe.source.replace(/\$$/, '');
  const inlineRe = new RegExp(`${prefixSource}\\s*[:/-]+\\s*(.+)$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineMatch = line.match(inlineRe);
    if (inlineMatch?.[1]) {
      const val = inlineMatch[1].trim();
      if (val.length >= 2 && !NOISE_HEADER_RE.test(val)) return val;
    }
    if (labelRe.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (next.length >= 2 && !NOISE_HEADER_RE.test(next)) return next;
    }
  }
  return undefined;
}

function cleanPersonName(raw: string): string {
  return raw
    .replace(/[^A-Za-z.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNameHeuristic(lines: string[], isIndianDoc: boolean): string | undefined {
  // 1. Explicit labels (Name, Surname + Given Name)
  const surname = extractLabeledValue(lines, /^(?:surname|last name)$/i);
  const given = extractLabeledValue(lines, /^(?:given name|given names|first name)$/i);
  if (surname && given) {
    return cleanPersonName(`${given} ${surname}`);
  }

  const labeledName = extractLabeledValue(lines, /^(?:name|full name|holder name)$/i);
  if (labeledName) {
    const cleaned = cleanPersonName(labeledName);
    if (cleaned.length >= 3) return cleaned;
  }

  // 2. Aadhaar / ID convention: name often precedes DOB / YOB / Gender / Father line
  if (isIndianDoc) {
    for (let i = 1; i < lines.length; i++) {
      if (/(?:\bDOB\b|Year of Birth|\bYOB\b|\bMale\b|\bFemale\b|S\/O|D\/O|W\/O|C\/O)/i.test(lines[i])) {
        // Scan up to 2 lines above for a plausible name
        for (let back = 1; back <= 2 && i - back >= 0; back++) {
          const cand = lines[i - back];
          if (
            !NOISE_HEADER_RE.test(cand) &&
            !/\d/.test(cand) &&
            /^[A-Za-z][A-Za-z.\s'-]{2,45}$/.test(cand)
          ) {
            const cleaned = cleanPersonName(cand);
            if (cleaned.split(' ').length >= 1 && cleaned.length >= 3) {
              return cleaned;
            }
          }
        }
      }
    }
  }

  // 3. Fallback: first clean multi-word alphabetic line not matching card boilerplate
  for (const line of lines) {
    if (
      !NOISE_HEADER_RE.test(line) &&
      !/\d/.test(line) &&
      !/<</.test(line) &&
      /^[A-Za-z][A-Za-z.\s'-]{3,45}$/.test(line)
    ) {
      const words = line.trim().split(/\s+/);
      if (words.length >= 2 && words.length <= 5) {
        return cleanPersonName(line);
      }
    }
  }

  return undefined;
}

/**
 * Parses recognized OCR lines from any Guest ID / Passport image into structured LogStay check-in fields.
 */
export function parseIdScanLines(
  rawLines: string[],
  preferredDocType?: string
): IdOcrResult {
  const lines = expandOcrLines(rawLines);
  const fullText = lines.join('\n');

  if (lines.length === 0) {
    return {
      detected: false,
      source: 'none',
      verifiedMrz: false,
      rawTextPreview: '',
      extractedFieldsSummary: [],
    };
  }

  // ── 1. Highest Precision: Passport TD3 Machine Readable Zone (MRZ) ────
  const mrzMatch = extractPassportMrzWithRecovery(lines);
  if (mrzMatch?.parsed.ok) {
    const p = mrzMatch.parsed;
    const country = matchCountryOption(p.nationalityCode, p.nationalityName);
    const summary: string[] = [];
    if (p.fullName) summary.push(`Name: ${p.fullName}`);
    if (p.passportNo) summary.push(`Passport: ${p.passportNo}`);
    if (country) summary.push(`Nationality: ${country.name}`);

    return {
      detected: true,
      source: 'mrz',
      verifiedMrz: true,
      fullName: p.fullName || undefined,
      idType: 'Passport',
      idLast4: p.passportNo ? p.passportNo.slice(-4) : undefined,
      passportNo: p.passportNo || undefined,
      gender: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : undefined,
      nationality: country?.name || p.nationalityName || undefined,
      nationalityFlag: country?.flag || '📘',
      mrzL1: mrzMatch.line1,
      mrzL2: mrzMatch.line2,
      mrzParsed: p,
      rawTextPreview: lines.slice(0, 6).join('\n'),
      extractedFieldsSummary: summary,
    };
  }

  const upperText = fullText.toUpperCase();

  // ── 2. Indian Aadhaar Card (never retains full 12-digit UID, only last 4) ─
  // Avoid matching 16-digit Aadhaar VID numbers by rejecting 4 groups of 4
  const aadhaarHint =
    /AADHAAR|UNIQUE IDENTIFICATION|UIDAI|MERA AADHAAR|GOVERNMENT OF INDIA/i.test(upperText);
  const vidMatch = upperText.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
  const cleanedForAadhaar = vidMatch ? upperText.replace(vidMatch[0], '') : upperText;
  const aadhaarMatch = cleanedForAadhaar.match(/\b([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})\b/);

  if (aadhaarMatch && (aadhaarHint || preferredDocType === 'Aadhaar' || !/PASSPORT/i.test(upperText))) {
    const idLast4 = aadhaarMatch[3];
    const fullName = extractNameHeuristic(lines, true);
    const gender = detectGenderFromText(fullText);
    const summary = [`Aadhaar •••• ${idLast4}`];
    if (fullName) summary.unshift(`Name: ${fullName}`);

    return {
      detected: true,
      source: 'aadhaar',
      verifiedMrz: false,
      fullName,
      idType: 'Aadhaar',
      idLast4,
      gender,
      nationality: 'India',
      nationalityFlag: '🇮🇳',
      rawTextPreview: lines.slice(0, 6).join('\n'),
      extractedFieldsSummary: summary,
    };
  }

  // ── 3. Indian Driving License ───────────────────────────────────────────
  const dlMatch = upperText.match(/\b([A-Z]{2})[-\s]?(\d{2})[-\s]?((?:19|20)\d{2})[-\s]?(\d{6,7})\b/);
  if (dlMatch || /DRIVING LICEN|UNION OF INDIA|TRANSPORT DEPARTMENT/i.test(upperText)) {
    const digits = dlMatch ? dlMatch[4] : undefined;
    const idLast4 = digits ? digits.slice(-4) : undefined;
    const fullName = extractNameHeuristic(lines, true);
    const gender = detectGenderFromText(fullText);
    const summary: string[] = [];
    if (fullName) summary.push(`Name: ${fullName}`);
    if (idLast4) summary.push(`DL •••• ${idLast4}`);

    if (idLast4 || fullName) {
      return {
        detected: true,
        source: 'driving_license',
        verifiedMrz: false,
        fullName,
        idType: 'Driving License',
        idLast4,
        gender,
        nationality: 'India',
        nationalityFlag: '🇮🇳',
        rawTextPreview: lines.slice(0, 6).join('\n'),
        extractedFieldsSummary: summary,
      };
    }
  }

  // ── 4. Indian Voter ID (EPIC) ───────────────────────────────────────────
  const epicMatch = upperText.match(/\b([A-Z]{3}\d{7})\b/);
  if (epicMatch && (/ELECTION COMMISSION|ELECTOR|VOTER|IDENTITY CARD/i.test(upperText) || preferredDocType === 'Voter ID')) {
    const idLast4 = epicMatch[1].slice(-4);
    const fullName = extractNameHeuristic(lines, true);
    const gender = detectGenderFromText(fullText);
    const summary = [`Voter ID •••• ${idLast4}`];
    if (fullName) summary.unshift(`Name: ${fullName}`);

    return {
      detected: true,
      source: 'voter_id',
      verifiedMrz: false,
      fullName,
      idType: 'Voter ID',
      idLast4,
      gender,
      nationality: 'India',
      nationalityFlag: '🇮🇳',
      rawTextPreview: lines.slice(0, 6).join('\n'),
      extractedFieldsSummary: summary,
    };
  }

  // ── 5. Passport Visual Zone Fallback (e.g. if MRZ was partially occluded) ──
  const looksPassport =
    /PASSPORT|REPUBLIC OF|SURNAME|GIVEN NAME/i.test(upperText) ||
    Boolean(mrzMatch) ||
    preferredDocType === 'Passport';

  if (looksPassport) {
    const mrzPartial = mrzMatch?.parsed;
    const visualPassportMatch =
      extractLabeledValue(lines, /passport\s*(?:no|number|#)?/i)?.match(/\b([A-Z]{1,2}\d{6,8}|[A-Z]\d{7}|[A-Z0-9]{7,9})\b/i) ||
      upperText.match(/\b([A-Z]\d{7})\b/);

    const passportNo = mrzPartial?.passportNo || visualPassportMatch?.[1]?.toUpperCase();
    const fullName = mrzPartial?.fullName || extractNameHeuristic(lines, false);
    const country = mrzPartial?.nationalityCode
      ? matchCountryOption(mrzPartial.nationalityCode, mrzPartial.nationalityName)
      : /REPUBLIC OF INDIA/i.test(upperText)
        ? matchCountryOption('IND', 'India')
        : null;
    const gender = mrzPartial?.sex === 'F'
      ? 'female'
      : mrzPartial?.sex === 'M'
        ? 'male'
        : detectGenderFromText(fullText);

    const summary: string[] = [];
    if (fullName) summary.push(`Name: ${fullName}`);
    if (passportNo) summary.push(`Passport: ${passportNo}`);
    if (country) summary.push(`Nationality: ${country.name}`);

    if (passportNo || fullName || mrzMatch) {
      return {
        detected: true,
        source: 'visual_passport',
        verifiedMrz: false,
        fullName,
        idType: 'Passport',
        idLast4: passportNo ? passportNo.slice(-4) : undefined,
        passportNo,
        gender,
        nationality: country?.name,
        nationalityFlag: country?.flag,
        mrzL1: mrzMatch?.line1,
        mrzL2: mrzMatch?.line2,
        mrzParsed: mrzPartial,
        rawTextPreview: lines.slice(0, 6).join('\n'),
        extractedFieldsSummary: summary,
      };
    }
  }

  // ── 6. Generic ID fallback (partial name / trailing digits) ─────────────
  const genericName = extractNameHeuristic(lines, false);
  const genericGender = detectGenderFromText(fullText);
  const trailingDigitsMatch = upperText.match(/\b[A-Z0-9]{4,14}(\d{4})\b/);
  const genericLast4 = trailingDigitsMatch?.[1];

  if (genericName || genericLast4) {
    const summary: string[] = [];
    if (genericName) summary.push(`Name: ${genericName}`);
    if (genericLast4) summary.push(`ID •••• ${genericLast4}`);
    return {
      detected: true,
      source: 'generic',
      verifiedMrz: false,
      fullName: genericName,
      idLast4: genericLast4,
      gender: genericGender,
      rawTextPreview: lines.slice(0, 6).join('\n'),
      extractedFieldsSummary: summary,
    };
  }

  return {
    detected: false,
    source: 'none',
    verifiedMrz: false,
    rawTextPreview: lines.slice(0, 6).join('\n'),
    extractedFieldsSummary: [],
  };
}
