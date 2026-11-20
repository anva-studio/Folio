// Small calendar helpers over 'YYYY-MM-DD' dates and 'YYYY-MM' month keys.
// All calendar math uses UTC so results never depend on the host timezone.

export function isValidMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function daysInCalendarMonth(year: number, month1to12: number): number {
  if (month1to12 < 1 || month1to12 > 12) throw new RangeError('month must be 1..12');
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInCalendarMonth(y, mo);
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' (caller is responsible for a well-formed date). */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function monthIndex(mk: string): number {
  const [y, m] = mk.split('-').map(Number);
  return y * 12 + (m - 1);
}

function monthKeyFromIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function addMonths(mk: string, n: number): string {
  return monthKeyFromIndex(monthIndex(mk) + n);
}

/** Non-negative whole months from one month key to a later one. */
export function monthsBetween(fromMonthKey: string, toMonthKey: string): number {
  return Math.max(0, monthIndex(toMonthKey) - monthIndex(fromMonthKey));
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
