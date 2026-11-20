import type { CurrencyConfig } from './types';
const fallback = ['AED', 'AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'INR', 'JPY', 'KRW', 'KWD', 'SAR', 'SGD', 'USD'];
export function currencyCodes(): string[] {
    const intl = Intl as typeof Intl & {
        supportedValuesOf?: (key: string) => string[];
    };
    return intl.supportedValuesOf?.('currency') ?? fallback;
}
export function currencyConfig(code: string, locale = 'en'): CurrencyConfig {
    if (!/^[A-Z]{3}$/.test(code) || !currencyCodes().includes(code))
        throw new Error('Choose a supported currency');
    const nf = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
    return { code, symbol: nf.formatToParts(0).find(p => p.type === 'currency')!.value, minorDigits: nf.resolvedOptions().maximumFractionDigits!, indianGrouping: locale === 'en-IN', locale };
}
export function currencyName(code: string, locale = 'en'): string {
    try {
        return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
    }
    catch {
        return code;
    }
}
