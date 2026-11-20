import { useSession } from '../application/FolioProvider';
import { regionalMoney, regionalInput, regionalParse, regionalDate } from '../domain/regional';
import type { CurrencyConfig } from '../domain/types';
import {useAmountsHidden} from './privacyDisplay';
const legacy: CurrencyConfig = { code: 'INR', symbol: '₹', minorDigits: 2, indianGrouping: true };
export function usePresentation() {
    const hidden=useAmountsHidden();
    const { controller } = useSession();
    const currency = controller?.getCurrency() ?? legacy;
    return { currency, money: (n: number) => hidden?'••••':regionalMoney(n, currency), inputAmount: (n: number) => regionalInput(n, currency), parseAmount: (s: string) => regionalParse(s, currency), dateLabel: (s: string) => regionalDate(s, currency.locale), monthLabel: (s: string) => new Intl.DateTimeFormat(currency.locale ?? 'en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + '-01T00:00:00Z')) };
}
