import type { CurrencyConfig } from './types';
import { assertMinorUnits, formatMinor, parseAmountToMinor } from './money';
export function checkedLocale(locale: string): string {
    if (locale.length > 80 || !Intl.NumberFormat.supportedLocalesOf([locale]).length)
        throw new Error('Unsupported regional format');
    return Intl.getCanonicalLocales(locale)[0];
}
function numberFormat(c: CurrencyConfig) { return new Intl.NumberFormat(checkedLocale(c.locale ?? (c.indianGrouping ? 'en-IN' : 'en-US')), { style: 'currency', currency: c.code, currencyDisplay: c.display ?? 'symbol', minimumFractionDigits: c.minorDigits, maximumFractionDigits: c.minorDigits, numberingSystem: 'latn' }); }
/** Format the integral part as BigInt; replace fractional digits using exact integer arithmetic. */
export function regionalMoney(value: number, c: CurrencyConfig): string {
    assertMinorUnits(value);
    if (!c.locale && !c.display)
        return formatMinor(value, c);
    const abs = BigInt(Math.abs(value)), base = 10n ** BigInt(c.minorDigits), whole = abs / base;
    const signed = value < 0 ? (whole === 0n ? -0 : -whole) : whole;
    return numberFormat(c).formatToParts(signed).map(p => p.type === 'fraction' ? (abs % base).toString().padStart(c.minorDigits, '0') : p.value).join('');
}
/** Canonical, ungrouped input in the selected decimal convention. */
export function regionalInput(value: number, c: CurrencyConfig): string {
    assertMinorUnits(value);
    const base = 10n ** BigInt(c.minorDigits), abs = BigInt(Math.abs(value));
    const decimal = new Intl.NumberFormat(c.locale ?? 'en-US', { minimumFractionDigits: 1, numberingSystem: 'latn' }).formatToParts(1).find(p => p.type === 'decimal')!.value;
    return (value < 0 ? '-' : '') + (abs / base).toString() + (c.minorDigits ? decimal + (abs % base).toString().padStart(c.minorDigits, '0') : '');
}
export function regionalParse(input: string, c: CurrencyConfig): number {
    if (!c.locale && !c.display)
        return parseAmountToMinor(input, c);
    let s = input.trim();
    const nf = numberFormat(c);
    const numeric = new Intl.NumberFormat(c.locale ?? 'en-US', { numberingSystem: 'latn', minimumFractionDigits: 1 });
    const parts = numeric.formatToParts(1234567.8), group = parts.find(p => p.type === 'group')?.value, decimal = parts.find(p => p.type === 'decimal')!.value;
    const symbols = new Set([c.code, c.symbol, ...nf.formatToParts(0).filter(p => p.type === 'currency').map(p => p.value)]);
    let removed = 0;
    for (const token of [...symbols].sort((a, b) => b.length - a.length)) {
        if (!token)
            continue;
        if (s.includes(token)) {
            s = s.replace(token, '').trim();
            removed++;
        }
    }
    if (removed > 1)
        throw new Error('Use only one currency marker');
    s = s.replace(/[\u200e\u200f\u061c]/g, '').trim();
    let sign = 1;
    if (s[0] === '-' || s[0] === '+') {
        if (s[0] === '-')
            sign = -1;
        s = s.slice(1).trim();
    }
    const fields = s.split(decimal);
    if (fields.length > 2)
        throw new Error('Invalid decimal separator');
    let integer = fields[0], fraction = fields[1] ?? '';
    if (group && /[\u00a0\u202f]/.test(group))
        integer = integer.replace(/[ \u00a0\u202f]/g, group);
    if (group && integer.includes(group)) {
        const raw = integer.split(group).join('');
        if (!/^\d+$/.test(raw))
            throw new Error('Invalid grouping');
        const canonical = new Intl.NumberFormat(c.locale ?? 'en-US', { numberingSystem: 'latn', maximumFractionDigits: 0 }).format(BigInt(raw));
        if (canonical !== integer)
            throw new Error('Invalid grouping');
        integer = raw;
    }
    if (!/^\d+$/.test(integer) || !/^\d*$/.test(fraction) || fraction.length > c.minorDigits)
        throw new Error(`Enter an amount with at most ${c.minorDigits} decimal places`);
    const exact = BigInt(integer) * 10n ** BigInt(c.minorDigits) + BigInt(fraction.padEnd(c.minorDigits, '0') || '0');
    if (exact > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RangeError('Amount exceeds safe integer range');
    return sign * Number(exact);
}
export function regionalDate(value: string, locale = 'en', style: 'short' | 'medium' | 'long' = 'medium'): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error('Invalid date');
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
}
