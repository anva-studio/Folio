// Money utilities.
//
// INVARIANT: every stored amount is an INTEGER number of minor units
// (e.g. paise for INR). No floating-point arithmetic is ever applied to
// stored amounts, and every helper here asserts that contract at runtime.
//
// Formatting and parsing are exact string operations: "12,34,567.89" ->
// 123456789 -> "12,34,567.89" round-trips without loss.

import type { CurrencyConfig } from './types';

export interface CurrencyFormat {
  symbol: string;
  minorDigits: number;
  indianGrouping: boolean;
}

export function isMinorUnits(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

/** Throws unless `v` is a safe integer; returns `v` unchanged. */
export function assertMinorUnits(v: number, label = 'amount'): number {
  if (!Number.isSafeInteger(v)) {
    throw new TypeError(`${label} must be an integer number of minor units (got ${v})`);
  }
  return v;
}

function mulSafe(a: number, b: number, label: string): number {
  const r = a * b;
  if (!Number.isSafeInteger(r)) throw new RangeError(`${label} would exceed safe integer range`);
  return r;
}

/** Exact integer addition (rejects non-integer inputs or overflow). */
export function addMinor(a: number, b: number): number {
  const r = assertMinorUnits(a, 'a') + assertMinorUnits(b, 'b');
  if (!Number.isSafeInteger(r)) throw new RangeError('a + b would exceed safe integer range');
  return r;
}

/** Exact integer subtraction (rejects non-integer inputs or overflow). */
export function subMinor(a: number, b: number): number {
  const r = assertMinorUnits(a, 'a') - assertMinorUnits(b, 'b');
  if (!Number.isSafeInteger(r)) throw new RangeError('a - b would exceed safe integer range');
  return r;
}

/** Multiply a minor-unit amount by an integer count (e.g. 3 occurrences of an EMI). */
export function mulMinor(minor: number, n: number): number {
  assertMinorUnits(minor, 'amount');
  if (!Number.isSafeInteger(n)) throw new RangeError('multiplier must be an integer');
  return mulSafe(minor, n, 'amount * n');
}

/** Sum a list of minor-unit amounts exactly (rejects overflow). */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total = addMinor(total, v);
  return total;
}

/**
 * Parse a user-typed decimal string into integer minor units.
 *
 * Accepts optional thousands separators in Indian ("1,23,456") or Western
 * ("1,234,567") grouping, an optional leading sign, and (when given) one
 * currency symbol before or after the amount, in either order with the
 * sign ("-₹50" and "₹-50" both work).
 *
 * Rejects input with more decimal places than `minorDigits` (e.g. "1.123"
 * for a 2-digit currency) rather than silently rounding — exactness over
 * convenience.
 */
export function parseAmountToMinor(
  input: string,
  opts: { minorDigits: number; symbol?: string },
): number {
  if (!Number.isSafeInteger(opts.minorDigits) || opts.minorDigits < 0 || opts.minorDigits > 6) {
    throw new RangeError('minorDigits must be 0..6');
  }
  if (typeof input !== 'string') throw new TypeError('input must be a string');

  let s = input.trim();
  if (s === '') throw new RangeError('amount is empty');
  let sign = 1;
  if (opts.symbol && opts.symbol.length > 0) {
    // The currency symbol may appear before or after a leading sign:
    // "₹50", "-₹50", "₹-50" and "50₹" are all accepted; more than one
    // symbol anywhere is rejected.
    let symbols = 0;
    if (s.startsWith(opts.symbol)) {
      s = s.slice(opts.symbol.length);
      symbols++;
    }
    if (s[0] === '-') {
      sign = -1;
      s = s.slice(1);
    } else if (s[0] === '+') {
      s = s.slice(1);
    }
    if (s.startsWith(opts.symbol)) {
      s = s.slice(opts.symbol.length);
      symbols++;
    } else if (s.endsWith(opts.symbol)) {
      s = s.slice(0, s.length - opts.symbol.length);
      symbols++;
    }
    if (symbols > 1) throw new RangeError(`invalid amount: ${input}`);
    s = s.trim();
  } else {
    if (s[0] === '-') {
      sign = -1;
      s = s.slice(1);
    } else if (s[0] === '+') {
      s = s.slice(1);
    }
    s = s.trim();
  }

  const dot = s.indexOf('.');
  const intPart = dot === -1 ? s : s.slice(0, dot);
  const fracPart = dot === -1 ? '' : s.slice(dot + 1);

  const grouped = /^(?:\d{1,3}(?:,\d{2})*(?:,\d{3})?|\d{1,3}(?:,\d{3})*|\d+)$/;
  if (!grouped.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new RangeError(`invalid amount: ${input}`);
  }
  // Canonical grouping: when commas are present, the final group must be
  // exactly 3 digits (Indian "1,23,456" / Western "1,234,567").
  if (intPart.includes(',') && !/,\d{3}$/.test(intPart)) {
    throw new RangeError(`invalid amount: ${input}`);
  }

  if (fracPart.length > opts.minorDigits) {
    throw new RangeError(
      `amount has more than ${opts.minorDigits} decimal place(s); refusing to round: ${input}`,
    );
  }

  const base = 10 ** opts.minorDigits;
  const major = intPart.length === 0 ? 0 : Number(intPart.replace(/,/g, ''));
  const frac = fracPart.length === 0
    ? 0
    : Number(fracPart.padEnd(opts.minorDigits, '0'));
  const value = mulSafe(major, base, 'major part') + frac;

  return sign * value;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

function groupWestern(digits: string): string {
  const parts: string[] = [];
  let d = digits;
  while (d.length > 3) {
    parts.unshift(d.slice(-3));
    d = d.slice(0, -3);
  }
  if (d.length > 0) parts.unshift(d);
  return parts.join(',');
}

/**
 * Format integer minor units for display. Exact: no rounding, no float math.
 * e.g. 12345678 -> "₹1,23,456.78" (Indian grouping) or "$123,456.78".
 */
export function formatMinor(
  minor: number,
  cfg: CurrencyFormat,
  opts: { symbolPosition?: 'prefix' | 'suffix' } = {},
): string {
  assertMinorUnits(minor, 'amount');
  if (!Number.isSafeInteger(cfg.minorDigits) || cfg.minorDigits < 0) {
    throw new RangeError('minorDigits must be >= 0');
  }
  const neg = minor < 0;
  const base = 10 ** cfg.minorDigits;
  const abs = Math.abs(minor);
  const major = Math.floor(abs / base);
  const frac = abs % base;

  const digits = String(major);
  const grouped = cfg.indianGrouping ? groupIndian(digits) : groupWestern(digits);
  const body =
    cfg.minorDigits === 0
      ? grouped
      : grouped + '.' + String(frac).padStart(cfg.minorDigits, '0');
  const sign = neg ? '-' : '';

  const pos = opts.symbolPosition ?? 'prefix';
  return pos === 'prefix'
    ? `${sign}${cfg.symbol}${body}`
    : `${sign}${body}${cfg.symbol}`;
}

/**
 * Exact rational scaling of a minor-unit amount: result = minor * num / den,
 * rounded HALF AWAY FROM ZERO to the nearest minor unit.
 * num/den are plain integers (e.g. monthly rate = annualPctNum / (12 * 100 * pctDen)).
 *
 * This is the safe primitive for interest and growth math: the division is
 * performed once on exact integers instead of on binary floats.
 */
export function scaleMinor(minor: number, num: number, den: number): number {
  assertMinorUnits(minor, 'amount');
  if (!Number.isSafeInteger(num) || num < 0) throw new RangeError('num must be a non-negative integer');
  if (!Number.isSafeInteger(den) || den <= 0) throw new RangeError('den must be a positive integer');
  const a = Math.abs(minor);
  if (a * num > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('scaleMinor would exceed safe integer range');
  }
  const q = Math.floor((a * num) / den);
  const r = (a * num) % den;
  const rounded = 2 * r >= den ? q + 1 : q;
  return minor < 0 ? -rounded : rounded;
}

/**
 * Convert a percentage number (e.g. 12.5) into an exact integer fraction
 * { num: 125, den: 10 } using its shortest decimal string form.
 * Use with scaleMinor to avoid binary-float drift in rate math.
 */
export function pctToFraction(pct: number): { num: number; den: number } {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) {
    throw new TypeError('pct must be a finite number');
  }
  if (pct < 0) throw new RangeError('pct must be >= 0');
  const s = String(pct);
  if (s.includes('e') || s.includes('E')) {
    throw new RangeError('pct uses scientific notation; use a plain decimal number');
  }
  const dot = s.indexOf('.');
  if (dot === -1) return { num: Number(s), den: 1 };
  const num = Number(s.slice(0, dot) + s.slice(dot + 1));
  const den = 10 ** (s.length - dot - 1);
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) {
    throw new RangeError('pct is too large to represent exactly');
  }
  return { num, den };
}

/** INR-style default currency used across the app unless the user changes it. */
export const INR: CurrencyFormat = { symbol: '₹', minorDigits: 2, indianGrouping: true };

export type { CurrencyConfig };
